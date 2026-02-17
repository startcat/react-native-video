/* eslint-disable dot-notation */

import { DownloadsManager } from "../../managers/DownloadsManager";
import type { BinaryDownloadTask, StreamDownloadTask } from "../../types";
import { DownloadEventType, DownloadItem, DownloadStates, DownloadType } from "../../types";

// === MOCKS ===

jest.mock("../../managers/QueueManager", () => ({
	queueManager: {
		initialize: jest.fn().mockResolvedValue(undefined),
		addDownloadItem: jest.fn().mockResolvedValue("mock-id"),
		getDownload: jest.fn().mockReturnValue(null),
		getDownloadType: jest.fn().mockReturnValue("STREAM"),
		getAllDownloads: jest.fn().mockReturnValue([]),
		getQueueStats: jest.fn().mockReturnValue({
			total: 0,
			pending: 0,
			downloading: 0,
			paused: 0,
			completed: 0,
			failed: 0,
			isPaused: false,
			isProcessing: false,
			active: 0,
			queued: 0,
			totalBytesDownloaded: 0,
			totalBytesRemaining: 0,
			averageSpeed: 0,
			estimatedTimeRemaining: 0,
		}),
		forceRemoveDownload: jest.fn().mockResolvedValue(undefined),
		forceCleanupOrphanedDownloads: jest.fn().mockResolvedValue(0),
		removeDownload: jest.fn().mockResolvedValue(undefined),
		pauseAll: jest.fn(),
		resumeAll: jest.fn().mockResolvedValue(undefined),
		start: jest.fn(),
		setMaxConcurrent: jest.fn(),
		subscribe: jest.fn().mockReturnValue(() => {}),
		updateConfig: jest.fn(),
		notifyDownloadProgress: jest.fn().mockResolvedValue(undefined),
		notifyDownloadFailed: jest.fn().mockResolvedValue(undefined),
		notifyDownloadCompleted: jest.fn().mockResolvedValue(undefined),
		notifyDownloadPaused: jest.fn().mockResolvedValue(undefined),
		notifyDownloadResumed: jest.fn().mockResolvedValue(undefined),
		notifyDownloadStateChange: jest.fn().mockResolvedValue(undefined),
	},
}));

jest.mock("../../services/download/DownloadService", () => ({
	downloadService: {
		initialize: jest.fn().mockResolvedValue(undefined),
		startDownload: jest.fn().mockResolvedValue(undefined),
		pauseDownload: jest.fn().mockResolvedValue(undefined),
		resumeDownload: jest.fn().mockResolvedValue(undefined),
		cancelDownload: jest.fn().mockResolvedValue(undefined),
		isTypeEnabled: jest.fn().mockReturnValue(true),
		getConfig: jest.fn().mockReturnValue({}),
		enableDownloadType: jest.fn(),
		disableDownloadType: jest.fn(),
	},
}));

jest.mock("../../services/download/StreamDownloadService", () => ({
	streamDownloadService: {
		setNetworkPolicy: jest.fn(),
	},
}));

jest.mock("../../services/download/BinaryDownloadService", () => ({
	binaryDownloadService: {
		setNetworkPolicy: jest.fn(),
	},
}));

