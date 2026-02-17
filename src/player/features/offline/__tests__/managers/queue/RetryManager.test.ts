import { RetryManager } from "../../../managers/queue/RetryManager";

describe("RetryManager — Contrato público", () => {
	let retryManager: RetryManager;

	beforeEach(() => {
		jest.useFakeTimers();
		retryManager = new RetryManager({
			maxRetries: 3,
			retryDelayMs: 1000,
			maxDelayMs: 60000,
		});
	});

	afterEach(() => {
		retryManager.destroy();
		jest.useRealTimers();
	});

	// --- shouldRetry ---

	describe("shouldRetry", () => {
		it("#1 retorna true si hay reintentos disponibles", () => {
			expect(retryManager.shouldRetry("d1", new Error("network error"))).toBe(true);
		});

		it("#2 retorna false si se agotaron los reintentos", () => {
			// Simulate 3 retries already done
			retryManager.scheduleRetry("d1", jest.fn());
			retryManager.scheduleRetry("d1", jest.fn());
			retryManager.scheduleRetry("d1", jest.fn());

			expect(retryManager.shouldRetry("d1", new Error("network error"))).toBe(false);
		});

		it("#3 retorna false para errores no reintentables", () => {
			expect(retryManager.shouldRetry("d1", new Error("no space left"))).toBe(false);
		});
	});

	// --- scheduleRetry ---

	describe("scheduleRetry", () => {
		it("#4 programa callback con delay exponencial", () => {
			const callback = jest.fn();

			retryManager.scheduleRetry("d1", callback);
			expect(callback).not.toHaveBeenCalled();

			// First retry: 1000ms * 2^0 = 1000ms
			jest.advanceTimersByTime(1000);
			expect(callback).toHaveBeenCalledTimes(1);

			// Second retry: 1000ms * 2^1 = 2000ms
			const callback2 = jest.fn();
			retryManager.scheduleRetry("d1", callback2);
			jest.advanceTimersByTime(1999);
			expect(callback2).not.toHaveBeenCalled();
			jest.advanceTimersByTime(1);
			expect(callback2).toHaveBeenCalledTimes(1);
		});
	});

	// --- isNonRetryableError ---

	describe("isNonRetryableError", () => {
		it("#5 detecta NO_SPACE_LEFT", () => {
			expect(retryManager.isNonRetryableError({ code: "NO_SPACE_LEFT" })).toBe(true);
			expect(retryManager.isNonRetryableError(new Error("no space left on device"))).toBe(
				true
			);
		});

		it("#6 detecta HTTP 404", () => {
			expect(retryManager.isNonRetryableError(new Error("HTTP 404 Not Found"))).toBe(true);
			expect(retryManager.isNonRetryableError(new Error("file not found"))).toBe(true);
		});

		it("#7 detecta asset validation errors", () => {
			expect(retryManager.isNonRetryableError(new Error("no playable tracks found"))).toBe(
				true
			);
			expect(retryManager.isNonRetryableError(new Error("asset validation failed"))).toBe(
				true
			);
		});

		it("#8 retorna false para errores genéricos", () => {
			expect(retryManager.isNonRetryableError(new Error("network timeout"))).toBe(false);
			expect(retryManager.isNonRetryableError(new Error("connection reset"))).toBe(false);
		});
	});

	// --- clearRetries ---

	describe("clearRetries", () => {
		it("#9 resetea contador de un download", () => {
			retryManager.scheduleRetry("d1", jest.fn());
			retryManager.scheduleRetry("d1", jest.fn());
			expect(retryManager.getRetryCount("d1")).toBe(2);

			retryManager.clearRetries("d1");
			expect(retryManager.getRetryCount("d1")).toBe(0);
		});
	});

	// --- clearRetries timer cleanup ---

	describe("clearRetries — timer cleanup", () => {
		it("#10 cancela timer individual al limpiar retries", () => {
			const callback = jest.fn();
			retryManager.scheduleRetry("d1", callback);

			retryManager.clearRetries("d1");

			// Advance past all possible delays
			jest.advanceTimersByTime(120000);
			expect(callback).not.toHaveBeenCalled();
		});
	});

	// --- destroy ---

	describe("destroy", () => {
		it("#11 cancela todos los timers pendientes", () => {
			const callback = jest.fn();
			retryManager.scheduleRetry("d1", callback);
			retryManager.scheduleRetry("d2", callback);

			retryManager.destroy();

			// Advance past all possible delays
			jest.advanceTimersByTime(120000);
			expect(callback).not.toHaveBeenCalled();
		});

		it("#12 scheduleRetry después de destroy no programa nada", () => {
			retryManager.destroy();

			const callback = jest.fn();
			retryManager.scheduleRetry("d1", callback);

			jest.advanceTimersByTime(120000);
			expect(callback).not.toHaveBeenCalled();
			expect(retryManager.getRetryCount("d1")).toBe(0);
		});
	});

	// --- edge case ---

	describe("edge cases", () => {
		it("#13 delay no excede maxDelayMs (60s)", () => {
			const rm = new RetryManager({
				maxRetries: 20,
				retryDelayMs: 10000,
				maxDelayMs: 60000,
			});

			const callback = jest.fn();

			// Schedule many retries to push delay high
			for (let i = 0; i < 10; i++) {
				rm.scheduleRetry("d1", callback);
			}

			// After 60s the callback should fire (capped at maxDelayMs)
			jest.advanceTimersByTime(60000);
			expect(callback).toHaveBeenCalled();

			rm.destroy();
		});
	});
});
