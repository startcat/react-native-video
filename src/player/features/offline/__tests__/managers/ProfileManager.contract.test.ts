/* eslint-disable dot-notation */

import { ProfileManager } from "../../managers/ProfileManager";
import { DownloadItem, DownloadStates, DownloadType, ProfileEventType } from "../../types";

// === HELPERS ===

function createMockDownloadItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
	return {
		id: `download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		title: "Test Download",
		type: DownloadType.STREAM,
		state: DownloadStates.COMPLETED,
		uri: "https://example.com/manifest.m3u8",
		profileIds: [],
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

describe("ProfileManager — Contrato público", () => {
	let manager: ProfileManager;

	beforeEach(async () => {
		jest.clearAllMocks();
		// @ts-expect-error -- reset singleton for testing
		ProfileManager["instance"] = undefined;
		manager = ProfileManager.getInstance();
		await manager.initialize({ logEnabled: false });
	});

	afterEach(() => {
		manager.destroy();
	});

	// --- initialize ---

	describe("initialize", () => {
		it("#1 inicializa sin perfil activo", () => {
			expect(manager.hasActiveProfile()).toBe(false);
			expect(manager.getActiveProfileId()).toBeNull();
		});

		it("#2 idempotente: segunda llamada no falla", async () => {
			await expect(manager.initialize()).resolves.not.toThrow();
		});
	});

	// --- setActiveProfile / getActiveProfile ---

	describe("setActiveProfile / getActiveProfile", () => {
		it("#3 establece y obtiene perfil", () => {
			manager.setActiveProfile({ id: "p1", name: "Adulto", isChild: false });

			expect(manager.hasActiveProfile()).toBe(true);
			expect(manager.getActiveProfileId()).toBe("p1");
			expect(manager.getActiveProfile()?.name).toBe("Adulto");
		});

		it("#4 null → limpia perfil", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });
			manager.setActiveProfile(null);

			expect(manager.hasActiveProfile()).toBe(false);
			expect(manager.getActiveProfileId()).toBeNull();
		});

		it("#5 emite PROFILE_CHANGED al cambiar", () => {
			const callback = jest.fn();
			manager.subscribe(ProfileEventType.PROFILE_CHANGED, callback);

			manager.setActiveProfile({ id: "p2", name: "Niño", isChild: true });

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					previous: null,
					current: expect.objectContaining({ id: "p2" }),
				})
			);
		});

		it("#6 no emite si mismo ID", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const callback = jest.fn();
			manager.subscribe(ProfileEventType.PROFILE_CHANGED, callback);

			manager.setActiveProfile({ id: "p1", name: "Test Updated", isChild: false });

			expect(callback).not.toHaveBeenCalled();
		});

		it("#7 getActiveProfile retorna copia", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const profile = manager.getActiveProfile();
			if (profile) {
				profile.name = "Modified";
			}

			expect(manager.getActiveProfile()?.name).toBe("Test");
		});
	});

	// --- hasActiveProfile / getActiveProfileId / isChildProfile ---

	describe("hasActiveProfile / getActiveProfileId / isChildProfile", () => {
		it("#8 hasActiveProfile refleja estado", () => {
			expect(manager.hasActiveProfile()).toBe(false);

			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });
			expect(manager.hasActiveProfile()).toBe(true);

			manager.setActiveProfile(null);
			expect(manager.hasActiveProfile()).toBe(false);
		});

		it("#9 getActiveProfileId retorna ID o null", () => {
			expect(manager.getActiveProfileId()).toBeNull();

			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });
			expect(manager.getActiveProfileId()).toBe("p1");
		});

		it("#10 isChildProfile true para perfil infantil", () => {
			manager.setActiveProfile({ id: "child-1", name: "Niño", isChild: true });

			expect(manager.isChildProfile()).toBe(true);
		});

		it("#11 isChildProfile false sin perfil", () => {
			expect(manager.isChildProfile()).toBe(false);
		});
	});

	// --- shouldShowContent ---

	describe("shouldShowContent", () => {
		it("#12 profileIds vacío → visible para todos", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const item = createMockDownloadItem({ profileIds: [] });

			expect(manager.shouldShowContent(item)).toBe(true);
		});

		it("#13 profileIds con perfil activo → visible", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const item = createMockDownloadItem({ profileIds: ["p1", "p2"] });

			expect(manager.shouldShowContent(item)).toBe(true);
		});

		it("#14 profileIds sin perfil activo → no visible", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const item = createMockDownloadItem({ profileIds: ["p2", "p3"] });

			expect(manager.shouldShowContent(item)).toBe(false);
		});

		it("#15 sin perfil activo + profileIds no vacío → false", () => {
			const item = createMockDownloadItem({ profileIds: ["p1"] });

			expect(manager.shouldShowContent(item)).toBe(false);
		});

		it("#16 filtrado desactivado → siempre true", () => {
			manager.setProfileFiltering(false);

			const item = createMockDownloadItem({ profileIds: ["p99"] });

			expect(manager.shouldShowContent(item)).toBe(true);
		});
	});

	// --- canDownload / canDownloadContent ---

	describe("canDownload / canDownloadContent", () => {
		it("#17 canDownload true con perfil activo", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			expect(manager.canDownload()).toBe(true);
		});

		it("#18 canDownload false si requiere perfil y no hay", () => {
			manager.setActiveProfileRequired(true);

			expect(manager.canDownload()).toBe(false);
		});

		it("#19 canDownload true si no requiere perfil", () => {
			manager.setActiveProfileRequired(false);

			expect(manager.canDownload()).toBe(true);
		});

		it("#20 canDownloadContent combina canDownload + shouldShowContent", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const visibleItem = createMockDownloadItem({ profileIds: ["p1"] });
			const hiddenItem = createMockDownloadItem({ profileIds: ["p2"] });

			expect(manager.canDownloadContent(visibleItem)).toBe(true);
			expect(manager.canDownloadContent(hiddenItem)).toBe(false);
		});

		it("#21 canDownload sin inicializar → error", () => {
			manager.destroy();
			// @ts-expect-error -- reset singleton for testing
			ProfileManager["instance"] = undefined;
			const uninit = ProfileManager.getInstance();

			expect(() => uninit.canDownload()).toThrow();
		});
	});

	// --- filterByActiveProfile ---

	describe("filterByActiveProfile", () => {
		it("#22 filtra items por perfil activo", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			const items = [
				createMockDownloadItem({ id: "d1", profileIds: ["p1"] }),
				createMockDownloadItem({ id: "d2", profileIds: ["p2"] }),
				createMockDownloadItem({ id: "d3", profileIds: [] }),
			];

			const result = manager.filterByActiveProfile(items);

			expect(result).toHaveLength(2);
			expect(result.map(i => i.id)).toEqual(["d1", "d3"]);
		});

		it("#23 array vacío → array vacío", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			expect(manager.filterByActiveProfile([])).toEqual([]);
		});

		it("#24 filtrado desactivado → retorna todo", () => {
			manager.setProfileFiltering(false);

			const items = [
				createMockDownloadItem({ id: "d1", profileIds: ["p99"] }),
				createMockDownloadItem({ id: "d2", profileIds: ["p88"] }),
			];

			const result = manager.filterByActiveProfile(items);

			expect(result).toHaveLength(2);
		});
	});

	// --- setProfileFiltering / setActiveProfileRequired ---

	describe("setProfileFiltering / setActiveProfileRequired", () => {
		it("#25 setProfileFiltering emite FILTERING_CHANGED", () => {
			const callback = jest.fn();
			manager.subscribe(ProfileEventType.FILTERING_CHANGED, callback);

			manager.setProfileFiltering(false);

			expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
		});

		it("#26 setActiveProfileRequired emite CONFIG_CHANGED", () => {
			const callback = jest.fn();
			manager.subscribe(ProfileEventType.CONFIG_CHANGED, callback);

			manager.setActiveProfileRequired(false);

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ activeProfileRequired: false })
			);
		});

		it("#27 setActiveProfileRequired cambia comportamiento canDownload", () => {
			// No profile set, required = true → false
			manager.setActiveProfileRequired(true);
			expect(manager.canDownload()).toBe(false);

			// Change to not required → true
			manager.setActiveProfileRequired(false);
			expect(manager.canDownload()).toBe(true);
		});
	});

	// --- subscribe ---

	describe("subscribe", () => {
		it("#28 retorna unsubscribe", () => {
			const unsub = manager.subscribe(ProfileEventType.PROFILE_CHANGED, jest.fn());

			expect(typeof unsub).toBe("function");
		});

		it("#29 unsubscribe detiene notificaciones", () => {
			const callback = jest.fn();
			const unsub = manager.subscribe(ProfileEventType.PROFILE_CHANGED, callback);

			unsub();

			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			expect(callback).not.toHaveBeenCalled();
		});

		it("#30 'all' suscribe a todos los eventos", () => {
			const callback = jest.fn();
			manager.subscribe("all", callback);

			// Trigger PROFILE_CHANGED
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });
			// Trigger FILTERING_CHANGED
			manager.setProfileFiltering(false);
			// Trigger CONFIG_CHANGED
			manager.setActiveProfileRequired(false);

			expect(callback).toHaveBeenCalledTimes(3);
		});
	});

	// --- getContextStats ---

	describe("getContextStats", () => {
		it("#31 retorna datos correctos", () => {
			manager.setActiveProfile({ id: "p1", name: "Adulto", isChild: false });

			const stats = manager.getContextStats();

			expect(stats.hasActiveProfile).toBe(true);
			expect(stats.activeProfileId).toBe("p1");
			expect(stats.activeProfileName).toBe("Adulto");
			expect(stats.isChildProfile).toBe(false);
			expect(stats.filteringEnabled).toBe(true);
			expect(stats.activeProfileRequired).toBe(true);
		});
	});

	// --- destroy ---

	describe("destroy", () => {
		it("#32 limpia perfil y estado", () => {
			manager.setActiveProfile({ id: "p1", name: "Test", isChild: false });

			manager.destroy();

			expect(manager.hasActiveProfile()).toBe(false);
		});

		it("#33 no lanza error", () => {
			expect(() => manager.destroy()).not.toThrow();
		});
	});
});
