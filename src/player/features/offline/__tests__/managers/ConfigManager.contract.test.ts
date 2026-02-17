/* eslint-disable dot-notation */

import { LogLevel } from "../../../logger";
import { ConfigManager } from "../../managers/ConfigManager";
import type { ConfigDownloads } from "../../types";

// === MOCKS ===

jest.mock("../../services/storage/PersistenceService", () => ({
	persistenceService: {
		loadDownloadsConfig: jest.fn().mockResolvedValue(null),
		saveDownloadsConfig: jest.fn().mockResolvedValue(undefined),
		clearDownloadsConfig: jest.fn().mockResolvedValue(undefined),
	},
}));

// === IMPORTS DE MOCKS ===

import { persistenceService } from "../../services/storage/PersistenceService";

const mockedPersistence = jest.mocked(persistenceService);

// === DEFAULT VALUES (mirror of ConfigManager internal DEFAULT_CONFIG) ===

const EXPECTED_DEFAULTS: ConfigDownloads = {
	logEnabled: true,
	logLevel: LogLevel.INFO,
	download_just_wifi: true,
	max_concurrent_downloads: 3,
	activeProfileRequired: true,
	auto_resume_on_network: true,
	streamQuality: "auto",
	storage_warning_threshold: 0.85,
	min_free_space_mb: 200,
	retry_attempts: 3,
	retry_delay_ms: 5000,
};

// === TESTS ===

