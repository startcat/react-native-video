import {
	type Headers,
	type IDrm,
	type IManifest,
	type IVideoSource,
	STREAM_FORMAT_TYPE,
} from "../../types";

import { getBestManifest, getDRM, getManifestSourceType, getVideoSourceUri } from "../../utils";

import { PlayerError } from "../../core/errors";
import { downloadsManager } from "../../features/offline/managers/DownloadsManager";
import { DownloadStates, DownloadType, DownloadedSubtitleItem } from "../../features/offline/types";

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

export interface SourceClassProps {
	// Metadata
	id?: number;
	title?: string;
	artist?: string;
	subtitle?: string;
	description?: string;
	poster?: string;
	squaredPoster?: string;

	// Source
	manifests?: Array<IManifest>;
	startPosition?: number;
	isLive?: boolean;
	isCast?: boolean;
	headers?: Headers;

	// Callbacks
	getBestManifest?: (
		manifests: Array<IManifest>,
		isCasting?: boolean,
		isLive?: boolean
	) => IManifest | undefined;
	getSourceUri?: (
		manifest: IManifest,
		dvrWindowMinutes?: number,
		liveStartProgramTimestamp?: number
	) => string;
	onSourceChanged?: (data: onSourceChangedProps) => void;
}

const LOG_TAG = "[SourceClass]";

// [OFFLINE DEBUG] Flag para forzar la detección de contenido offline para testing
// Cambiar a true para simular que el contenido está descargado
const FORCE_OFFLINE_PLAYBACK_DEBUG = false;

export class SourceClass {
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
	private _offlineSubtitles: DownloadedSubtitleItem[] = [];

	private _getBestManifest: (
		manifests: Array<IManifest>,
		isCasting?: boolean,
		isLive?: boolean
	) => IManifest | undefined;
	private _getSourceUri?: (
		manifest: IManifest,
		dvrWindowMinutes?: number,
		liveStartProgramTimestamp?: number
	) => string;

