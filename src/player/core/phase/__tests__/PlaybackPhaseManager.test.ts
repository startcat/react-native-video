import { PhaseChangeEvent, PlaybackPhase, PlaybackPhaseManager } from "../PlaybackPhaseManager";

describe("PlaybackPhaseManager", () => {
	let manager: PlaybackPhaseManager;

	beforeEach(() => {
		manager = new PlaybackPhaseManager();
	});

	// ─────────────────────────────────────────────
	// Estado inicial
	// ─────────────────────────────────────────────

	describe("estado inicial", () => {
		it("arranca en IDLE", () => {
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
		});

		it("isPhase(IDLE) === true", () => {
			expect(manager.isPhase(PlaybackPhase.IDLE)).toBe(true);
		});

		it("isPhase(LOADING) === false en estado inicial", () => {
			expect(manager.isPhase(PlaybackPhase.LOADING)).toBe(false);
		});
	});

	// ─────────────────────────────────────────────
	// Transiciones válidas
	// ─────────────────────────────────────────────

	describe("transiciones válidas", () => {
		it("IDLE → LOADING", () => {
			expect(manager.transition(PlaybackPhase.LOADING, "source_assigned")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.LOADING);
		});

		it("LOADING → AD_PREROLL (ad started)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			expect(manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.AD_PREROLL);
		});

		it("LOADING → CONTENT_STARTING (ad error antes de onLoad)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			expect(manager.transition(PlaybackPhase.CONTENT_STARTING, "ad_error")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_STARTING);
		});

		it("LOADING → CONTENT_STARTING (onLoad sin ads)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			expect(manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad_no_ads")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_STARTING);
		});

		it("AD_PREROLL → CONTENT_STARTING (CONTENT_RESUME_REQUESTED)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			expect(
				manager.transition(PlaybackPhase.CONTENT_STARTING, "CONTENT_RESUME_REQUESTED")
			).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_STARTING);
		});

		it("AD_PREROLL → CONTENT_STARTING (ERROR)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			expect(manager.transition(PlaybackPhase.CONTENT_STARTING, "ERROR")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_STARTING);
		});

		it("AD_PREROLL → CONTENT_STARTING (ALL_ADS_COMPLETED)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			expect(manager.transition(PlaybackPhase.CONTENT_STARTING, "ALL_ADS_COMPLETED")).toBe(
				true
			);
		});

		it("CONTENT_STARTING → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			expect(
				manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded")
			).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("CONTENT_PLAYING → SEEKING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.transition(PlaybackPhase.SEEKING, "onSeekRequest")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.SEEKING);
		});

		it("SEEKING → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			expect(manager.transition(PlaybackPhase.CONTENT_PLAYING, "seek_confirmed")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("CONTENT_PLAYING → CHANGING_SOURCE (LIVE_START_PROGRAM)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM")).toBe(
				true
			);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CHANGING_SOURCE);
		});

		it("SEEKING → CHANGING_SOURCE (LIVE_START_PROGRAM durante seek)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			expect(manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM")).toBe(
				true
			);
		});

		it("CHANGING_SOURCE → LOADING (nuevo source asignado)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM");
			expect(manager.transition(PlaybackPhase.LOADING, "new_source_assigned")).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.LOADING);
		});

		it("* → IDLE via reset()", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.reset();
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
		});
	});

	// ─────────────────────────────────────────────
	// Transiciones inválidas
	// ─────────────────────────────────────────────

	describe("transiciones inválidas", () => {
		it("IDLE → CONTENT_PLAYING retorna false", () => {
			expect(manager.transition(PlaybackPhase.CONTENT_PLAYING, "invalid")).toBe(false);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
		});

		it("AD_PREROLL → CONTENT_PLAYING retorna false (debe pasar por CONTENT_STARTING)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			expect(manager.transition(PlaybackPhase.CONTENT_PLAYING, "invalid")).toBe(false);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.AD_PREROLL);
		});

		it("SEEKING → AD_PREROLL retorna false", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			expect(manager.transition(PlaybackPhase.AD_PREROLL, "invalid")).toBe(false);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.SEEKING);
		});

		it("CHANGING_SOURCE → CONTENT_PLAYING retorna false (debe pasar por LOADING)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM");
			expect(manager.transition(PlaybackPhase.CONTENT_PLAYING, "invalid")).toBe(false);
		});
	});

	// ─────────────────────────────────────────────
	// Helpers de consulta
	// ─────────────────────────────────────────────

	describe("helpers de consulta", () => {
		it("isAdActive() true solo en AD_PREROLL", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			expect(manager.isAdActive()).toBe(false);
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			expect(manager.isAdActive()).toBe(true);
			manager.transition(PlaybackPhase.CONTENT_STARTING, "ERROR");
			expect(manager.isAdActive()).toBe(false);
		});

		it("isContentActive() true en CONTENT_STARTING y CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			expect(manager.isContentActive()).toBe(false);
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			expect(manager.isContentActive()).toBe(true);
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.isContentActive()).toBe(true);
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			expect(manager.isContentActive()).toBe(false);
		});

		it("isSeeking() true solo en SEEKING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.isSeeking()).toBe(false);
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			expect(manager.isSeeking()).toBe(true);
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "seek_confirmed");
			expect(manager.isSeeking()).toBe(false);
		});

		it("isChangingSource() true solo en CHANGING_SOURCE", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.isChangingSource()).toBe(false);
			manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM");
			expect(manager.isChangingSource()).toBe(true);
			manager.transition(PlaybackPhase.LOADING, "new_source");
			expect(manager.isChangingSource()).toBe(false);
		});

		it("isPhaseOneOf() retorna true si la fase actual está en el array", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			expect(
				manager.isPhaseOneOf([
					PlaybackPhase.CONTENT_STARTING,
					PlaybackPhase.CONTENT_PLAYING,
				])
			).toBe(true);
			expect(manager.isPhaseOneOf([PlaybackPhase.SEEKING, PlaybackPhase.IDLE])).toBe(false);
		});
	});

	// ─────────────────────────────────────────────
	// Ciclos completos
	// ─────────────────────────────────────────────

	describe("ciclos completos", () => {
		it("ciclo feliz sin ads: IDLE → LOADING → CONTENT_STARTING → CONTENT_PLAYING", () => {
			expect(manager.transition(PlaybackPhase.LOADING, "source_assigned")).toBe(true);
			expect(manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad_no_ads")).toBe(true);
			expect(
				manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded")
			).toBe(true);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("ciclo con ad exitoso: IDLE → LOADING → AD_PREROLL → CONTENT_STARTING → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "CONTENT_RESUME_REQUESTED");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("ciclo con ad error: IDLE → LOADING → CONTENT_STARTING (ad ERROR) → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "ad_error");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("ciclo CCMA-2699: CONTENT_PLAYING → CHANGING_SOURCE → LOADING → CONTENT_STARTING (2º ad error)", () => {
			// Primer ciclo
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "ad_error");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			// LIVE_START_PROGRAM
			manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM");
			manager.transition(PlaybackPhase.LOADING, "new_source_assigned");
			// Segundo ad error
			manager.transition(PlaybackPhase.CONTENT_STARTING, "ad_error_second_cycle");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("ciclo LIVE_START_PROGRAM con ad exitoso: CONTENT_PLAYING → CHANGING_SOURCE → LOADING → AD_PREROLL → CONTENT_STARTING → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE_START_PROGRAM");
			manager.transition(PlaybackPhase.LOADING, "new_source_assigned");
			manager.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "CONTENT_RESUME_REQUESTED");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});

		it("ciclo con seek manual: CONTENT_PLAYING → SEEKING → CONTENT_PLAYING", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "onProgress_contentLoaded");
			manager.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "seek_confirmed");
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.CONTENT_PLAYING);
		});
	});

	// ─────────────────────────────────────────────
	// onPhaseChange
	// ─────────────────────────────────────────────

	describe("onPhaseChange", () => {
		it("notifica al suscriptor en cada transición válida", () => {
			const events: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events.push(e));

			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");

			expect(events).toHaveLength(2);
			expect(events[0]).toEqual({
				from: PlaybackPhase.IDLE,
				to: PlaybackPhase.LOADING,
				trigger: "source_assigned",
			});
			expect(events[1]).toEqual({
				from: PlaybackPhase.LOADING,
				to: PlaybackPhase.CONTENT_STARTING,
				trigger: "onLoad",
			});
		});

		it("no notifica en transición inválida", () => {
			const events: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events.push(e));

			manager.transition(PlaybackPhase.CONTENT_PLAYING, "invalid");

			expect(events).toHaveLength(0);
		});

		it("la función de unsuscripción elimina el callback", () => {
			const events: PhaseChangeEvent[] = [];
			const unsub = manager.onPhaseChange(e => events.push(e));

			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			unsub();
			manager.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");

			expect(events).toHaveLength(1);
		});

		it("múltiples suscriptores reciben la notificación", () => {
			const events1: PhaseChangeEvent[] = [];
			const events2: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events1.push(e));
			manager.onPhaseChange(e => events2.push(e));

			manager.transition(PlaybackPhase.LOADING, "source_assigned");

			expect(events1).toHaveLength(1);
			expect(events2).toHaveLength(1);
		});

		it("no notifica en transición a la misma fase (no-op)", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");

			const events: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events.push(e));

			manager.transition(PlaybackPhase.LOADING, "duplicate");

			expect(events).toHaveLength(0);
		});
	});

	// ─────────────────────────────────────────────
	// reset()
	// ─────────────────────────────────────────────

	describe("reset()", () => {
		it("vuelve a IDLE desde cualquier fase", () => {
			const phases = [
				PlaybackPhase.LOADING,
				PlaybackPhase.AD_PREROLL,
				PlaybackPhase.CONTENT_STARTING,
				PlaybackPhase.CONTENT_PLAYING,
			];

			for (const phase of phases) {
				const m = new PlaybackPhaseManager();
				// Llegar a la fase usando la ruta más corta posible
				m.transition(PlaybackPhase.LOADING, "setup");
				if (
					phase === PlaybackPhase.AD_PREROLL ||
					phase === PlaybackPhase.CONTENT_STARTING ||
					phase === PlaybackPhase.CONTENT_PLAYING
				) {
					m.transition(PlaybackPhase.CONTENT_STARTING, "setup");
				}
				if (phase === PlaybackPhase.CONTENT_PLAYING) {
					m.transition(PlaybackPhase.CONTENT_PLAYING, "setup");
				}
				if (phase === PlaybackPhase.AD_PREROLL) {
					const m2 = new PlaybackPhaseManager();
					m2.transition(PlaybackPhase.LOADING, "setup");
					m2.transition(PlaybackPhase.AD_PREROLL, "setup");
					m2.reset();
					expect(m2.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
					continue;
				}
				m.reset();
				expect(m.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
			}
		});

		it("notifica a suscriptores en reset()", () => {
			manager.transition(PlaybackPhase.LOADING, "source_assigned");
			manager.transition(PlaybackPhase.CONTENT_PLAYING, "setup");

			const events: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events.push(e));

			manager.reset();

			expect(events).toHaveLength(1);
			expect(events[0]!.to).toBe(PlaybackPhase.IDLE);
			expect(events[0]!.trigger).toBe("reset");
		});

		it("reset() en IDLE es no-op (no notifica)", () => {
			const events: PhaseChangeEvent[] = [];
			manager.onPhaseChange(e => events.push(e));

			manager.reset();

			expect(events).toHaveLength(0);
			expect(manager.getCurrentPhase()).toBe(PlaybackPhase.IDLE);
		});
	});
});
