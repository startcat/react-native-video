import {
	type Headers,
	type IDrm,
	type IManifest,
	type IPlayerLogger,
	type IVideoSource,
	STREAM_FORMAT_TYPE,
} from "../../types";

import {
	getContentById,
	getContentIdIsBinary,
	getContentIdIsDownloaded,
	getDRM,
	getManifestSourceType,
} from "../../utils";

import { PlayerError } from "../errors";
import { type ResolvedSources } from "../../features/playlists/types";

import { ComponentLogger, Logger } from "../../features/logger";

export interface onSourceChangedProps {
	id?: number;
	source: IVideoSource | null;
	drm?: IDrm;
	dvrWindowSeconds?: number;
	isLive?: boolean;
	isCast?: boolean;
	isDVR?: boolean;
	isReady?: boolean;
	isFakeVOD?: boolean;
}

export type SourceContext = "local" | "cast" | "download";

export interface SourceClassProps {
	// Player Logger
	logger?: Logger;
	playerLogger?: IPlayerLogger;

	// Metadata
	id?: number;
	title?: string;
	artist?: string;
	subtitle?: string;
	description?: string;
	poster?: string;
	squaredPoster?: string;

	// Source - ResolvedSources (sistema de playlists)
	resolvedSources: ResolvedSources;
	sourceContext?: SourceContext; // Indica qué source usar: local, cast, o download

	startPosition?: number;
	isLive?: boolean;
	isCast?: boolean;
	headers?: Headers;

	// Callbacks
	onSourceChanged?: (data: onSourceChangedProps) => void;
}

export class SourceClass {
	private _currentLogger: ComponentLogger | null = null;
	private _currentManifest: IManifest | undefined = undefined;
	private _drm: IDrm | undefined = undefined;
	private _videoSource: IVideoSource | null = null;

	private _startPosition?: number = 0;

	private _needsLiveInitialSeek: boolean = false;
	private _liveStartProgramTimestamp?: number;
	private _dvrWindowSeconds?: number;

	private _isLive: boolean = false;
	private _isCast: boolean = false;
	private _isDVR: boolean = false;
	private _isHLS: boolean = false;
	private _isDASH: boolean = false;
	private _isReady: boolean = false;
	private _isDownloaded: boolean = false;
	private _isBinary: boolean = false;
	private _isFakeVOD: boolean = false;

	constructor(props: SourceClassProps) {
		if (props.logger) {
			this._currentLogger = props.logger?.forComponent(
				"Source Class",
				props.playerLogger?.core?.enabled,
				props.playerLogger?.core?.level
			);
		}

		// Inicializar con resolvedSources
		if (props.resolvedSources) {
			this.changeSource(props);
		}
	}

	private clearCurrentSource() {
		this._currentManifest = undefined;
		this._drm = undefined;
		this._videoSource = null;

		this._startPosition = 0;
		this._needsLiveInitialSeek = false;

		this._isLive = false;
		this._isCast = false;
		this._isDVR = false;
		this._isHLS = false;
		this._isDASH = false;
		this._isReady = false;
		this._isDownloaded = false;
		this._isBinary = false;
		this._isFakeVOD = false;
	}

