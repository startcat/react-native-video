import { type IDrm, type IManifest, type IVideoSource } from '../../types';

import { getDRM, getVideoSourceUri } from '../../utils';

import { PlayerError } from '../../core/errors';

export interface TudumClassProps {
	enabled?: boolean;
	getTudumManifest?: () => IManifest | null | undefined;
	getTudumSource?: () => IVideoSource | null | undefined;
	isAutoNext?: boolean;
}

export class TudumClass {
	private _tudumSource: IVideoSource | undefined = undefined;
	private _tudumManifest?: IManifest | null | undefined;
	private _tudumDrm: IDrm | undefined = undefined;

	private _shouldPlay: boolean = false;
	private _isPlaying: boolean = false;
	private _hasPlayed: boolean = false;
	private _isAutoNext: boolean = false;

	constructor(props: TudumClassProps) {
		console.log(`[Player] (TudumClass) constructor: ${JSON.stringify(props)}`);

		this._isAutoNext = !!props.isAutoNext;

		if (props.getTudumSource && typeof props.getTudumSource === 'function') {
			let tudumSource: IVideoSource | null | undefined;

			try {
				tudumSource = props.getTudumSource();
			} catch (error) {
				throw new PlayerError('PLAYER_TUDUM_SOURCE_HOOK_FAILED', {
					originalError: error,
				});
			}

			if (!tudumSource) {
				throw new PlayerError('PLAYER_TUDUM_SOURCE_INVALID', {
					returnedSource: tudumSource,
				});
			}

			if (!tudumSource.uri) {
				throw new PlayerError('PLAYER_TUDUM_SOURCE_INVALID', {
					returnedSource: tudumSource,
					reason: 'Missing URI in tudum source',
				});
			}

			this._tudumSource = tudumSource;
			// Solo habilitar si NO es salto automático
			this._shouldPlay = !!props.enabled && !this._isAutoNext;
		} else if (props.getTudumManifest && typeof props.getTudumManifest === 'function') {
			let tudumManifest: IManifest | null | undefined;

			try {
				tudumManifest = props.getTudumManifest();
			} catch (error) {
				throw new PlayerError('PLAYER_TUDUM_MANIFEST_HOOK_FAILED', {
					originalError: error,
				});
			}

			if (!tudumManifest) {
				throw new PlayerError('PLAYER_TUDUM_MANIFEST_INVALID', {
					returnedManifest: tudumManifest,
				});
			}

			this._tudumManifest = tudumManifest;

			try {
				this._tudumDrm = getDRM(tudumManifest);
			} catch (error) {
				throw new PlayerError('PLAYER_TUDUM_DRM_PROCESSING_FAILED', {
					manifest: tudumManifest,
					originalError: error,
				});
			}

			let tudumUri: string | null;
			try {
				tudumUri = getVideoSourceUri(tudumManifest);
			} catch (error) {
				throw new PlayerError('PLAYER_TUDUM_URI_GENERATION_FAILED', {
					manifest: tudumManifest,
					originalError: error,
				});
			}

			if (!tudumUri) {
				throw new PlayerError('PLAYER_TUDUM_URI_GENERATION_FAILED', {
					manifest: tudumManifest,
					generatedUri: tudumUri,
				});
			}

			this._tudumSource = {
				uri: tudumUri,
			};
			// Solo habilitar si NO es salto automático
			this._shouldPlay = !!props.enabled && !this._isAutoNext;
		} else {
			// Si tudum está deshabilitado o no hay hooks, no es un error
			if (props.enabled === false) {
				console.log("[Player] (TudumClass) Tudum disabled, skipping initialization");
				return;
			}

			throw new PlayerError('PLAYER_TUDUM_CONFIGURATION_INVALID', {
				providedProps: props,
				reason: 'No valid getTudumSource or getTudumManifest hook provided',
			});
		}

		this.getStats();
	}

	updateAutoNextContext = (isAutoNext: boolean) => {
		console.log(`[Player] (TudumClass) updateAutoNextContext: ${isAutoNext}`);
		this._isAutoNext = isAutoNext;

		// Si se marca como autoNext, desactivar reproducción
		if (isAutoNext) {
			this._shouldPlay = false;
		}
	};

	prepareForAutoNext = () => {
		console.log("[Player] (TudumClass) prepareForAutoNext");
		this._isAutoNext = true;
		this._shouldPlay = false;
		this._isPlaying = false;
		// Mantener _hasPlayed como está para evitar que se reproduzca de nuevo
	};

	reset = (keepAutoNextState: boolean = false) => {
		console.log(`[Player] (TudumClass) reset - keepAutoNextState: ${keepAutoNextState}`);
		this._hasPlayed = false;
		this._isPlaying = false;

		if (!keepAutoNextState) {
			this._isAutoNext = false;
		}
	};

	private getStats = () => {
		console.log(
			`[Player] (TudumClass) getStats: ${JSON.stringify({
				source: this._tudumSource,
				drm: this._tudumDrm,
				isReady: this.isReady,
				isPlaying: this._isPlaying,
				hasPlayed: this._hasPlayed,
				isAutoNext: this._isAutoNext,
			})}`
		);
	};

	get source(): IVideoSource | undefined {
		return this._tudumSource;
	}

	get drm(): IDrm | undefined {
		return this._tudumDrm;
	}

	get isReady(): boolean {
		const ready =
			!!this._tudumSource && this._shouldPlay && !this._hasPlayed && !this._isAutoNext;
		console.log(
			`[Player] (TudumClass) isReady: ${ready} (source: ${!!this._tudumSource}, shouldPlay: ${this._shouldPlay}, hasPlayed: ${this._hasPlayed}, isAutoNext: ${this._isAutoNext})`
		);
		return ready;
	}

	get isPlaying(): boolean {
		return this._isPlaying;
	}

	get hasPlayed(): boolean {
		return this._hasPlayed;
	}

	get isAutoNext(): boolean {
		return this._isAutoNext;
	}

	set isPlaying(value: boolean) {
		console.log(
			`[Player] (TudumClass) set isPlaying ${value} - _isPlaying ${this._isPlaying} - _hasPlayed ${this._hasPlayed} - _isAutoNext ${this._isAutoNext}`
		);

		if (!value && this._isPlaying) {
			this._hasPlayed = true;
		}

		this._isPlaying = value;
		console.log(`[Player] (TudumClass) isPlaying ${this._isPlaying}`);
	}
}
