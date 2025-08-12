import {
    type Headers,
    type IDrm,
    type IManifest,
    type IVideoSource,
    STREAM_FORMAT_TYPE,
} from '../../types';

import {
    getBestManifest,
    getContentById,
    getContentIdIsBinary,
    getContentIdIsDownloaded,
    getDRM,
    getManifestSourceType,
    getVideoSourceUri,
} from '../../utils';

export interface onSourceChangedProps {
    id?:number,
    source:IVideoSource | null;
    drm?:IDrm;
    dvrWindowSeconds?:number;
    isLive?:boolean;
    isDVR?:boolean;
    isReady?:boolean;
    isFakeVOD?:boolean;
}

export interface SourceClassProps {
    // Metadata
    id?:number,
    title?:string;
    subtitle?:string;
    description?:string;
    poster?: string;
    squaredPoster?: string;

    // Source
    manifests?: Array<IManifest>;
    startPosition?: number;
    isLive?: boolean;
    headers?: Headers;

    // Callbacks
    getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string;
    onSourceChanged?: (data:onSourceChangedProps) => void;
}

const LOG_TAG = '[SourceClass]';

export class SourceClass {

    private _currentManifest:IManifest | undefined = undefined;
    private _drm:IDrm | undefined = undefined;
    private _videoSource:IVideoSource | null = null;

    private _startPosition?:number = 0;

    private _needsLiveInitialSeek:boolean = false;
    private _liveStartProgramTimestamp?:number;
    private _dvrWindowSeconds?:number;

    private _isLive:boolean = false;
    private _isDVR:boolean = false;
    private _isHLS:boolean = false;
    private _isDASH:boolean = false;
    private _isReady:boolean = false;
    private _isDownloaded:boolean = false;
    private _isBinary:boolean = false;
    private _isFakeVOD:boolean = false;

    private _getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string;

	constructor(props:SourceClassProps) {

        this._getSourceUri = props.getSourceUri;

        if (props.manifests && props.manifests.length > 0){
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
        this._isDVR = false;
        this._isHLS = false;
        this._isDASH = false;
        this._isReady = false;
        this._isDownloaded = false;
        this._isBinary = false;
        this._isFakeVOD = false;
    }

    public changeSource(props:SourceClassProps) {

        this._isReady = false;
        console.log(`${LOG_TAG} changeSource (isReady ${!!this._isReady})`);

        if (!props.manifests || props.manifests.length === 0){
            this.clearCurrentSource();
            throw new Error('No manifests provided');
        }

        // Cogemos el manifest adecuado
        this._currentManifest = getBestManifest(props.manifests);

        if (!this._currentManifest){
            this.clearCurrentSource();
            throw new Error('No manifest found');
        }

        // Preparamos el DRM adecuado al manifest y plataforma
        this._drm = getDRM(this._currentManifest);

        // Marcamos si es HLS
        this._isHLS = this._currentManifest?.type === STREAM_FORMAT_TYPE.HLS;

        // Marcamos si es DASH
        this._isDASH = this._currentManifest?.type === STREAM_FORMAT_TYPE.DASH;

        // Revisamos si se trata de un Binario descargado
        if (props.id){
            this._isDownloaded = getContentIdIsDownloaded(props.id);
            this._isBinary = getContentIdIsBinary(props.id);
        }

        // Marcamos si es Live
        this._isLive = !!props.isLive;

        // Marcamos si es DVR
        this._isDVR = this._isLive && typeof(this._currentManifest?.dvr_window_minutes) === 'number' && this._currentManifest?.dvr_window_minutes > 0;

        // Marcamos si es un falso VOD (directo acotado)
        this._isFakeVOD = this.checkFakeVOD(this._currentManifest?.manifestURL || '');

        this._dvrWindowSeconds = this._isDVR && this._currentManifest?.dvr_window_minutes ? this._currentManifest?.dvr_window_minutes * 60 : undefined;

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
                description: props.description,
                imageUri: props.squaredPoster || props.poster
            }
        };

