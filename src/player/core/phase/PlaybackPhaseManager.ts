export enum PlaybackPhase {
	IDLE = 'idle',
	LOADING = 'loading',
	AD_PREROLL = 'ad_preroll',
	CONTENT_STARTING = 'content_starting',
	CONTENT_PLAYING = 'content_playing',
	SEEKING = 'seeking',
	CHANGING_SOURCE = 'changing_source',
}

export interface PhaseChangeEvent {
	from: PlaybackPhase;
	to: PlaybackPhase;
	trigger: string;
}

export type PhaseChangeCallback = (event: PhaseChangeEvent) => void;

export interface PlaybackPhaseLogger {
	info: (msg: string) => void;
	warn: (msg: string) => void;
	debug: (msg: string) => void;
}

type TransitionMap = Partial<Record<PlaybackPhase, PlaybackPhase[]>>;

const VALID_TRANSITIONS: TransitionMap = {
	[PlaybackPhase.IDLE]: [
		PlaybackPhase.LOADING,
	],
	[PlaybackPhase.LOADING]: [
		PlaybackPhase.AD_PREROLL,
		PlaybackPhase.CONTENT_STARTING,
		PlaybackPhase.CHANGING_SOURCE,
		PlaybackPhase.IDLE,
	],
	[PlaybackPhase.AD_PREROLL]: [
		PlaybackPhase.CONTENT_STARTING,
		PlaybackPhase.CHANGING_SOURCE,
		PlaybackPhase.IDLE,
	],
	[PlaybackPhase.CONTENT_STARTING]: [
		PlaybackPhase.CONTENT_PLAYING,
		PlaybackPhase.CHANGING_SOURCE,
		PlaybackPhase.IDLE,
	],
	[PlaybackPhase.CONTENT_PLAYING]: [
		PlaybackPhase.SEEKING,
		PlaybackPhase.CHANGING_SOURCE,
		PlaybackPhase.LOADING,
		PlaybackPhase.IDLE,
	],
	[PlaybackPhase.SEEKING]: [
		PlaybackPhase.CONTENT_PLAYING,
		PlaybackPhase.CHANGING_SOURCE,
		PlaybackPhase.IDLE,
	],
	[PlaybackPhase.CHANGING_SOURCE]: [
		PlaybackPhase.LOADING,
		PlaybackPhase.IDLE,
	],
};

export class PlaybackPhaseManager {
	private _currentPhase: PlaybackPhase = PlaybackPhase.IDLE;
	private _subscribers: Set<PhaseChangeCallback> = new Set();
	private _logger?: PlaybackPhaseLogger;

	constructor(logger?: PlaybackPhaseLogger) {
		this._logger = logger;
	}

	getCurrentPhase(): PlaybackPhase {
		return this._currentPhase;
	}

	isPhase(phase: PlaybackPhase): boolean {
		return this._currentPhase === phase;
	}

	isPhaseOneOf(phases: PlaybackPhase[]): boolean {
		return phases.includes(this._currentPhase);
	}

	isAdActive(): boolean {
		return this._currentPhase === PlaybackPhase.AD_PREROLL;
	}

	isContentActive(): boolean {
		return (
			this._currentPhase === PlaybackPhase.CONTENT_STARTING ||
			this._currentPhase === PlaybackPhase.CONTENT_PLAYING
		);
	}

	isSeeking(): boolean {
		return this._currentPhase === PlaybackPhase.SEEKING;
	}

	isChangingSource(): boolean {
		return this._currentPhase === PlaybackPhase.CHANGING_SOURCE;
	}

	transition(to: PlaybackPhase, trigger: string): boolean {
		if (this._currentPhase === to) {
			this._logger?.debug(
				`[PlaybackPhaseManager] No-op: already in ${to} (trigger: ${trigger})`
			);
			return true;
		}

		const validTargets = VALID_TRANSITIONS[this._currentPhase] ?? [];
		if (!validTargets.includes(to)) {
			this._logger?.warn(
				`[PlaybackPhaseManager] Invalid transition: ${this._currentPhase} → ${to} (trigger: ${trigger})`
			);
			return false;
		}

		const from = this._currentPhase;
		this._currentPhase = to;

		this._logger?.info(
			`[PlaybackPhaseManager] ${from} → ${to} (trigger: ${trigger})`
		);

		const event: PhaseChangeEvent = { from, to, trigger };
		this._subscribers.forEach((cb) => {
			try {
				cb(event);
			} catch (e) {
				this._logger?.warn(`[PlaybackPhaseManager] Subscriber threw: ${e}`);
			}
		});

		return true;
	}

	reset(): void {
		if (this._currentPhase === PlaybackPhase.IDLE) {
			return;
		}
		const from = this._currentPhase;
		this._currentPhase = PlaybackPhase.IDLE;

		this._logger?.info(
			`[PlaybackPhaseManager] ${from} → ${PlaybackPhase.IDLE} (trigger: reset)`
		);

		const event: PhaseChangeEvent = {
			from,
			to: PlaybackPhase.IDLE,
			trigger: 'reset',
		};
		this._subscribers.forEach((cb) => {
			try {
				cb(event);
			} catch (e) {
				this._logger?.warn(`[PlaybackPhaseManager] Subscriber threw on reset: ${e}`);
			}
		});
	}

	onPhaseChange(cb: PhaseChangeCallback): () => void {
		this._subscribers.add(cb);
		return () => {
			this._subscribers.delete(cb);
		};
	}
}
