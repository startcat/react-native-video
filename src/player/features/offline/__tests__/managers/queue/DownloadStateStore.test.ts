import { DownloadStateStore } from "../../../managers/queue/DownloadStateStore";
import { DownloadItem, DownloadStates, DownloadType } from "../../../types";

// Mock PersistenceService
const mockPersistenceService = {
	saveDownloadState: jest.fn().mockResolvedValue(undefined),
	loadDownloadState: jest.fn().mockResolvedValue(new Map()),
} as any;

// Mock Logger
const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
} as any;

function createTestItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
	return {
		id: overrides.id || "test-1",
		type: overrides.type || DownloadType.BINARY,
		state: overrides.state || DownloadStates.QUEUED,
		url: "https://example.com/file.mp4",
		title: "Test Download",
		profileIds: ["profile-1"],
		fileUri: overrides.fileUri,
		stats: {
			progressPercent: 0,
			bytesDownloaded: 0,
			totalBytes: 1000,
			downloadSpeed: 0,
			remainingTime: 0,
			startedAt: undefined,
			downloadedAt: undefined,
			...(overrides.stats || {}),
		},
		metadata: {},
		createdAt: Date.now(),
		...overrides,
	} as DownloadItem;
}

describe("DownloadStateStore — Contrato público", () => {
	let store: DownloadStateStore;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockPersistenceService.loadDownloadState.mockResolvedValue(new Map());
		store = new DownloadStateStore(mockPersistenceService, mockLogger);
	});

	afterEach(() => {
		store.destroy();
		jest.useRealTimers();
	});

	// --- Test 1: add() ---

	describe("add", () => {
		it("#1 añade item y persiste", async () => {
			const item = createTestItem({ id: "d1" });

			await store.add(item);

			expect(store.has("d1")).toBe(true);
			expect(store.size).toBe(1);
			expect(mockPersistenceService.saveDownloadState).toHaveBeenCalledTimes(1);
		});
	});

	// --- Test 2: remove() ---

	describe("remove", () => {
		it("#2 elimina item y persiste", async () => {
			const item = createTestItem({ id: "d1" });
			await store.add(item);
			jest.clearAllMocks();

			await store.remove("d1");

			expect(store.has("d1")).toBe(false);
			expect(store.size).toBe(0);
			expect(mockPersistenceService.saveDownloadState).toHaveBeenCalledTimes(1);
		});

		it("#13 remove de item inexistente no falla", async () => {
			await store.remove("nonexistent");

			expect(store.size).toBe(0);
			// No debe persistir si no había nada que eliminar
			expect(mockPersistenceService.saveDownloadState).not.toHaveBeenCalled();
		});
	});

	// --- Test 3: set() + get() for state changes ---

	describe("set + get for state changes", () => {
		it("#3 set() actualiza item y get() lo retorna", async () => {
			const item = createTestItem({ id: "d1", state: DownloadStates.QUEUED });
			await store.add(item);

			const raw = store.getRaw("d1")!;
			raw.state = DownloadStates.DOWNLOADING;
			store.set("d1", raw);

			const updated = store.get("d1");
			expect(updated?.state).toBe(DownloadStates.DOWNLOADING);
		});

		it("#3b persist() guarda el estado actual", async () => {
			const item = createTestItem({ id: "d1", state: DownloadStates.QUEUED });
			await store.add(item);
			jest.clearAllMocks();

			const raw = store.getRaw("d1")!;
			raw.state = DownloadStates.DOWNLOADING;
			store.set("d1", raw);
			await store.persist();

			expect(mockPersistenceService.saveDownloadState).toHaveBeenCalledTimes(1);
		});
	});

	// --- Test 4: getRaw() returns mutable reference ---

	describe("getRaw", () => {
		it("#4 getRaw retorna referencia mutable", async () => {
			const item = createTestItem({ id: "d1", state: DownloadStates.DOWNLOADING });
			await store.add(item);

			const raw = store.getRaw("d1")!;
			raw.stats.progressPercent = 50;
			raw.stats.bytesDownloaded = 500;

			// Mutation is visible through get() since getRaw returns the reference
			const updated = store.get("d1");
			expect(updated?.stats.progressPercent).toBe(50);
			expect(updated?.stats.bytesDownloaded).toBe(500);
		});

		it("#4b getRaw retorna undefined para item inexistente", () => {
			expect(store.getRaw("nonexistent")).toBeUndefined();
		});
	});

	// --- Test 5: getAll() deep clones ---

	describe("getAll", () => {
		it("#5 retorna deep clones", async () => {
			const item = createTestItem({ id: "d1" });
			await store.add(item);

			const all = store.getAll();
			expect(all).toHaveLength(1);

			// Mutating the returned item should NOT affect the store
			all[0]!.state = DownloadStates.FAILED;
			const original = store.get("d1");
			expect(original?.state).toBe(DownloadStates.QUEUED);
		});
	});

	// --- Test 6: get() deep clone or null ---

	describe("get", () => {
		it("#6 retorna deep clone o null", async () => {
			const item = createTestItem({ id: "d1" });
			await store.add(item);

			const retrieved = store.get("d1");
			expect(retrieved).not.toBeNull();
			expect(retrieved?.id).toBe("d1");

			// Mutating should not affect store
			retrieved!.state = DownloadStates.FAILED;
			expect(store.get("d1")?.state).toBe(DownloadStates.QUEUED);

			// Non-existent
			expect(store.get("nonexistent")).toBeNull();
		});
	});

	// --- Test 7: getByState() ---

	describe("getByState", () => {
		it("#7 filtra correctamente", async () => {
			await store.add(createTestItem({ id: "d1", state: DownloadStates.QUEUED }));
			await store.add(createTestItem({ id: "d2", state: DownloadStates.DOWNLOADING }));
			await store.add(createTestItem({ id: "d3", state: DownloadStates.COMPLETED }));
			await store.add(createTestItem({ id: "d4", state: DownloadStates.FAILED }));

			const queued = store.getByState([DownloadStates.QUEUED]);
			expect(queued).toHaveLength(1);
			expect(queued[0]!.id).toBe("d1");

			const active = store.getByState([DownloadStates.QUEUED, DownloadStates.DOWNLOADING]);
			expect(active).toHaveLength(2);
		});
	});

	// --- Test 8 & 9: acquireLock / releaseLock ---

	describe("locks", () => {
		it("#8 acquireLock y releaseLock funcionan", () => {
			expect(store.acquireLock("d1", "removing")).toBe(true);
			expect(store.isLocked("d1")).toBe(true);

			store.releaseLock("d1");
			expect(store.isLocked("d1")).toBe(false);
		});

		it("#9 acquireLock deniega si ya hay lock", () => {
			store.acquireLock("d1", "removing");
			expect(store.acquireLock("d1", "updating")).toBe(false);
		});

		it("#10 lock timeout de 30s libera automáticamente", () => {
			store.acquireLock("d1", "removing");
			expect(store.isLocked("d1")).toBe(true);

			jest.advanceTimersByTime(30000);
			expect(store.isLocked("d1")).toBe(false);
		});
	});

	// --- Test 11: clearByState() ---

	describe("clearByState", () => {
		it("#11 elimina items por estado y retorna IDs", async () => {
			await store.add(createTestItem({ id: "d1", state: DownloadStates.COMPLETED }));
			await store.add(createTestItem({ id: "d2", state: DownloadStates.COMPLETED }));
			await store.add(createTestItem({ id: "d3", state: DownloadStates.QUEUED }));
			jest.clearAllMocks();

			const removed = await store.clearByState([DownloadStates.COMPLETED]);

			expect(removed).toEqual(["d1", "d2"]);
			expect(store.size).toBe(1);
			expect(store.has("d3")).toBe(true);
			expect(mockPersistenceService.saveDownloadState).toHaveBeenCalledTimes(1);
		});
	});

	// --- Test 12: loadFromPersistence() ---

	describe("loadFromPersistence", () => {
		it("#12 carga datos guardados y resetea DOWNLOADING a QUEUED", async () => {
			const persistedMap = new Map<string, DownloadItem>();
			persistedMap.set("d1", createTestItem({ id: "d1", state: DownloadStates.DOWNLOADING }));
			persistedMap.set("d2", createTestItem({ id: "d2", state: DownloadStates.COMPLETED }));
			mockPersistenceService.loadDownloadState.mockResolvedValue(persistedMap);

			await store.loadFromPersistence();

			expect(store.size).toBe(2);
			// DOWNLOADING should be reset to QUEUED
			expect(store.get("d1")?.state).toBe(DownloadStates.QUEUED);
			// COMPLETED should remain
			expect(store.get("d2")?.state).toBe(DownloadStates.COMPLETED);
		});
	});

	// --- Test 14: add() con PersistenceService que falla ---

	describe("error handling", () => {
		it("#14 add con PersistenceService que falla propaga error", async () => {
			mockPersistenceService.saveDownloadState.mockRejectedValueOnce(
				new Error("Storage full")
			);

			await expect(store.add(createTestItem({ id: "d1" }))).rejects.toThrow("Storage full");

			// Item was added to memory even if persistence failed
			expect(store.has("d1")).toBe(true);
		});
	});
});