describe("ConfigManager — Contrato público", () => {
	let manager: ConfigManager;

	beforeEach(async () => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		// @ts-expect-error -- reset singleton for testing
		ConfigManager["instance"] = undefined;
		manager = ConfigManager.getInstance();
		await manager.initialize({ logEnabled: false });
	});

	afterEach(() => {
		manager.destroy();
		jest.useRealTimers();
	});

	// --- initialize ---

	describe("initialize", () => {
		it("#1 carga config por defecto si no hay persistida", () => {
			const config = manager.getConfig();

			expect(config.download_just_wifi).toBe(EXPECTED_DEFAULTS.download_just_wifi);
			expect(config.max_concurrent_downloads).toBe(
				EXPECTED_DEFAULTS.max_concurrent_downloads
			);
			expect(config.retry_attempts).toBe(EXPECTED_DEFAULTS.retry_attempts);
			expect(config.streamQuality).toBe(EXPECTED_DEFAULTS.streamQuality);
		});

		it("#2 config persistida → la carga y mergea con defaults", async () => {
			// Reset and re-initialize with persisted config
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			ConfigManager["instance"] = undefined;

			mockedPersistence.loadDownloadsConfig.mockResolvedValueOnce({
				download_just_wifi: false,
				max_concurrent_downloads: 5,
			} as ConfigDownloads);

			const fresh = ConfigManager.getInstance();
			await fresh.initialize({ logEnabled: false });

			const config = fresh.getConfig();
			expect(config.download_just_wifi).toBe(false);
			expect(config.max_concurrent_downloads).toBe(5);
			// Defaults for non-persisted properties
			expect(config.retry_attempts).toBe(EXPECTED_DEFAULTS.retry_attempts);

			fresh.destroy();
		});

		it("#3 idempotente: segunda llamada no falla", async () => {
			await expect(manager.initialize()).resolves.not.toThrow();
		});

		it("#4 aplica ConfigManagerConfig parcial (validateOnUpdate)", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			ConfigManager["instance"] = undefined;

			const fresh = ConfigManager.getInstance();
			await fresh.initialize({ logEnabled: false, validateOnUpdate: true });

			// Validation is active: invalid value should throw
			await expect(
				fresh.updateConfig("max_concurrent_downloads", -1 as unknown as number)
			).rejects.toThrow();

			fresh.destroy();
		});
	});

	// --- getConfig ---

	describe("getConfig", () => {
		it("#5 retorna config actual", () => {
			const config = manager.getConfig();

			expect(config).toEqual(expect.objectContaining(EXPECTED_DEFAULTS));
		});

		it("#6 retorna copia (no referencia)", () => {
			const config1 = manager.getConfig();
			config1.max_concurrent_downloads = 999;

			const config2 = manager.getConfig();
			expect(config2.max_concurrent_downloads).toBe(
				EXPECTED_DEFAULTS.max_concurrent_downloads
			);
		});
	});

	// --- updateConfig ---

	describe("updateConfig", () => {
		it("#7 actualiza propiedad y emite evento", async () => {
			const callback = jest.fn();
			manager.subscribe("config_updated", callback);

			await manager.updateConfig("download_just_wifi", false);

			expect(manager.getConfig().download_just_wifi).toBe(false);
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					property: "download_just_wifi",
					oldValue: true,
					newValue: false,
				})
			);
		});

		it("#8 valor idéntico → no emite evento", async () => {
			const callback = jest.fn();
			manager.subscribe("config_updated", callback);

			await manager.updateConfig("download_just_wifi", true); // Already true

			expect(callback).not.toHaveBeenCalled();
		});

		it("#9 valor inválido max_concurrent_downloads → error", async () => {
			await expect(
				manager.updateConfig("max_concurrent_downloads", -1 as unknown as number)
			).rejects.toThrow();
		});

		it("#10 valor inválido storage_warning_threshold → error", async () => {
			await expect(
				manager.updateConfig("storage_warning_threshold", 2 as unknown as number)
			).rejects.toThrow();
		});

		it("#11 valor inválido → emite config_validation_failed", async () => {
			const callback = jest.fn();
			manager.subscribe("config_validation_failed", callback);

			await manager
				.updateConfig("max_concurrent_downloads", -1 as unknown as number)
				.catch(() => {});

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					property: "max_concurrent_downloads",
					value: -1,
				})
			);
		});

		it("#12 sin inicializar → error", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			ConfigManager["instance"] = undefined;
			const uninit = ConfigManager.getInstance();

			await expect(uninit.updateConfig("download_just_wifi", false)).rejects.toThrow();
		});

		it("#13 persiste tras actualizar (debounce 500ms)", async () => {
			await manager.updateConfig("download_just_wifi", false);

			// Before debounce fires
			expect(mockedPersistence.saveDownloadsConfig).not.toHaveBeenCalled();

			// Advance past debounce
			jest.advanceTimersByTime(500);
			await Promise.resolve(); // flush microtasks

			expect(mockedPersistence.saveDownloadsConfig).toHaveBeenCalled();
		});
	});

	// --- updateMultipleConfig ---

	describe("updateMultipleConfig", () => {
		it("#14 actualiza múltiples propiedades", async () => {
			await manager.updateMultipleConfig({
				download_just_wifi: false,
				max_concurrent_downloads: 5,
				streamQuality: "high",
			});

			const config = manager.getConfig();
			expect(config.download_just_wifi).toBe(false);
			expect(config.max_concurrent_downloads).toBe(5);
			expect(config.streamQuality).toBe("high");
		});

		it("#15 emite evento con property='multiple'", async () => {
			const callback = jest.fn();
			manager.subscribe("config_updated", callback);

			await manager.updateMultipleConfig({
				download_just_wifi: false,
				max_concurrent_downloads: 5,
			});

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					property: "multiple",
				})
			);
		});

		it("#16 sin cambios reales → no emite evento", async () => {
			const callback = jest.fn();
			manager.subscribe("config_updated", callback);

			await manager.updateMultipleConfig({
				download_just_wifi: true, // Already true
				max_concurrent_downloads: 3, // Already 3
			});

			expect(callback).not.toHaveBeenCalled();
		});

		it("#17 algún valor inválido → rechaza todo (atómico)", async () => {
			const originalConfig = manager.getConfig();

			await expect(
				manager.updateMultipleConfig({
					download_just_wifi: false,
					max_concurrent_downloads: -1 as unknown as number, // Invalid
				})
			).rejects.toThrow();

			// Config should not have changed
			expect(manager.getConfig().download_just_wifi).toBe(originalConfig.download_just_wifi);
		});
	});

	// --- convenience methods ---

	describe("convenience methods", () => {
		it("#18 updateStreamQuality delega a updateConfig", async () => {
			await manager.updateStreamQuality("high");

			expect(manager.getConfig().streamQuality).toBe("high");
		});

		it("#19 updateNetworkPolicy delega a updateConfig", async () => {
			await manager.updateNetworkPolicy(false);

			expect(manager.getConfig().download_just_wifi).toBe(false);
		});

		it("#20 updateConcurrentLimit delega a updateConfig", async () => {
			await manager.updateConcurrentLimit(5);

			expect(manager.getConfig().max_concurrent_downloads).toBe(5);
		});

		it("#21 updateAutoResume delega a updateConfig", async () => {
			await manager.updateAutoResume(false);

			expect(manager.getConfig().auto_resume_on_network).toBe(false);
		});

		it("#22 updateStorageThreshold delega a updateConfig", async () => {
			await manager.updateStorageThreshold(0.9);

			expect(manager.getConfig().storage_warning_threshold).toBe(0.9);
		});
	});

	// --- resetToDefaults ---

	describe("resetToDefaults", () => {
		it("#23 restaura valores por defecto", async () => {
			await manager.updateConfig("download_just_wifi", false);
			await manager.updateConfig("max_concurrent_downloads", 7);

			await manager.resetToDefaults();

			const config = manager.getConfig();
			expect(config.download_just_wifi).toBe(true);
			expect(config.max_concurrent_downloads).toBe(3);
		});

		it("#24 emite evento config_reset", async () => {
			const callback = jest.fn();
			manager.subscribe("config_reset", callback);

			await manager.updateConfig("download_just_wifi", false);
			await manager.resetToDefaults();

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					oldConfig: expect.objectContaining({ download_just_wifi: false }),
					newConfig: expect.objectContaining({ download_just_wifi: true }),
				})
			);
		});

		it("#25 sin inicializar → error", async () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			ConfigManager["instance"] = undefined;
			const uninit = ConfigManager.getInstance();

			await expect(uninit.resetToDefaults()).rejects.toThrow();
		});
	});

	// --- clearPersistedConfig ---

	describe("clearPersistedConfig", () => {
		it("#26 llama a persistenceService.clearDownloadsConfig", async () => {
			await manager.clearPersistedConfig();

			expect(mockedPersistence.clearDownloadsConfig).toHaveBeenCalled();
		});

		it("#27 resetea config a defaults", async () => {
			await manager.updateConfig("download_just_wifi", false);
			await manager.clearPersistedConfig();

			expect(manager.getConfig().download_just_wifi).toBe(true);
		});

		it("#28 emite config_reset con reason='cleared_persistence'", async () => {
			const callback = jest.fn();
			manager.subscribe("config_reset", callback);

			await manager.clearPersistedConfig();

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					reason: "cleared_persistence",
				})
			);
		});
	});

	// --- subscribe ---

	describe("subscribe", () => {
		it("#29 retorna función de unsubscribe", () => {
			const unsub = manager.subscribe("config_updated", jest.fn());

			expect(typeof unsub).toBe("function");
		});

		it("#30 unsubscribe detiene notificaciones", async () => {
			const callback = jest.fn();
			const unsub = manager.subscribe("config_updated", callback);

			unsub();

			await manager.updateConfig("download_just_wifi", false);

			expect(callback).not.toHaveBeenCalled();
		});

		it("#31 'all' suscribe a todos los eventos", async () => {
			const callback = jest.fn();
			manager.subscribe("all", callback);

			// Trigger config_updated
			await manager.updateConfig("download_just_wifi", false);
			// Trigger config_reset
			await manager.resetToDefaults();

			// Should have been called for both events
			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("#32 'all' unsubscribe limpia todos", async () => {
			const callback = jest.fn();
			const unsub = manager.subscribe("all", callback);

			unsub();

			await manager.updateConfig("download_just_wifi", false);
			await manager.resetToDefaults();

			expect(callback).not.toHaveBeenCalled();
		});
	});

	// --- getDefaultConfig ---

	describe("getDefaultConfig", () => {
		it("#33 retorna copia de DEFAULT_CONFIG", () => {
			const defaults = ConfigManager.getDefaultConfig();

			expect(defaults).toEqual(EXPECTED_DEFAULTS);

			// Mutating should not affect the static method
			defaults.max_concurrent_downloads = 999;
			const defaults2 = ConfigManager.getDefaultConfig();
			expect(defaults2.max_concurrent_downloads).toBe(3);
		});
	});

	// --- destroy ---

	describe("destroy", () => {
		it("#34 resetea estado y config", () => {
			manager.destroy();

			// Config should be back to defaults
			expect(manager.getConfig()).toEqual(EXPECTED_DEFAULTS);
		});

		it("#35 limpia listeners sin error", () => {
			expect(() => manager.destroy()).not.toThrow();
		});
	});
});
