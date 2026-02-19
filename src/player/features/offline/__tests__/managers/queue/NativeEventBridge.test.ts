import { Logger } from "../../../../logger";
import {
	EventBridgeCallbacks,
	EventBridgeDependencies,
	NativeEventBridge,
} from "../../../managers/queue/NativeEventBridge";
import { DownloadEventType, DownloadStates } from "../../../types";

// Mock Logger
jest.mock("../../../../logger", () => ({
	Logger: jest.fn().mockImplementation(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		updateConfig: jest.fn(),
	})),
}));

describe("NativeEventBridge", () => {
	let bridge: NativeEventBridge;
	let callbacks: EventBridgeCallbacks;
	let deps: EventBridgeDependencies;
	let logger: Logger;

	// Store registered handlers so tests can invoke them
	let nativeHandlers: Map<string, (data: unknown) => void>;
	let binaryHandlers: Map<string, (data: unknown) => void>;

	beforeEach(() => {
		nativeHandlers = new Map();
		binaryHandlers = new Map();

		callbacks = {
			onProgress: jest.fn(),
			onCompleted: jest.fn(),
			onFailed: jest.fn(),
			onStateChanged: jest.fn(),
		};

		deps = {
			nativeManager: {
				subscribe: jest.fn((event: string, cb: (data: unknown) => void) => {
					nativeHandlers.set(event, cb);
					return jest.fn(); // unsubscribe function
				}),
			},
			binaryDownloadService: {
				subscribe: jest.fn((event: string, cb: (data: unknown) => void) => {
					binaryHandlers.set(event, cb);
					return jest.fn(); // unsubscribe function
				}),
			},
			isBeingRemoved: jest.fn().mockReturnValue(false),
			hasDownload: jest.fn().mockReturnValue(true),
			isPaused: jest.fn().mockReturnValue(false),
		};

		logger = new Logger({ enabled: false, level: "error" as any });
		bridge = new NativeEventBridge(deps, callbacks, logger);
		bridge.setup();
	});

	afterEach(() => {
		bridge.teardown();
	});

	// Test 1: Native progress event → onProgress callback
	it("should invoke onProgress when native progress event is received", () => {
		const handler = nativeHandlers.get("download_progress");
		expect(handler).toBeDefined();

		handler!({
			downloadId: "dl-1",
			percent: 50,
			bytesDownloaded: 5000,
			totalBytes: 10000,
			speed: 1000,
			remainingTime: 5,
		});

		expect(callbacks.onProgress).toHaveBeenCalledWith("dl-1", {
			percent: 50,
			bytesDownloaded: 5000,
			totalBytes: 10000,
			speed: 1000,
			remainingTime: 5,
		});
	});

	// Test 2: Native completed event → onCompleted callback
	it("should invoke onCompleted when native completed event is received", () => {
		const handler = nativeHandlers.get("download_completed");
		expect(handler).toBeDefined();

		handler!({
			downloadId: "dl-1",
			fileUri: "/path/to/file.mp4",
			fileSize: 10000,
		});

		expect(callbacks.onCompleted).toHaveBeenCalledWith("dl-1", "/path/to/file.mp4", 10000);
	});

	// Test 3: Native error event → onFailed callback with parsed error
	it("should invoke onFailed when native error event is received", () => {
		const handler = nativeHandlers.get("download_error");
		expect(handler).toBeDefined();

		handler!({
			downloadId: "dl-1",
			error: { code: "NET_ERR", message: "Network error" },
		});

		expect(callbacks.onFailed).toHaveBeenCalledWith(
			"dl-1",
			expect.objectContaining({
				code: "NET_ERR",
				message: "Network error",
			})
		);
	});

	// Test 4: Native state changed event → onStateChanged callback with mapped state
	it("should invoke onStateChanged with mapped state when native state event is received", () => {
		const handler = nativeHandlers.get("download_state_changed");
		expect(handler).toBeDefined();

		handler!({
			downloadId: "dl-1",
			state: "PAUSED",
		});

		expect(callbacks.onStateChanged).toHaveBeenCalledWith(
			"dl-1",
			DownloadStates.PAUSED,
			"PAUSED",
			expect.any(Object)
		);
	});

	// Test 5: Binary progress event → onProgress callback with normalized fields
	it("should invoke onProgress when binary progress event is received (normalizes bytesWritten)", () => {
		const handler = binaryHandlers.get(DownloadEventType.PROGRESS);
		expect(handler).toBeDefined();

		handler!({
			taskId: "bin-1",
			percent: 30,
			bytesWritten: 3000,
			totalBytes: 10000,
			downloadSpeed: 500,
		});

		expect(callbacks.onProgress).toHaveBeenCalledWith("bin-1", {
			percent: 30,
			bytesDownloaded: 3000,
			totalBytes: 10000,
			speed: 500,
		});
	});

	// Test 6: Binary completed event → onCompleted callback
	it("should invoke onCompleted when binary completed event is received", () => {
		const handler = binaryHandlers.get(DownloadEventType.COMPLETED);
		expect(handler).toBeDefined();

		handler!({
			taskId: "bin-1",
			fileUri: "/path/to/binary.zip",
			fileSize: 50000,
		});

		expect(callbacks.onCompleted).toHaveBeenCalledWith("bin-1", "/path/to/binary.zip", 50000);
	});

	// Test 7: Binary error event → onFailed callback
	it("should invoke onFailed when binary error event is received", () => {
		const handler = binaryHandlers.get(DownloadEventType.FAILED);
		expect(handler).toBeDefined();

		handler!({
			taskId: "bin-1",
			error: "Disk full",
			errorCode: "DISK_FULL",
		});

		expect(callbacks.onFailed).toHaveBeenCalledWith(
			"bin-1",
			expect.objectContaining({
				code: "DISK_FULL",
				message: "Disk full",
			})
		);
	});

	// Test 8: isBeingRemoved → events ignored
	it("should NOT invoke callbacks when download is being removed", () => {
		(deps.isBeingRemoved as jest.Mock).mockReturnValue(true);

		const progressHandler = nativeHandlers.get("download_progress");
		progressHandler!({
			downloadId: "dl-removing",
			percent: 50,
			bytesDownloaded: 5000,
			totalBytes: 10000,
		});

		expect(callbacks.onProgress).not.toHaveBeenCalled();
	});

	// Test 9: isPaused → progress events ignored (but others still work)
	it("should NOT invoke onProgress when system is paused", () => {
		(deps.isPaused as jest.Mock).mockReturnValue(true);

		const progressHandler = nativeHandlers.get("download_progress");
		progressHandler!({
			downloadId: "dl-1",
			percent: 50,
			bytesDownloaded: 5000,
			totalBytes: 10000,
		});

		expect(callbacks.onProgress).not.toHaveBeenCalled();

		// But state changes should still work
		const stateHandler = nativeHandlers.get("download_state_changed");
		stateHandler!({ downloadId: "dl-1", state: "COMPLETED" });

		expect(callbacks.onStateChanged).toHaveBeenCalled();
	});

	// Test 10: teardown → listeners unsubscribed
	it("should unsubscribe all listeners on teardown", () => {
		// Get all unsubscribe functions that were returned by subscribe
		const nativeUnsubscribes = (deps.nativeManager.subscribe as jest.Mock).mock.results.map(
			(r: any) => r.value
		);
		const binaryUnsubscribes = (
			deps.binaryDownloadService.subscribe as jest.Mock
		).mock.results.map((r: any) => r.value);

		bridge.teardown();

		// All unsubscribe functions should have been called
		for (const unsub of [...nativeUnsubscribes, ...binaryUnsubscribes]) {
			expect(unsub).toHaveBeenCalled();
		}
	});

	// Test 11: Event without downloadId → callback NOT invoked
	it("should NOT invoke callbacks when event has no downloadId", () => {
		const errorHandler = nativeHandlers.get("download_error");
		errorHandler!({ error: "something" }); // no downloadId or id

		expect(callbacks.onFailed).not.toHaveBeenCalled();
	});

	// Test 12: mapNativeStateToInternal maps all known states
	it("should correctly map all native states to internal states", () => {
		expect(bridge.mapNativeStateToInternal("DOWNLOADING")).toBe(DownloadStates.DOWNLOADING);
		expect(bridge.mapNativeStateToInternal("ACTIVE")).toBe(DownloadStates.DOWNLOADING);
		expect(bridge.mapNativeStateToInternal("QUEUED")).toBe(DownloadStates.QUEUED);
		expect(bridge.mapNativeStateToInternal("PENDING")).toBe(DownloadStates.QUEUED);
		expect(bridge.mapNativeStateToInternal("PAUSED")).toBe(DownloadStates.PAUSED);
		expect(bridge.mapNativeStateToInternal("STOPPED")).toBe(DownloadStates.PAUSED);
		expect(bridge.mapNativeStateToInternal("COMPLETED")).toBe(DownloadStates.COMPLETED);
		expect(bridge.mapNativeStateToInternal("FAILED")).toBe(DownloadStates.FAILED);
		expect(bridge.mapNativeStateToInternal("ERROR")).toBe(DownloadStates.FAILED);
		// Case insensitive
		expect(bridge.mapNativeStateToInternal("downloading")).toBe(DownloadStates.DOWNLOADING);
		// Unknown defaults to QUEUED
		expect(bridge.mapNativeStateToInternal("UNKNOWN_STATE")).toBe(DownloadStates.QUEUED);
	});

	// Test: Native completed event with path field (iOS compatibility)
	it("should use path field as fallback for fileUri in completed events", () => {
		const handler = nativeHandlers.get("download_completed");

		handler!({
			downloadId: "dl-ios",
			path: "/ios/path/to/file.mp4",
		});

		expect(callbacks.onCompleted).toHaveBeenCalledWith(
			"dl-ios",
			"/ios/path/to/file.mp4",
			undefined
		);
	});

	// Test: Native error with string error format
	it("should parse string error format correctly", () => {
		const handler = nativeHandlers.get("download_error");

		handler!({
			downloadId: "dl-1",
			error: "Connection timeout",
			errorCode: "TIMEOUT",
		});

		expect(callbacks.onFailed).toHaveBeenCalledWith(
			"dl-1",
			expect.objectContaining({
				code: "TIMEOUT",
				message: "Connection timeout",
			})
		);
	});

	// Test: Native error with id field instead of downloadId
	it("should extract downloadId from id field when downloadId is missing", () => {
		const handler = nativeHandlers.get("download_error");

		handler!({
			id: "dl-alt",
			errorCode: "ERR",
			errorMessage: "Some error",
		});

		expect(callbacks.onFailed).toHaveBeenCalledWith(
			"dl-alt",
			expect.objectContaining({
				code: "ERR",
				message: "Some error",
			})
		);
	});
});