        if (this._isDownloaded && this._isBinary){
            const offlineBinary = getContentById(props.id!);
            console.log(`${LOG_TAG} changeSource -> isDownloaded && isBinary`);

            this._videoSource.uri = `file://${offlineBinary?.offlineData.fileUri}`;
            console.log(`${LOG_TAG} constructed URI:`, this._videoSource.uri);
        }

        this._isReady = true;
        console.log(`${LOG_TAG} changeSource finished (isReady ${!!this._isReady})`);

        if (props.onSourceChanged && typeof props.onSourceChanged === 'function'){
            props.onSourceChanged({
                id: props.id,
                source:this._videoSource,
                drm:this._drm,
                dvrWindowSeconds:this._dvrWindowSeconds,
                isLive:this._isLive,
                isDVR:this._isDVR,
                isFakeVOD:this._isFakeVOD,
                isReady:true
            });
        }

        this.getStats();

    }

    public reloadDvrStream() {

        this._videoSource = {
            ...this._videoSource,
            uri: this.calculateSourceUri()!
        };

        this._isReady = true;
        console.log(`${LOG_TAG} reloadDvrStream finished (isReady ${!!this._isReady}): ${this._videoSource?.uri}`);

        this.getStats();
    }

    public changeDvrUriParameters(liveStartProgramTimestamp?:number) {
        console.log(`${LOG_TAG} changeDvrUriParameters -> liveStartProgramTimestamp: ${liveStartProgramTimestamp}`);

        this._videoSource = {
            ...this._videoSource,
            uri: this.changeUriStartTimestamp(this._videoSource?.uri || '', liveStartProgramTimestamp)
        };

        this._isReady = true;
        console.log(`${LOG_TAG} changeDvrUriParameters finished (isReady ${!!this._isReady}): ${this._videoSource?.uri}`);

        this.getStats();
    }

    private calculateSourceUri(): string | null {

        let uri: string | null = null;

        // Preparamos la uri por si necesitamos incorporar el start en el dvr
        if (this._getSourceUri && typeof this._getSourceUri === 'function' && this._currentManifest){
            uri = this._getSourceUri(this._currentManifest, this._currentManifest?.dvr_window_minutes, this._liveStartProgramTimestamp);
            console.log(`${LOG_TAG} calculateSourceUri -> uri: ${uri} (from external function) :: window ${this._currentManifest?.dvr_window_minutes} :: timestamp ${this._liveStartProgramTimestamp}`);

        } else {
            uri = getVideoSourceUri(this._currentManifest!, this._currentManifest?.dvr_window_minutes, this._liveStartProgramTimestamp);
            console.log(`${LOG_TAG} calculateSourceUri -> uri: ${uri} (from internal function) :: window ${this._currentManifest?.dvr_window_minutes} :: timestamp ${this._liveStartProgramTimestamp}`);

        }

        return uri;

    }

    private checkFakeVOD(url: string): boolean {
        
        try {
            const queryIndex = url.indexOf('?');
            if (queryIndex === -1) return false;
        
            const queryString = url.slice(queryIndex + 1);
            const params: Record<string, string> = {};

            queryString.split('&').forEach(part => {
                const [key, value] = part.split('=');
                if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            });

            const start = params['start'];
            const end = params['end'];
        
            return !!start && !!end;
        
        } catch (e) {
            return false;
        }

    }

    private calculateStartingPosition():number {

        let startPosition = 0;

        if (!this._isLive && this._startPosition && this._startPosition > 0){
            startPosition = this._startPosition * 1000;

        }

        return startPosition;
    }

    private changeUriStartTimestamp(uri:string, timestamp?:number): string {
        
        if (!uri || typeof(uri) !== 'string'){
            return uri;
    
        }
    
        if (uri.indexOf('?') > -1){
            uri = `${uri.substring(0, uri.indexOf('?'))}?start=${timestamp}`; //&start-tag=true
    
        } else {
            uri = `${uri}?start=${timestamp}`; //&start-tag=true
    
        }

        // uri = uri.replaceAll('master.m3u8', 'bitrate_3.m3u8');
    
        return uri;

    }

    private getStats() {

        const stats = {
            isLive: this._isLive,
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
            currentManifest: this._currentManifest
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