jest.mock("../../managers/NativeManager", () => ({
	nativeManager: {
		initialize: jest.fn().mockResolvedValue(undefined),
		removeDownload: jest.fn().mockResolvedValue(undefined),
		startDownloadProcessing: jest.fn().mockResolvedValue(undefined),
		stopDownloadProcessing: jest.fn().mockResolvedValue(undefined),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../managers/ConfigManager", () => ({
	configManager: {
		initialize: jest.fn().mockResolvedValue(undefined),
		getConfig: jest.fn().mockReturnValue({ download_just_wifi: false }),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../managers/ProfileManager", () => ({
	profileManager: {
		initialize: jest.fn().mockResolvedValue(undefined),
		getActiveProfileId: jest.fn().mockReturnValue("profile-1"),
		getActiveProfile: jest
			.fn()
			.mockReturnValue({ id: "profile-1", name: "Test", isChild: false }),
		filterByActiveProfile: jest.fn((items: DownloadItem[]) => items),
		shouldShowContent: jest.fn().mockReturnValue(true),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../services/network/NetworkService", () => ({
	networkService: {
		initialize: jest.fn().mockResolvedValue(undefined),
		isOnline: jest.fn().mockReturnValue(true),
		isWifiConnected: jest.fn().mockReturnValue(true),
		canDownload: jest.fn().mockReturnValue(true),
		getCurrentStatus: jest
			.fn()
			.mockReturnValue({ isConnected: true, isInternetReachable: true }),
		setNetworkPolicy: jest.fn(),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

jest.mock("../../services/storage/StorageService", () => ({
	storageService: {
		initialize: jest.fn().mockResolvedValue(undefined),
		isLowSpace: jest.fn().mockResolvedValue(false),
		getStorageInfo: jest.fn().mockResolvedValue({}),
		getBinariesDirectory: jest.fn().mockReturnValue("/mock/binaries"),
		deleteFile: jest.fn().mockResolvedValue(true),
		subscribe: jest.fn().mockReturnValue(() => {}),
	},
}));

// === IMPORTS DE MOCKS (para jest.mocked) ===

import { configManager } from "../../managers/ConfigManager";
import { nativeManager } from "../../managers/NativeManager";
import { profileManager } from "../../managers/ProfileManager";
import { queueManager } from "../../managers/QueueManager";
import { downloadService } from "../../services/download/DownloadService";
import { storageService } from "../../services/storage/StorageService";

const mockedQueueManager = jest.mocked(queueManager);
const mockedDownloadService = jest.mocked(downloadService);
const mockedNativeManager = jest.mocked(nativeManager);
const mockedConfigManager = jest.mocked(configManager);
const mockedProfileManager = jest.mocked(profileManager);
const mockedStorageService = jest.mocked(storageService);

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

function createMockStreamTask(overrides: Partial<StreamDownloadTask> = {}): StreamDownloadTask {
	return {
		id: `stream-${Date.now()}`,
		manifestUrl: "https://example.com/manifest.m3u8",
		title: "Test Stream",
		config: { type: "HLS" },
		...overrides,
	};
}

function createMockBinaryTask(overrides: Partial<BinaryDownloadTask> = {}): BinaryDownloadTask {
	return {
		id: `binary-${Date.now()}`,
		url: "https://example.com/file.mp4",
		destination: "/mock/binaries/file.mp4",
		title: "Test Binary",
		...overrides,
	};
}

// === TESTS ===

describe("DownloadsManager — Contrato público", () => {
	let manager: DownloadsManager;

	beforeEach(async () => {
		jest.clearAllMocks();
		// @ts-expect-error -- reset singleton for testing
		DownloadsManager["instance"] = undefined;
		manager = DownloadsManager.getInstance();
		await manager.initialize({
			autoStart: false,
			logEnabled: false,
			maxConcurrentDownloads: 3,
		});
	});

	afterEach(() => {
		manager.destroy();
	});

	// --- initialize ---

	describe("initialize", () => {
		it("#1 debe marcar isInitialized como true", () => {
			expect(manager.isInitialized()).toBe(true);
		});

		it("#2 debe ser idempotente (segunda llamada no falla)", async () => {
			await expect(manager.initialize()).resolves.not.toThrow();
			expect(manager.isInitialized()).toBe(true);
		});

		it("#3 debe aplicar config parcial", () => {
			const config = manager.getConfig();
			expect(config.maxConcurrentDownloads).toBe(3);
			expect(config.logEnabled).toBe(false);
			expect(config.autoStart).toBe(false);
		});

		it("#4 debe inicializar sub-servicios", () => {
			expect(mockedQueueManager.initialize).toHaveBeenCalled();
			expect(mockedConfigManager.initialize).toHaveBeenCalled();
			expect(mockedDownloadService.initialize).toHaveBeenCalled();
		});
	});

	// --- addDownload ---

	describe("addDownload", () => {
		it("#5 stream: debe delegar a queueManager.addDownloadItem", async () => {
			const task = createMockStreamTask({ id: "stream-1" });

			await manager.addDownload(task, DownloadType.STREAM);

			expect(mockedQueueManager.addDownloadItem).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "stream-1",
					type: DownloadType.STREAM,
					state: DownloadStates.QUEUED,
				})
			);
		});

		it("#6 binary: debe delegar a queueManager.addDownloadItem con type=BINARY", async () => {
			const task = createMockBinaryTask({ id: "binary-1" });

			await manager.addDownload(task, DownloadType.BINARY);

			expect(mockedQueueManager.addDownloadItem).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "binary-1",
					type: DownloadType.BINARY,
				})
			);
		});

		it("#7 debe lanzar error si el tipo no está habilitado", async () => {
			mockedDownloadService.isTypeEnabled.mockReturnValueOnce(false);
			const task = createMockBinaryTask({ id: "disabled-1" });

			await expect(manager.addDownload(task, DownloadType.BINARY)).rejects.toThrow();
		});

		it("#8 debe lanzar error si no está inicializado", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();
			const task = createMockStreamTask();

			await expect(uninit.addDownload(task, DownloadType.STREAM)).rejects.toThrow();
		});

		it("#9 debe retornar el ID de la tarea", async () => {
			const task = createMockStreamTask({ id: "return-id-1" });

			const result = await manager.addDownload(task, DownloadType.STREAM);

			expect(result).toBe("return-id-1");
		});
	});

	// --- startDownloadNow ---

	describe("startDownloadNow", () => {
		it("#10 debe delegar a downloadService.startDownload", async () => {
			const task = createMockStreamTask({ id: "start-now-1" });

			await manager.startDownloadNow(task, DownloadType.STREAM);

			expect(mockedDownloadService.startDownload).toHaveBeenCalledWith(
				task,
				DownloadType.STREAM
			);
		});

		it("#11 debe lanzar error si no está inicializado", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();
			const task = createMockStreamTask();

			await expect(uninit.startDownloadNow(task, DownloadType.STREAM)).rejects.toThrow();
		});
	});

	// --- removeDownload ---

	describe("removeDownload", () => {
		it("#12 debe cancelar en servicio si está DOWNLOADING", async () => {
			mockedQueueManager.getDownload.mockReturnValueOnce(
				createMockDownloadItem({
					id: "rm-downloading",
					type: DownloadType.STREAM,
					state: DownloadStates.DOWNLOADING,
				})
			);

			await manager.removeDownload("rm-downloading");

			expect(mockedDownloadService.cancelDownload).toHaveBeenCalledWith(
				"rm-downloading",
				DownloadType.STREAM
			);
		});

		it("#13 debe llamar a forceRemoveDownload del queueManager", async () => {
			mockedQueueManager.getDownload.mockReturnValueOnce(
				createMockDownloadItem({
					id: "rm-completed",
					type: DownloadType.STREAM,
					state: DownloadStates.COMPLETED,
				})
			);

			await manager.removeDownload("rm-completed");

			expect(mockedQueueManager.forceRemoveDownload).toHaveBeenCalledWith("rm-completed");
		});

		it("#14 debe limpiar en nativeManager siempre", async () => {
			mockedQueueManager.getDownload.mockReturnValueOnce(
				createMockDownloadItem({ id: "rm-native", state: DownloadStates.COMPLETED })
			);

			await manager.removeDownload("rm-native");

			expect(mockedNativeManager.removeDownload).toHaveBeenCalledWith("rm-native");
		});

		it("#15 no debe fallar si item no existe en queue", async () => {
			mockedQueueManager.getDownload.mockReturnValueOnce(null);

			await expect(manager.removeDownload("nonexistent")).resolves.not.toThrow();
		});

		it("#16 debe eliminar archivo binario completado", async () => {
			mockedQueueManager.getDownload.mockReturnValueOnce(
				createMockDownloadItem({
					id: "rm-binary-completed",
					type: DownloadType.BINARY,
					state: DownloadStates.COMPLETED,
				})
			);

			await manager.removeDownload("rm-binary-completed");

			expect(mockedStorageService.deleteFile).toHaveBeenCalledWith(
				"/mock/binaries/rm-binary-completed"
			);
		});
	});

	// --- pauseDownload ---

	describe("pauseDownload", () => {
		it("#17 debe delegar a downloadService.pauseDownload con id y tipo", async () => {
			mockedQueueManager.getDownloadType.mockReturnValueOnce(DownloadType.STREAM);

			await manager.pauseDownload("pause-1");

			expect(mockedDownloadService.pauseDownload).toHaveBeenCalledWith(
				"pause-1",
				DownloadType.STREAM
			);
		});

		it("#18 debe lanzar error si item no existe", async () => {
			mockedQueueManager.getDownloadType.mockReturnValueOnce(undefined);

			await expect(manager.pauseDownload("nonexistent")).rejects.toThrow();
		});
	});

	// --- resumeDownload ---

	describe("resumeDownload", () => {
		it("#19 stream: debe delegar a downloadService.resumeDownload", async () => {
			mockedQueueManager.getDownloadType.mockReturnValueOnce(DownloadType.STREAM);

			await manager.resumeDownload("resume-stream-1");

			expect(mockedDownloadService.resumeDownload).toHaveBeenCalledWith(
				"resume-stream-1",
				DownloadType.STREAM
			);
		});

		it("#20 binary: debe recrear (remove + add)", async () => {
			mockedQueueManager.getDownloadType.mockReturnValueOnce(DownloadType.BINARY);
			mockedQueueManager.getDownload
				.mockReturnValueOnce(
					createMockDownloadItem({
						id: "resume-binary-1",
						type: DownloadType.BINARY,
						uri: "https://example.com/file.mp4",
						title: "Binary File",
						state: DownloadStates.PAUSED,
					})
				)
				// After removeDownload, getDownload returns null for the removed item
				.mockReturnValueOnce(null);

			await manager.resumeDownload("resume-binary-1");

			// Should have called forceRemoveDownload (via removeDownload)
			expect(mockedNativeManager.removeDownload).toHaveBeenCalledWith("resume-binary-1");
			// Should have re-added to queue
			expect(mockedQueueManager.addDownloadItem).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "resume-binary-1",
					type: DownloadType.BINARY,
					state: DownloadStates.QUEUED,
				})
			);
		});

		it("#21 debe lanzar error si item no existe", async () => {
			mockedQueueManager.getDownloadType.mockReturnValueOnce(undefined);

			await expect(manager.resumeDownload("nonexistent")).rejects.toThrow();
		});
	});

	// --- pauseAll ---

	describe("pauseAll", () => {
		it("#22 debe marcar isPaused = true en state", async () => {
			await manager.pauseAll();

			expect(manager.getState().isPaused).toBe(true);
		});

		it("#23 debe delegar a queueManager.pauseAll", async () => {
			await manager.pauseAll();

			expect(mockedQueueManager.pauseAll).toHaveBeenCalled();
		});

		it("#24 debe pausar binarios activos via downloadService", async () => {
			mockedQueueManager.getAllDownloads.mockReturnValueOnce([
				createMockDownloadItem({
					id: "active-binary-1",
					type: DownloadType.BINARY,
					state: DownloadStates.DOWNLOADING,
				}),
				createMockDownloadItem({
					id: "active-stream-1",
					type: DownloadType.STREAM,
					state: DownloadStates.DOWNLOADING,
				}),
			]);

			await manager.pauseAll();

			expect(mockedDownloadService.pauseDownload).toHaveBeenCalledWith(
				"active-binary-1",
				DownloadType.BINARY
			);
		});

		it("#25 debe detener procesamiento nativo", async () => {
			await manager.pauseAll();

			expect(mockedNativeManager.stopDownloadProcessing).toHaveBeenCalled();
		});

		it("#26 debe lanzar error si no está inicializado", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();

			await expect(uninit.pauseAll()).rejects.toThrow();
		});
	});

	// --- resumeAll ---

	describe("resumeAll", () => {
		it("#27 debe marcar isPaused = false", async () => {
			// First pause, then resume
			await manager.pauseAll();
			jest.clearAllMocks();

			await manager.resumeAll();

			expect(manager.getState().isPaused).toBe(false);
		});

		it("#28 debe limpiar huérfanas antes de reanudar", async () => {
			await manager.resumeAll();

			expect(mockedQueueManager.forceCleanupOrphanedDownloads).toHaveBeenCalled();
		});

		it("#29 debe delegar a queueManager.resumeAll", async () => {
			await manager.resumeAll();

			expect(mockedQueueManager.resumeAll).toHaveBeenCalled();
		});

		it("#30 debe iniciar procesamiento nativo", async () => {
			await manager.resumeAll();

			expect(mockedNativeManager.startDownloadProcessing).toHaveBeenCalled();
		});
	});

	// --- start ---

	describe("start", () => {
		it("#31 debe marcar isProcessing = true en state", async () => {
			await manager.start();

			expect(manager.getState().isProcessing).toBe(true);
		});

		it("#32 debe delegar a queueManager.start", async () => {
			await manager.start();

			expect(mockedQueueManager.start).toHaveBeenCalled();
		});

		it("#33 debe iniciar procesamiento nativo", async () => {
			await manager.start();

			expect(mockedNativeManager.startDownloadProcessing).toHaveBeenCalled();
		});
	});

	// --- stop ---

	describe("stop", () => {
		it("#34 debe llamar a pauseAll internamente", async () => {
			await manager.stop();

			// pauseAll delegates to queueManager.pauseAll
			expect(mockedQueueManager.pauseAll).toHaveBeenCalled();
			expect(mockedNativeManager.stopDownloadProcessing).toHaveBeenCalled();
		});
	});

	// --- getDownloads ---

	describe("getDownloads", () => {
		it("#35 debe delegar a queueManager.getAllDownloads", () => {
			const mockItems = [createMockDownloadItem({ id: "dl-1" })];
			mockedQueueManager.getAllDownloads.mockReturnValueOnce(mockItems);

			const result = manager.getDownloads();

			expect(mockedQueueManager.getAllDownloads).toHaveBeenCalled();
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("dl-1");
		});

		it("#36 debe filtrar por perfil si habilitado", () => {
			const mockItems = [
				createMockDownloadItem({ id: "dl-profile-1" }),
				createMockDownloadItem({ id: "dl-profile-2" }),
			];
			mockedQueueManager.getAllDownloads.mockReturnValueOnce(mockItems);
			mockedProfileManager.filterByActiveProfile.mockReturnValueOnce([mockItems[0]]);

			const result = manager.getDownloads();

			expect(mockedProfileManager.filterByActiveProfile).toHaveBeenCalledWith(mockItems);
			expect(result).toHaveLength(1);
		});

		it("#37 debe retornar [] si no inicializado", () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();

			const result = uninit.getDownloads();

			expect(result).toEqual([]);
		});
	});

	// --- getDownload ---

	describe("getDownload", () => {
		it("#38 debe delegar a queueManager.getDownload", () => {
			const mockItem = createMockDownloadItem({ id: "single-1" });
			mockedQueueManager.getDownload.mockReturnValueOnce(mockItem);

			const result = manager.getDownload("single-1");

			expect(mockedQueueManager.getDownload).toHaveBeenCalledWith("single-1");
			expect(result?.id).toBe("single-1");
		});

		it("#39 debe retornar null si no inicializado", () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();

			const result = uninit.getDownload("any-id");

			expect(result).toBeNull();
		});
	});

	// --- getActiveDownloads / getQueuedDownloads / getCompletedDownloads / getFailedDownloads ---

	describe("filtered download getters", () => {
		const allItems = [
			createMockDownloadItem({ id: "f-1", state: DownloadStates.DOWNLOADING }),
			createMockDownloadItem({ id: "f-2", state: DownloadStates.PREPARING }),
			createMockDownloadItem({ id: "f-3", state: DownloadStates.QUEUED }),
			createMockDownloadItem({ id: "f-4", state: DownloadStates.COMPLETED }),
			createMockDownloadItem({ id: "f-5", state: DownloadStates.FAILED }),
			createMockDownloadItem({ id: "f-6", state: DownloadStates.PAUSED }),
		];

		beforeEach(() => {
			mockedQueueManager.getAllDownloads.mockReturnValue(allItems);
		});

		it("#40 getActiveDownloads filtra por DOWNLOADING/PREPARING", () => {
			const result = manager.getActiveDownloads();

			expect(result).toHaveLength(2);
			expect(result.map(i => i.id)).toEqual(["f-1", "f-2"]);
		});

		it("#41 getQueuedDownloads filtra por QUEUED", () => {
			const result = manager.getQueuedDownloads();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("f-3");
		});

		it("#42 getCompletedDownloads filtra por COMPLETED", () => {
			const result = manager.getCompletedDownloads();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("f-4");
		});

		it("#43 getFailedDownloads filtra por FAILED", () => {
			const result = manager.getFailedDownloads();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("f-5");
		});
	});

	// --- getQueueStats ---

	describe("getQueueStats", () => {
		it("#44 debe retornar stats del queueManager", () => {
			const mockStats = {
				total: 5,
				pending: 1,
				downloading: 2,
				paused: 1,
				completed: 1,
				failed: 0,
				isPaused: false,
				isProcessing: true,
				active: 2,
				queued: 1,
				totalBytesDownloaded: 1000,
				totalBytesRemaining: 5000,
				averageSpeed: 500,
				estimatedTimeRemaining: 10,
			};
			mockedQueueManager.getQueueStats.mockReturnValueOnce(mockStats);

			const stats = manager.getQueueStats();

			expect(stats.total).toBe(5);
			expect(stats.downloading).toBe(2);
		});

		it("#45 cache: segunda llamada inmediata no recalcula", () => {
			mockedQueueManager.getQueueStats.mockReturnValue({
				total: 3,
				pending: 0,
				downloading: 1,
				paused: 0,
				completed: 2,
				failed: 0,
				isPaused: false,
				isProcessing: true,
				active: 1,
				queued: 0,
				totalBytesDownloaded: 0,
				totalBytesRemaining: 0,
				averageSpeed: 0,
				estimatedTimeRemaining: 0,
			});

			manager.getQueueStats();
			manager.getQueueStats();

			// Should only call queueManager.getQueueStats once due to 500ms cache
			expect(mockedQueueManager.getQueueStats).toHaveBeenCalledTimes(1);
		});

		it("#46 sin inicializar: retorna stats vacías", () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();

			const stats = uninit.getQueueStats();

			expect(stats.total).toBe(0);
			expect(stats.downloading).toBe(0);
			expect(stats.pending).toBe(0);
			expect(stats.completed).toBe(0);
			expect(stats.failed).toBe(0);
			expect(stats.paused).toBe(0);
		});
	});

	// --- subscribe ---

	describe("subscribe", () => {
		it("#47 debe retornar función de unsubscribe", () => {
			const unsub = manager.subscribe(DownloadEventType.PROGRESS, jest.fn());

			expect(typeof unsub).toBe("function");
		});

		it("#48 unsubscribe no debe lanzar error", () => {
			const unsub = manager.subscribe(DownloadEventType.PROGRESS, jest.fn());

			expect(() => unsub()).not.toThrow();
		});
	});

	// --- updateConfig / getConfig ---

	describe("updateConfig / getConfig", () => {
		it("#49 debe actualizar config y propagar a queueManager", () => {
			manager.updateConfig({ maxConcurrentDownloads: 5 });

			expect(mockedQueueManager.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					maxConcurrentDownloads: 5,
				})
			);
			expect(manager.getConfig().maxConcurrentDownloads).toBe(5);
		});

		it("#50 getConfig debe retornar copia (no referencia)", () => {
			const config1 = manager.getConfig();
			config1.maxConcurrentDownloads = 999;

			const config2 = manager.getConfig();
			expect(config2.maxConcurrentDownloads).not.toBe(999);
		});

		it("#51 habilitar/deshabilitar tipos propaga a downloadService", () => {
			manager.updateConfig({ enableBinaryDownloads: false });

			expect(mockedDownloadService.disableDownloadType).toHaveBeenCalledWith(
				DownloadType.BINARY
			);

			jest.clearAllMocks();

			manager.updateConfig({ enableStreamDownloads: true });

			expect(mockedDownloadService.enableDownloadType).toHaveBeenCalledWith(
				DownloadType.STREAM
			);
		});
	});

	// --- getState / isInitialized / isProcessing / isPaused ---

	describe("getState / isInitialized / isProcessing / isPaused", () => {
		it("#52 getState debe retornar copia", () => {
			const state1 = manager.getState();
			state1.isInitialized = false;

			const state2 = manager.getState();
			expect(state2.isInitialized).toBe(true);
		});

		it("#53 isInitialized refleja estado real", () => {
			expect(manager.isInitialized()).toBe(true);

			manager.destroy();

			expect(manager.isInitialized()).toBe(false);
		});

		it("#54 isProcessing delega a queueManager.getQueueStats", () => {
			mockedQueueManager.getQueueStats.mockReturnValueOnce({
				total: 1,
				pending: 0,
				downloading: 1,
				paused: 0,
				completed: 0,
				failed: 0,
				isPaused: false,
				isProcessing: true,
				active: 1,
				queued: 0,
				totalBytesDownloaded: 0,
				totalBytesRemaining: 0,
				averageSpeed: 0,
				estimatedTimeRemaining: 0,
			});

			const result = manager.isProcessing();

			expect(result).toBe(true);
			expect(mockedQueueManager.getQueueStats).toHaveBeenCalled();
		});

		it("#55 isPaused delega a queueManager.getQueueStats", () => {
			mockedQueueManager.getQueueStats.mockReturnValueOnce({
				total: 0,
				pending: 0,
				downloading: 0,
				paused: 0,
				completed: 0,
				failed: 0,
				isPaused: true,
				isProcessing: false,
				active: 0,
				queued: 0,
				totalBytesDownloaded: 0,
				totalBytesRemaining: 0,
				averageSpeed: 0,
				estimatedTimeRemaining: 0,
			});

			const result = manager.isPaused();

			expect(result).toBe(true);
			expect(mockedQueueManager.getQueueStats).toHaveBeenCalled();
		});
	});

	// --- cleanupOrphanedDownloads ---

	describe("cleanupOrphanedDownloads", () => {
		it("#56 debe delegar a queueManager.forceCleanupOrphanedDownloads", async () => {
			mockedQueueManager.forceCleanupOrphanedDownloads.mockResolvedValueOnce(2);

			const result = await manager.cleanupOrphanedDownloads();

			expect(mockedQueueManager.forceCleanupOrphanedDownloads).toHaveBeenCalled();
			expect(result).toBe(2);
		});

		it("#57 debe lanzar error si no está inicializado", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			DownloadsManager["instance"] = undefined;
			const uninit = DownloadsManager.getInstance();

			await expect(uninit.cleanupOrphanedDownloads()).rejects.toThrow();
		});
	});

	// --- destroy ---

	describe("destroy", () => {
		it("#58 debe marcar isInitialized = false", () => {
			expect(manager.isInitialized()).toBe(true);

			manager.destroy();

			expect(manager.isInitialized()).toBe(false);
		});

		it("#59 debe limpiar event listeners sin lanzar error", () => {
			expect(() => manager.destroy()).not.toThrow();
		});
	});
});
