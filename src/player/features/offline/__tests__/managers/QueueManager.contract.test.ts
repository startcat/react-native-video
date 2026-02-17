/* eslint-disable dot-notation */
import { QueueManager } from "../../managers/QueueManager";
import { persistenceService } from "../../services/storage/PersistenceService";
import { DownloadEventType, DownloadItem, DownloadStates, DownloadType } from "../../types";

// === MOCKS ===

jest.mock("../../services/storage/PersistenceService", () => ({
	persistenceService: {
		saveDownloadState: jest.fn().mockResolvedValue(undefined),
		loadDownloadState: jest.fn().mockResolvedValue(new Map()),
		saveProfileMappings: jest.fn().mockResolvedValue(undefined),
		loadProfileMappings: jest.fn().mockResolvedValue(new Map()),
	},
}));

jest.mock("../../services/storage/StorageService", () => ({
	storageService: {
		getBinariesDirectory: jest.fn().mockReturnValue("/mock/binaries"),
		deleteFile: jest.fn().mockResolvedValue(true),
		forceUpdate: jest.fn().mockResolvedValue(undefined),
		invalidateDownloadSpaceCache: jest.fn(),
	},
}));

jest.mock("../../services/network/NetworkService", () => ({
	networkService: {
		isOnline: jest.fn().mockReturnValue(true),
		isWifiConnected: jest.fn().mockReturnValue(true),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../managers/ConfigManager", () => ({
	configManager: {
		getConfig: jest.fn().mockReturnValue({ download_just_wifi: false }),
		initialize: jest.fn().mockResolvedValue(undefined),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../managers/DownloadsManager", () => ({
	downloadsManager: {
		startDownloadNow: jest.fn().mockResolvedValue("mock-id"),
	},
}));

jest.mock("../../managers/NativeManager", () => ({
	nativeManager: {
		subscribe: jest.fn().mockReturnValue(() => {}),
		removeDownload: jest.fn().mockResolvedValue(undefined),
		getDownloads: jest.fn().mockResolvedValue([]),
		initialize: jest.fn().mockResolvedValue(undefined),
	},
}));

jest.mock("../../managers/ProfileManager", () => ({
	profileManager: {
		getActiveProfileId: jest.fn().mockReturnValue("profile-1"),
		initialize: jest.fn().mockResolvedValue(undefined),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../services/download/BinaryDownloadService", () => ({
	binaryDownloadService: {
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../utils/SpeedCalculator", () => ({
	speedCalculator: {
		addSample: jest.fn(),
		getSpeed: jest.fn().mockReturnValue(1024),
		getEstimatedTimeRemaining: jest.fn().mockReturnValue(60),
		clear: jest.fn(),
		clearAll: jest.fn(),
	},
}));

// === HELPERS ===

function createMockDownloadItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
	return {
		id: `download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		title: "Test Download",
		type: DownloadType.STREAM,
		state: DownloadStates.QUEUED,
		uri: "https://example.com/manifest.m3u8",
		profileIds: ["profile-1"],
		stats: {
			bytesDownloaded: 0,
			totalBytes: 0,
			progressPercent: 0,
			retryCount: 0,
		},
		...overrides,
	};
}

// === TESTS ===

describe("QueueManager — Contrato público", () => {
	let queueManager: QueueManager;

	beforeEach(async () => {
		// @ts-expect-error - reset singleton privado para testing
		QueueManager.instance = undefined;
		queueManager = QueueManager.getInstance();
		await queueManager.initialize({
			maxConcurrentDownloads: 3,
			autoProcess: false,
			logEnabled: false,
		});
	});

	afterEach(() => {
		queueManager.destroy();
	});

	// ═══════════════════════════════════════════════════
	// Fase 2: CRUD
	// ═══════════════════════════════════════════════════

	describe("addDownloadItem", () => {
		it("#1 debe añadir un item a la cola y retornar su ID", async () => {
			const item = createMockDownloadItem({ id: "test-add-1" });
			const id = await queueManager.addDownloadItem(item);

			expect(id).toBe("test-add-1");
			expect(queueManager.getDownload("test-add-1")).not.toBeNull();
		});

		it("#2 debe retornar el ID existente si el item ya está en cola", async () => {
			const item = createMockDownloadItem({ id: "test-dup" });
			await queueManager.addDownloadItem(item);
			const id2 = await queueManager.addDownloadItem(item);

			expect(id2).toBe("test-dup");
			expect(queueManager.getAllDownloads()).toHaveLength(1);
		});

		it("#3 debe emitir evento QUEUED al añadir", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.QUEUED, callback);

			const item = createMockDownloadItem({ id: "test-event" });
			await queueManager.addDownloadItem(item);

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					downloadId: "test-event",
					queueSize: 1,
				})
			);
		});

		it("#4 debe lanzar error si no está inicializado", async () => {
			// @ts-expect-error - reset singleton privado para testing
			QueueManager.instance = undefined;
			const uninitQM = QueueManager.getInstance();
			const item = createMockDownloadItem();

			await expect(uninitQM.addDownloadItem(item)).rejects.toThrow();
		});

		it("#5 debe persistir el estado tras añadir", async () => {
			(persistenceService.saveDownloadState as jest.Mock).mockClear();

			const item = createMockDownloadItem();
			await queueManager.addDownloadItem(item);

			expect(persistenceService.saveDownloadState as jest.Mock).toHaveBeenCalled();
		});
	});

	describe("removeDownload", () => {
		it("#6 debe eliminar un item cuando no quedan perfiles", async () => {
			const item = createMockDownloadItem({
				id: "test-remove",
				profileIds: ["profile-1"],
			});
			await queueManager.addDownloadItem(item);
			await queueManager.removeDownload("test-remove", "profile-1");

			expect(queueManager.getDownload("test-remove")).toBeNull();
		});

		it("#7 debe solo quitar el perfil si quedan otros perfiles", async () => {
			const item = createMockDownloadItem({
				id: "test-multi-profile",
				profileIds: ["profile-1", "profile-2"],
			});
			await queueManager.addDownloadItem(item);
			await queueManager.removeDownload("test-multi-profile", "profile-1");

			const result = queueManager.getDownload("test-multi-profile");
			expect(result).not.toBeNull();
			expect(result!.profileIds).not.toContain("profile-1");
			expect(result!.profileIds).toContain("profile-2");
		});

		it("#8 debe emitir REMOVED solo cuando se elimina completamente", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.REMOVED, callback);

			const item = createMockDownloadItem({
				id: "test-remove-event",
				profileIds: ["profile-1"],
			});
			await queueManager.addDownloadItem(item);
			await queueManager.removeDownload("test-remove-event", "profile-1");

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ downloadId: "test-remove-event" })
			);
		});

		it("#9 debe lanzar error si el item no existe", async () => {
			await expect(queueManager.removeDownload("nonexistent", "profile-1")).rejects.toThrow();
		});
	});

	describe("forceRemoveDownload", () => {
		it("#10 debe eliminar sin considerar perfiles", async () => {
			const item = createMockDownloadItem({
				id: "test-force",
				profileIds: ["profile-1", "profile-2"],
			});
			await queueManager.addDownloadItem(item);
			await queueManager.forceRemoveDownload("test-force");

			expect(queueManager.getDownload("test-force")).toBeNull();
		});

		it("#11 no debe lanzar error si el item no existe", async () => {
			await expect(queueManager.forceRemoveDownload("nonexistent")).resolves.not.toThrow();
		});
	});

	// ═══════════════════════════════════════════════════
	// Fase 3: Control
	// ═══════════════════════════════════════════════════

	describe("pauseDownload", () => {
		it("#12 debe cambiar estado de DOWNLOADING a PAUSED", async () => {
			const item = createMockDownloadItem({
				id: "test-pause",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("test-pause", item);

			await queueManager.pauseDownload("test-pause");

			const result = queueManager.getDownload("test-pause");
			expect(result?.state).toBe(DownloadStates.PAUSED);
		});

		it("#13 no debe hacer nada si el estado no es DOWNLOADING", async () => {
			const item = createMockDownloadItem({
				id: "test-pause-queued",
				state: DownloadStates.QUEUED,
			});
			queueManager["downloadQueue"].set("test-pause-queued", item);

			await queueManager.pauseDownload("test-pause-queued");

			const result = queueManager.getDownload("test-pause-queued");
			expect(result?.state).toBe(DownloadStates.QUEUED);
		});
	});

	describe("resumeDownload", () => {
		it("#14 debe cambiar estado de PAUSED a QUEUED", async () => {
			const item = createMockDownloadItem({
				id: "test-resume",
				state: DownloadStates.PAUSED,
			});
			queueManager["downloadQueue"].set("test-resume", item);

			await queueManager.resumeDownload("test-resume");

			const result = queueManager.getDownload("test-resume");
			// Nota: resumeDownload cambia a QUEUED y luego startProcessing() lo cambia a DOWNLOADING
			expect(result?.state).toBe(DownloadStates.DOWNLOADING);
		});
	});

	describe("pauseAll", () => {
		it("#15 debe pausar todas las descargas activas", () => {
			const items = [
				createMockDownloadItem({ id: "dl-1", state: DownloadStates.DOWNLOADING }),
				createMockDownloadItem({ id: "dl-2", state: DownloadStates.DOWNLOADING }),
				createMockDownloadItem({ id: "dl-3", state: DownloadStates.QUEUED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			queueManager.pauseAll();

			expect(queueManager.getDownload("dl-1")?.state).toBe(DownloadStates.PAUSED);
			expect(queueManager.getDownload("dl-2")?.state).toBe(DownloadStates.PAUSED);
		});

		it("#16 no debe afectar QUEUED ni COMPLETED", () => {
			const items = [
				createMockDownloadItem({ id: "dl-q", state: DownloadStates.QUEUED }),
				createMockDownloadItem({ id: "dl-c", state: DownloadStates.COMPLETED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			queueManager.pauseAll();

			expect(queueManager.getDownload("dl-q")?.state).toBe(DownloadStates.QUEUED);
			expect(queueManager.getDownload("dl-c")?.state).toBe(DownloadStates.COMPLETED);
		});
	});

	describe("resumeAll", () => {
		it("#17 debe reanudar todas las PAUSED a QUEUED", async () => {
			const items = [
				createMockDownloadItem({ id: "ra-1", state: DownloadStates.PAUSED }),
				createMockDownloadItem({ id: "ra-2", state: DownloadStates.PAUSED }),
				createMockDownloadItem({ id: "ra-3", state: DownloadStates.COMPLETED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			await queueManager.resumeAll();

			// Nota: resumeAll cambia a QUEUED, luego startProcessing() puede cambiar algunos a DOWNLOADING.
			// El contrato es: ninguno debe seguir en PAUSED.
			expect(queueManager.getDownload("ra-1")?.state).not.toBe(DownloadStates.PAUSED);
			expect(queueManager.getDownload("ra-2")?.state).not.toBe(DownloadStates.PAUSED);
			expect(queueManager.getDownload("ra-3")?.state).toBe(DownloadStates.COMPLETED);
		});
	});

	// ═══════════════════════════════════════════════════
	// Fase 4: Consulta
	// ═══════════════════════════════════════════════════

	describe("getAllDownloads", () => {
		it("#18 debe retornar copias profundas (no referencias)", async () => {
			const item = createMockDownloadItem({ id: "clone-test" });
			await queueManager.addDownloadItem(item);

			const downloads = queueManager.getAllDownloads();
			downloads[0]!.title = "MODIFIED";

			const original = queueManager.getDownload("clone-test");
			expect(original?.title).not.toBe("MODIFIED");
		});

		it("#19 debe retornar array vacío si la cola está vacía", () => {
			expect(queueManager.getAllDownloads()).toEqual([]);
		});
	});

	describe("getQueueStats", () => {
		it("#20 debe retornar estadísticas correctas con mezcla de estados", () => {
			const items = [
				createMockDownloadItem({ id: "s-1", state: DownloadStates.QUEUED }),
				createMockDownloadItem({ id: "s-2", state: DownloadStates.DOWNLOADING }),
				createMockDownloadItem({ id: "s-3", state: DownloadStates.COMPLETED }),
				createMockDownloadItem({ id: "s-4", state: DownloadStates.FAILED }),
				createMockDownloadItem({ id: "s-5", state: DownloadStates.PAUSED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			const stats = queueManager.getQueueStats();

			expect(stats.total).toBe(5);
			expect(stats.pending).toBe(1);
			expect(stats.downloading).toBe(1);
			expect(stats.completed).toBe(1);
			expect(stats.failed).toBe(1);
			expect(stats.paused).toBe(1);
		});

		it("#21 debe retornar stats vacías si la cola está vacía", () => {
			const stats = queueManager.getQueueStats();
			expect(stats.total).toBe(0);
			expect(stats.downloading).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════════
	// Fase 5: Eventos
	// ═══════════════════════════════════════════════════

	describe("subscribe", () => {
		it("#22 debe recibir eventos", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.QUEUED, callback);

			const item = createMockDownloadItem({ id: "sub-1" });
			await queueManager.addDownloadItem(item);

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it("#23 unsubscribe debe funcionar", async () => {
			const callback = jest.fn();
			const unsubscribe = queueManager.subscribe(DownloadEventType.QUEUED, callback);

			const item1 = createMockDownloadItem({ id: "sub-1" });
			await queueManager.addDownloadItem(item1);
			expect(callback).toHaveBeenCalledTimes(1);

			unsubscribe();

			const item2 = createMockDownloadItem({ id: "sub-2" });
			await queueManager.addDownloadItem(item2);
			expect(callback).toHaveBeenCalledTimes(1);
		});
	});

	describe("subscribeToDownload", () => {
		it("#24 debe filtrar eventos por downloadId", async () => {
			const callback = jest.fn();
			queueManager.subscribeToDownload("target-id", callback);

			const targetItem = createMockDownloadItem({
				id: "target-id",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("target-id", targetItem);
			await queueManager.notifyDownloadProgress("target-id", 50, 5000, 10000);

			const otherItem = createMockDownloadItem({
				id: "other-id",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("other-id", otherItem);
			await queueManager.notifyDownloadProgress("other-id", 30, 3000, 10000);

			const targetCalls = callback.mock.calls.filter(
				(call: unknown[]) =>
					(call[0] as { downloadId?: string })?.downloadId === "target-id"
			);
			expect(targetCalls.length).toBeGreaterThan(0);

			const otherCalls = callback.mock.calls.filter(
				(call: unknown[]) => (call[0] as { downloadId?: string })?.downloadId === "other-id"
			);
			expect(otherCalls.length).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════════
	// Fase 6: Notificaciones
	// ═══════════════════════════════════════════════════

	describe("notifyDownloadProgress", () => {
		it("#25 debe actualizar progreso del item", async () => {
			const item = createMockDownloadItem({
				id: "prog-1",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("prog-1", item);

			await queueManager.notifyDownloadProgress("prog-1", 50, 5000, 10000);

			const result = queueManager.getDownload("prog-1");
			expect(result?.stats.progressPercent).toBe(50);
		});

		it("#26 debe emitir evento PROGRESS", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.PROGRESS, callback);

			const item = createMockDownloadItem({
				id: "prog-evt",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("prog-evt", item);

			await queueManager.notifyDownloadProgress("prog-evt", 75, 7500, 10000);

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					downloadId: "prog-evt",
					percent: 75,
				})
			);
		});

		it("#27 no debe lanzar error si el item no existe", async () => {
			await expect(
				queueManager.notifyDownloadProgress("nonexistent", 50, 5000, 10000)
			).resolves.not.toThrow();
		});
	});

	describe("notifyDownloadCompleted", () => {
		it("#28 debe cambiar estado a COMPLETED", async () => {
			const item = createMockDownloadItem({
				id: "comp-1",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("comp-1", item);
			queueManager["currentlyDownloading"].add("comp-1");

			await queueManager.notifyDownloadCompleted("comp-1", "/path/to/file", 10000);

			const result = queueManager.getDownload("comp-1");
			expect(result?.state).toBe(DownloadStates.COMPLETED);
		});

		it("#29 debe tener progressPercent = 100 tras completar", async () => {
			const item = createMockDownloadItem({
				id: "comp-pct",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("comp-pct", item);
			queueManager["currentlyDownloading"].add("comp-pct");

			await queueManager.notifyDownloadCompleted("comp-pct");

			const result = queueManager.getDownload("comp-pct");
			expect(result?.stats.progressPercent).toBe(100);
		});

		it("#30 debe emitir evento COMPLETED", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.COMPLETED, callback);

			const item = createMockDownloadItem({
				id: "comp-evt",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("comp-evt", item);
			queueManager["currentlyDownloading"].add("comp-evt");

			await queueManager.notifyDownloadCompleted("comp-evt");

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ downloadId: "comp-evt" })
			);
		});
	});

	describe("notifyDownloadFailed", () => {
		it("#31 debe marcar como FAILED tras agotar reintentos", async () => {
			const item = createMockDownloadItem({
				id: "fail-1",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("fail-1", item);
			queueManager["currentlyDownloading"].add("fail-1");
			queueManager["retryTracker"].set("fail-1", 10);

			await queueManager.notifyDownloadFailed("fail-1", { message: "Network error" });

			const result = queueManager.getDownload("fail-1");
			expect(result?.state).toBe(DownloadStates.FAILED);
		});

		it("#32 debe deduplicar si ya está en FAILED", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.FAILED, callback);

			const item = createMockDownloadItem({
				id: "fail-dup",
				state: DownloadStates.FAILED,
			});
			queueManager["downloadQueue"].set("fail-dup", item);

			await queueManager.notifyDownloadFailed("fail-dup", { message: "error" });

			expect(callback).not.toHaveBeenCalled();
		});

		it("#33 debe emitir evento FAILED", async () => {
			const callback = jest.fn();
			queueManager.subscribe(DownloadEventType.FAILED, callback);

			const item = createMockDownloadItem({
				id: "fail-evt",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("fail-evt", item);
			queueManager["currentlyDownloading"].add("fail-evt");
			queueManager["retryTracker"].set("fail-evt", 10);

			await queueManager.notifyDownloadFailed("fail-evt", { message: "error" });

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ downloadId: "fail-evt" })
			);
		});
	});

	describe("notifyDownloadPaused", () => {
		it("#34 debe cambiar estado a PAUSED", async () => {
			const item = createMockDownloadItem({
				id: "np-1",
				state: DownloadStates.DOWNLOADING,
			});
			queueManager["downloadQueue"].set("np-1", item);

			await queueManager.notifyDownloadPaused("np-1");

			const result = queueManager.getDownload("np-1");
			expect(result?.state).toBe(DownloadStates.PAUSED);
		});
	});

	describe("notifyDownloadResumed", () => {
		it("#35 debe cambiar estado a DOWNLOADING", async () => {
			const item = createMockDownloadItem({
				id: "nr-1",
				state: DownloadStates.PAUSED,
			});
			queueManager["downloadQueue"].set("nr-1", item);

			await queueManager.notifyDownloadResumed("nr-1");

			const result = queueManager.getDownload("nr-1");
			expect(result?.state).toBe(DownloadStates.DOWNLOADING);
		});
	});

	// ═══════════════════════════════════════════════════
	// Fase 7: Configuración y Gestión de Cola
	// ═══════════════════════════════════════════════════

	describe("setMaxConcurrent", () => {
		it("#36 debe actualizar el límite", () => {
			queueManager.setMaxConcurrent(5);
			expect(queueManager["config"].maxConcurrentDownloads).toBe(5);
		});

		it("#37 debe lanzar error con valor <= 0", () => {
			expect(() => queueManager.setMaxConcurrent(0)).toThrow();
			expect(() => queueManager.setMaxConcurrent(-1)).toThrow();
		});
	});

	describe("reorderQueue", () => {
		it("#38 debe reordenar items según el nuevo orden", async () => {
			const items = [
				createMockDownloadItem({ id: "r-1" }),
				createMockDownloadItem({ id: "r-2" }),
				createMockDownloadItem({ id: "r-3" }),
			];
			for (const item of items) {
				await queueManager.addDownloadItem(item);
			}

			await queueManager.reorderQueue(["r-3", "r-1", "r-2"]);

			const downloads = queueManager.getAllDownloads();
			const ids = downloads.map(d => d.id);
			expect(ids).toEqual(["r-3", "r-1", "r-2"]);
		});
	});

	describe("clearQueue", () => {
		it("#39 debe eliminar todos los items", async () => {
			const items = [
				createMockDownloadItem({ id: "cq-1" }),
				createMockDownloadItem({ id: "cq-2" }),
			];
			for (const item of items) {
				await queueManager.addDownloadItem(item);
			}

			await queueManager.clearQueue();

			expect(queueManager.getAllDownloads()).toHaveLength(0);
		});
	});

	describe("cleanupCompleted", () => {
		it("#40 debe eliminar solo items COMPLETED", async () => {
			const items = [
				createMockDownloadItem({ id: "cc-1", state: DownloadStates.COMPLETED }),
				createMockDownloadItem({ id: "cc-2", state: DownloadStates.QUEUED }),
				createMockDownloadItem({ id: "cc-3", state: DownloadStates.FAILED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			await queueManager.cleanupCompleted();

			expect(queueManager.getDownload("cc-1")).toBeNull();
			expect(queueManager.getDownload("cc-2")).not.toBeNull();
			expect(queueManager.getDownload("cc-3")).not.toBeNull();
		});
	});

	describe("clearFailed", () => {
		it("#41 debe eliminar solo items FAILED", async () => {
			const items = [
				createMockDownloadItem({ id: "cf-1", state: DownloadStates.FAILED }),
				createMockDownloadItem({ id: "cf-2", state: DownloadStates.QUEUED }),
				createMockDownloadItem({ id: "cf-3", state: DownloadStates.COMPLETED }),
			];
			items.forEach(item => {
				queueManager["downloadQueue"].set(item.id, item);
			});

			await queueManager.clearFailed();

			expect(queueManager.getDownload("cf-1")).toBeNull();
			expect(queueManager.getDownload("cf-2")).not.toBeNull();
			expect(queueManager.getDownload("cf-3")).not.toBeNull();
		});
	});
});