	public changeSource(props: SourceClassProps) {
		this._isReady = false;
		this._currentLogger?.debug(
			`changeSource - sourceContext: ${props.sourceContext} (isReady ${!!this._isReady})`
		);

		if (!props.resolvedSources) {
			throw new PlayerError("PLAYER_SOURCE_NO_MANIFESTS_PROVIDED", {
				resolvedSources: props.resolvedSources,
			});
		}

		// Determinar qué source usar según el contexto
		const sourceContext = props.sourceContext || "local";
		let selectedUri: string | null = null;
		let selectedManifest: IManifest | null = null;
		let selectedHeaders: Record<string, string> | undefined = undefined;

		switch (sourceContext) {
			case "download":
				if (props.resolvedSources.download) {
					selectedUri = props.resolvedSources.download.uri;
					// Para download, intentar obtener manifest de local como fallback
					selectedManifest = props.resolvedSources.local?.manifest || null;
				} else if (props.resolvedSources.local) {
					selectedUri = props.resolvedSources.local.uri;
					selectedManifest = props.resolvedSources.local.manifest;
					selectedHeaders = props.resolvedSources.local.headers as
						| Record<string, string>
						| undefined;
				}
				break;
			case "cast":
				if (props.resolvedSources.cast) {
					selectedUri = props.resolvedSources.cast.uri;
					selectedManifest = props.resolvedSources.cast.manifest;
					selectedHeaders = props.resolvedSources.cast.headers as
						| Record<string, string>
						| undefined;
				} else if (props.resolvedSources.local) {
					selectedUri = props.resolvedSources.local.uri;
					selectedManifest = props.resolvedSources.local.manifest;
					selectedHeaders = props.resolvedSources.local.headers as
						| Record<string, string>
						| undefined;
				}
				break;
			case "local":
			default:
				if (props.resolvedSources.local) {
					selectedUri = props.resolvedSources.local.uri;
					selectedManifest = props.resolvedSources.local.manifest;
					selectedHeaders = props.resolvedSources.local.headers as
						| Record<string, string>
						| undefined;
				}
				break;
		}

		if (!selectedUri || !selectedManifest) {
			throw new PlayerError("PLAYER_SOURCE_NO_MANIFEST_FOUND", {
				sourceContext,
				resolvedSources: props.resolvedSources,
			});
		}

		// Usar el manifest del source seleccionado
		this._currentManifest = selectedManifest;

		// Preparamos el DRM adecuado al manifest y plataforma
		this._drm = getDRM(this._currentManifest);

		// Marcamos si es HLS
		this._isHLS = this._currentManifest?.type === STREAM_FORMAT_TYPE.HLS;

		// Marcamos si es DASH
		this._isDASH = this._currentManifest?.type === STREAM_FORMAT_TYPE.DASH;

		// Revisamos si se trata de un Binario descargado
		if (sourceContext === "download") {
			this._isDownloaded = true;
			this._isBinary = !!props.resolvedSources.download?.downloadId;
		} else if (props.id) {
			this._isDownloaded = getContentIdIsDownloaded(props.id);
			this._isBinary = getContentIdIsBinary(props.id);
		}

		// Marcamos si es Live
		this._isLive = !!props.isLive;

		// Marcamos si es Casting
		this._isCast = sourceContext === "cast";

		// Marcamos si es DVR
		this._isDVR =
			this._isLive &&
			typeof this._currentManifest?.dvr_window_minutes === "number" &&
			this._currentManifest?.dvr_window_minutes > 0;

		// Marcamos si es un falso VOD (directo acotado)
		this._isFakeVOD = this.checkFakeVOD(selectedUri);

		this._dvrWindowSeconds =
			this._isDVR && this._currentManifest?.dvr_window_minutes
				? this._currentManifest?.dvr_window_minutes * 60
				: undefined;

		// Marcamos la posición inicial
		this._startPosition = props.startPosition || 0;

		// Usar el URI y headers del source resuelto
		const finalUri = selectedUri;
		const finalHeaders = selectedHeaders || props.headers;

		this._videoSource = {
			id: props.id,
			title: props.title,
			uri: finalUri,
			type: getManifestSourceType(this._currentManifest),
			startPosition: this.calculateStartingPosition(),
			headers: finalHeaders,
			metadata: {
				title: props.title,
				subtitle: props.subtitle,
				artist: props.artist,
				description: props.description,
				imageUri: props.squaredPoster || props.poster,
			},
		};

		// Para contenido descargado, verificar si existe el archivo
		if (this._isDownloaded && this._isBinary && props.id) {
			const offlineBinary = getContentById(props.id);
			this._currentLogger?.debug(`changeSourceFromResolved -> isDownloaded && isBinary`);

			if (!offlineBinary) {
				throw new PlayerError("PLAYER_SOURCE_OFFLINE_CONTENT_NOT_FOUND", {
					contentId: props.id,
				});
			}

			if (!offlineBinary.offlineData?.fileUri) {
				throw new PlayerError("PLAYER_SOURCE_OFFLINE_FILE_URI_INVALID", {
					contentId: props.id,
					offlineData: offlineBinary.offlineData,
				});
			}

			this._videoSource.uri = `file://${offlineBinary.offlineData.fileUri}`;
			this._currentLogger?.debug(`constructed URI:`, this._videoSource.uri);
		}

		this._isReady = true;
		this._currentLogger?.info(`changeSourceFromResolved finished (isReady ${!!this._isReady})`);

		if (props.onSourceChanged && typeof props.onSourceChanged === "function") {
			props.onSourceChanged({
				id: props.id,
				source: this._videoSource,
				drm: this._drm,
				dvrWindowSeconds: this._dvrWindowSeconds,
				isLive: this._isLive,
				isCast: this._isCast,
				isDVR: this._isDVR,
				isFakeVOD: this._isFakeVOD,
				isReady: true,
			});
		}

		this.getStats();
	}