	constructor(props: SourceClassProps) {
		this._getSourceUri = props.getSourceUri;

		if (props.getBestManifest && typeof props.getBestManifest === "function") {
			this._getBestManifest = props.getBestManifest;
		} else {
			this._getBestManifest = getBestManifest;
		}

		if (props.manifests && props.manifests.length > 0) {
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
		this._offlineSubtitles = [];
	}

	public changeSource(props: SourceClassProps) {
		this._isReady = false;
		console.log(`${LOG_TAG} changeSource (isReady ${!!this._isReady})`);

		if (!props.manifests || props.manifests.length === 0) {
			this.clearCurrentSource();
			throw new PlayerError("PLAYER_SOURCE_NO_MANIFESTS_PROVIDED", {
				providedManifests: props.manifests,
			});
		}

		// Cogemos el manifest adecuado
		this._currentManifest = this._getBestManifest(props.manifests, props.isCast, props.isLive);

		if (!this._currentManifest) {
			this.clearCurrentSource();
			throw new PlayerError("PLAYER_SOURCE_NO_MANIFEST_FOUND", {
				availableManifests: props.manifests,
				isCast: props.isCast,
				isLive: props.isLive,
			});
		}

		// Preparamos el DRM adecuado al manifest y plataforma
		this._drm = getDRM(this._currentManifest);

		// Marcamos si es HLS
		this._isHLS = this._currentManifest?.type === STREAM_FORMAT_TYPE.HLS;

		// Marcamos si es DASH
		this._isDASH = this._currentManifest?.type === STREAM_FORMAT_TYPE.DASH;

		// Revisamos si se trata de un Binario descargado
		let downloadItem = null;
		if (props.id) {
			console.log(`${LOG_TAG} [OFFLINE DEBUG] Checking download for id: ${props.id}`);
			console.log(
				`${LOG_TAG} [OFFLINE DEBUG] FORCE_OFFLINE_PLAYBACK_DEBUG: ${FORCE_OFFLINE_PLAYBACK_DEBUG}`
			);

			downloadItem = downloadsManager.getDownload(props.id?.toString() || "");

			if (downloadItem) {
				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] Download item found:`,
					JSON.stringify(
						{
							id: downloadItem.id,
							title: downloadItem.title,
							state: downloadItem.state,
							type: downloadItem.type,
							fileUri: downloadItem.fileUri,
							uri: downloadItem.uri,
							subtitlesCount: downloadItem.subtitles?.length || 0,
						},
						null,
						2
					)
				);

				// Está descargado si el estado es COMPLETED (o forzado para debug)
				this._isDownloaded =
					downloadItem.state === DownloadStates.COMPLETED || FORCE_OFFLINE_PLAYBACK_DEBUG;

				// Es binario si el tipo es BINARY
				this._isBinary = downloadItem.type === DownloadType.BINARY;

				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] isDownloaded: ${this._isDownloaded}, isBinary: ${this._isBinary}`
				);

				if (FORCE_OFFLINE_PLAYBACK_DEBUG) {
					console.log(
						`${LOG_TAG} [OFFLINE DEBUG] ⚠️ FORCED OFFLINE MODE ENABLED FOR TESTING`
					);
				}
			} else {
				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] No download item found for id: ${props.id}`
				);
				this._isDownloaded = false;
				this._isBinary = false;
			}
		}

		// Marcamos si es Live
		this._isLive = !!props.isLive;

		// Marcamos si es Casting
		this._isCast = !!props.isCast;

		// Marcamos si es DVR
		this._isDVR =
			this._isLive &&
			typeof this._currentManifest?.dvr_window_minutes === "number" &&
			this._currentManifest?.dvr_window_minutes > 0;

		// Marcamos si es un falso VOD (directo acotado)
		this._isFakeVOD = this.checkFakeVOD(this._currentManifest?.manifestURL || "");

		this._dvrWindowSeconds =
			this._isDVR && this._currentManifest?.dvr_window_minutes
				? this._currentManifest?.dvr_window_minutes * 60
				: undefined;

		// Marcamos la posición inicial
		this._startPosition = props.startPosition || 0;

		this._videoSource = {
			id: props.id,
			title: props.title,
			uri: this.calculateSourceUri() || this._currentManifest?.manifestURL,
			type: getManifestSourceType(this._currentManifest),
			startPosition: this.calculateStartingPosition(),
			headers: props.headers,
			metadata: {
				title: props.title,
				subtitle: props.subtitle,
				artist: props.artist,
				description: props.description,
				imageUri: props.squaredPoster || props.poster,
			},
		};

		// Manejo de contenido descargado
		if (downloadItem && this._isDownloaded) {
			console.log(`${LOG_TAG} [OFFLINE DEBUG] changeSource -> isDownloaded: true`);
			console.log(`${LOG_TAG} [OFFLINE DEBUG] downloadItem.type: "${downloadItem.type}"`);
			console.log(
				`${LOG_TAG} [OFFLINE DEBUG] downloadItem.fileUri: "${downloadItem.fileUri}"`
			);
			console.log(
				`${LOG_TAG} [OFFLINE DEBUG] downloadItem full data:`,
				JSON.stringify(downloadItem, null, 2)
			);

			if (this._isBinary) {
				// BINARY downloads: usar fileUri directamente
				console.log(`${LOG_TAG} [OFFLINE DEBUG] Processing BINARY download`);

				if (!downloadItem.fileUri) {
					console.error(
						`${LOG_TAG} [OFFLINE DEBUG] ERROR: fileUri is empty or undefined for BINARY download!`
					);
					console.error(
						`${LOG_TAG} [OFFLINE DEBUG] Available properties:`,
						Object.keys(downloadItem)
					);
					throw new PlayerError("PLAYER_SOURCE_OFFLINE_FILE_URI_INVALID", {
						contentId: props.id,
						offlineData: downloadItem,
					});
				}

				// Construir URI para reproducción offline binaria
				const offlineUri = downloadItem.fileUri.startsWith("file://")
					? downloadItem.fileUri
					: `file://${downloadItem.fileUri}`;

				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] Constructed BINARY offline URI: "${offlineUri}"`
				);
				this._videoSource.uri = offlineUri;
			} else {
				// STREAM downloads (HLS/DASH): el nativo maneja la reproducción offline
				// usando el título para buscar el asset descargado
				console.log(`${LOG_TAG} [OFFLINE DEBUG] Processing STREAM download`);
				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] STREAM download will be handled by native layer using title: "${props.title}"`
				);

				// Para STREAM, necesitamos una URI para que el nativo no aborte
				// Usamos la URI original del manifest o la del downloadItem
				// El nativo usará playOffline=true y buscará por título/ID
				const streamUri = downloadItem.uri || this._currentManifest?.manifestURL;
				if (streamUri && !this._videoSource.uri) {
					console.log(
						`${LOG_TAG} [OFFLINE DEBUG] Setting STREAM URI for native: "${streamUri}"`
					);
					this._videoSource.uri = streamUri;
				}

				if (downloadItem.fileUri) {
					console.log(
						`${LOG_TAG} [OFFLINE DEBUG] STREAM has fileUri (unexpected): "${downloadItem.fileUri}"`
					);
				}
			}

			// Store offline subtitles if available
			// Note: On iOS, paths will be resolved from bookmarks in NormalFlavour useEffect
			// to handle sandbox UUID changes between sessions
			if (downloadItem.subtitles && downloadItem.subtitles.length > 0) {
				this._offlineSubtitles = downloadItem.subtitles;
				console.log(
					`${LOG_TAG} [OFFLINE DEBUG] Found ${downloadItem.subtitles.length} offline subtitles`
				);
				downloadItem.subtitles.forEach((sub: DownloadedSubtitleItem) => {
					console.log(`${LOG_TAG} [OFFLINE DEBUG]   - ${sub.language}: ${sub.localPath}`);
				});
			}
		}

		this._isReady = true;
		console.log(`${LOG_TAG} changeSource finished (isReady ${!!this._isReady})`);

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

	public reloadDvrStream() {
		const calculatedUri = this.calculateSourceUri();
		if (!calculatedUri) {
			throw new PlayerError("PLAYER_SOURCE_URI_CALCULATION_FAILED", {
				method: "reloadDvrStream",
				currentManifest: this._currentManifest,
			});
		}

		this._videoSource = {
			...this._videoSource,
			uri: calculatedUri,
		};

		this._isReady = true;
		console.log(
			`${LOG_TAG} reloadDvrStream finished (isReady ${!!this._isReady}): ${this._videoSource?.uri}`
		);

		this.getStats();
	}

	public changeDvrUriParameters(liveStartProgramTimestamp?: number) {
		console.log(
			`${LOG_TAG} changeDvrUriParameters -> liveStartProgramTimestamp: ${liveStartProgramTimestamp}`
		);

		this._videoSource = {
			...this._videoSource,
			uri: this.changeUriStartTimestamp(
				this._videoSource?.uri || "",
				liveStartProgramTimestamp
			),
		};

		this._isReady = true;
		console.log(
			`${LOG_TAG} changeDvrUriParameters finished (isReady ${!!this._isReady}): ${this._videoSource?.uri}`
		);

		this.getStats();
	}

	private calculateSourceUri(): string | null {
		let uri: string | null = null;

		if (!this._currentManifest) {
			throw new PlayerError("PLAYER_SOURCE_MANIFEST_URI_INVALID", {
				currentManifest: this._currentManifest,
			});
		}

		try {
			// Preparamos la uri por si necesitamos incorporar el start en el dvr
			if (this._getSourceUri && typeof this._getSourceUri === "function") {
				uri = this._getSourceUri(
					this._currentManifest,
					this._currentManifest?.dvr_window_minutes,
					this._liveStartProgramTimestamp
				);
				console.log(
					`${LOG_TAG} calculateSourceUri -> uri: ${uri} (from external function) :: window ${this._currentManifest?.dvr_window_minutes} :: timestamp ${this._liveStartProgramTimestamp}`
				);
			} else {
				uri = getVideoSourceUri(
					this._currentManifest,
					this._currentManifest?.dvr_window_minutes,
					this._liveStartProgramTimestamp
				);
				console.log(
					`${LOG_TAG} calculateSourceUri -> uri: ${uri} (from internal function) :: window ${this._currentManifest?.dvr_window_minutes} :: timestamp ${this._liveStartProgramTimestamp}`
				);
			}
		} catch (error) {
			throw new PlayerError("PLAYER_SOURCE_URI_CALCULATION_FAILED", {
				currentManifest: this._currentManifest,
				originalError: error,
			});
		}

		return uri;
	}

	private checkFakeVOD(url: string): boolean {
		try {
			if (!url || typeof url !== "string") {
				return false;
			}

			const queryIndex = url.indexOf("?");
			if (queryIndex === -1) {
				return false;
			}

			const queryString = url.slice(queryIndex + 1);
			const params: Record<string, string> = {};

			queryString.split("&").forEach(part => {
				const [key, value] = part.split("=");
				if (key) {
					params[decodeURIComponent(key)] = decodeURIComponent(value || "");
				}
			});

			const start = params.start;
			const end = params.end;

			return !!start && !!end;
		} catch (error) {
			throw new PlayerError("PLAYER_SOURCE_URL_PARSING_ERROR", {
				url,
				originalError: error,
			});
		}
	}

	private calculateStartingPosition(): number {
		let startPosition = this._startPosition || 0;

		if (!this._isLive && !!startPosition && startPosition > 0) {
			startPosition = startPosition * 1000;
		}

		return startPosition;
	}

	private changeUriStartTimestamp(uri: string, timestamp?: number): string {
		if (!uri || typeof uri !== "string") {
			return uri;
		}

		if (uri.indexOf("?") > -1) {
			uri = `${uri.substring(0, uri.indexOf("?"))}?start=${timestamp}`; //&start-tag=true
		} else {
			uri = `${uri}?start=${timestamp}`; //&start-tag=true
		}

		return uri;
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

		console.log(`${LOG_TAG} getStats: ${JSON.stringify(stats)}`);
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

	get offlineSubtitles(): DownloadedSubtitleItem[] {
		return this._offlineSubtitles;
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