	private checkFakeVOD(url: string): boolean {
		try {
			if (!url || typeof url !== "string") {
				return false;
			}

			const queryIndex = url.indexOf("?");
			if (queryIndex === -1) return false;

			const queryString = url.slice(queryIndex + 1);
			const params: Record<string, string> = {};

			queryString.split("&").forEach(part => {
				const [key, value] = part.split("=");
				if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
			});

			const start = params["start"];
			const end = params["end"];

			return !!start && !!end;
		} catch (error) {
			throw new PlayerError("PLAYER_SOURCE_URL_PARSING_ERROR", {
				url,
				originalError: error,
			});
		}
	}

	private calculateStartingPosition(): number {
		let startPosition = 0;

		if (!this._isLive && this._startPosition && this._startPosition > 0) {
			startPosition = this._startPosition * 1000;
		}

		return startPosition;
	}

	private getStats() {
		const stats = {
			isLive: this._isLive,
			isCast: this._isCast,
			isDVR: this._isDVR,
			isHLS: this._isHLS,
			isDASH: this._isDASH,
			isDownloaded: this._isDownloaded,
			isBinary: this._isBinary,
			isFakeVOD: this._isFakeVOD,
			isReady: this._isReady,
			needsLiveInitialSeek: this._needsLiveInitialSeek,
			liveStartProgramTimestamp: this._liveStartProgramTimestamp,
			dvrWindowSeconds: this._dvrWindowSeconds,
			startPosition: this._startPosition,
			videoSource: this._videoSource,
			drm: this._drm,
			currentManifest: this._currentManifest,
		};

		this._currentLogger?.temp(`getStats: ${JSON.stringify(stats)}`);
	}

	get currentManifest(): IManifest | undefined {
		return this._currentManifest;
	}

	get playerSource(): IVideoSource | null {
		return this._videoSource;
	}

	get playerSourceDrm(): IDrm | undefined {
		return this._drm;
	}

	get dvrWindowSeconds(): number | undefined {
		return this._dvrWindowSeconds;
	}

	get isLive(): boolean {
		return !!this._isLive;
	}

	get isCast(): boolean {
		return !!this._isCast;
	}

	get isDVR(): boolean {
		return !!this._isDVR;
	}

	get isHLS(): boolean {
		return !!this._isHLS;
	}

	get isDASH(): boolean {
		return !!this._isDASH;
	}

	get isDownloaded(): boolean {
		return this._isDownloaded;
	}

	get isBinary(): boolean {
		return this._isBinary;
	}

	get isFakeVOD(): boolean {
		return this._isFakeVOD;
	}

	get isReady(): boolean {
		return this._isReady;
	}

	get needsLiveInitialSeek(): boolean {
		return this._needsLiveInitialSeek;
	}

	set liveStartProgramTimestamp(value: number) {
		this._liveStartProgramTimestamp = value;
	}

	public clearLiveStartProgramTimestamp() {
		this._liveStartProgramTimestamp = undefined;
	}
}
