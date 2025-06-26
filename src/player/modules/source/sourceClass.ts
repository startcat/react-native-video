import {
    type IDrm,
    type IManifest,
    type IVideoSource,
    type Headers,
    STREAM_FORMAT_TYPE,
} from '../../types';

import {
    getBestManifest,
    getDRM,
    getManifestSourceType,
    getMinutesFromTimestamp,
    getMinutesSinceStart,
    getVideoSourceUri,
    subtractMinutesFromDate
} from '../../utils';

export interface onSourceChangedProps {
    id?:number,
    source:IVideoSource | null;
    drm?:IDrm;
    isLive?:boolean;
    isDVR?:boolean;
    isReady?:boolean;
    dvrWindowSeconds?:number;
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

export class SourceClass {

    private _currentManifest:IManifest | undefined = undefined;
    private _drm:IDrm | undefined = undefined;
    private _videoSource:IVideoSource | null = null;
    private _dvrWindowSeconds?:number = undefined;

    private _startPosition?:number = 0;

    private _needsLiveInitialSeek:boolean = false;
    private _liveStartProgramTimestamp?:number;

    private _isLive:boolean = false;
    private _isDVR:boolean = false;
    private _isHLS:boolean = false;
    private _isDASH:boolean = false;
    private _isReady:boolean = false;

    private _getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string;

	constructor(props:SourceClassProps) {

        console.log(`[Player] (SourceClass) constructor: ${JSON.stringify(props)}`);
        this._getSourceUri = props.getSourceUri;

        if (props.manifests && props.manifests.length > 0){
            this.changeSource(props);
        }

	}

    private clearCurrentSource() {
        this._currentManifest = undefined;
        this._drm = undefined;
        this._videoSource = null;
        this._dvrWindowSeconds = undefined;

        this._startPosition = 0;
        this._needsLiveInitialSeek = false;

        this._isLive = false;
        this._isDVR = false;
        this._isHLS = false;
        this._isDASH = false;
        this._isReady = false;
    }

    public changeSource(props:SourceClassProps) {

        this._isReady = false;
        console.log(`[Player] (SourceClass) changeSource: ${JSON.stringify(props)}`);

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

        // Marcamos si es Live
        this._isLive = !!props.isLive;

        // Marcamos si es DVR
        this._isDVR = this._isLive && typeof(this._currentManifest?.dvr_window_minutes) === 'number' && this._currentManifest?.dvr_window_minutes > 0;

        // Marcamos la posición inicial
        this._startPosition = props.startPosition || 0;

        // Guardamos la ventana de DVR
        this._dvrWindowSeconds = this._currentManifest?.dvr_window_minutes ? this._currentManifest?.dvr_window_minutes * 60 : undefined;

        this._videoSource = {
            id: props.id,
            title: props.title,
            uri: this._isLive ? this.calculateSourceUri() || this._currentManifest?.manifestURL : this._currentManifest?.manifestURL,
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

        this._isReady = true;

        if (props.onSourceChanged && typeof props.onSourceChanged === 'function'){
            props.onSourceChanged({
                id: props.id,
                source:this._videoSource,
                drm:this._drm,
                isLive:this._isLive,
                isDVR:this._isDVR,
                isReady:true,
                dvrWindowSeconds:this._dvrWindowSeconds
            });
        }

    }

    private calculateSourceUri(): string | null {

        let uri: string | null = null;

        // Preparamos la uri por si necesitamos incorporar el start en el dvr
        if (this._getSourceUri && typeof this._getSourceUri === 'function' && this._currentManifest){
            uri = this._getSourceUri(this._currentManifest, this._currentManifest?.dvr_window_minutes, this._liveStartProgramTimestamp);

        } else {
            uri = getVideoSourceUri(this._currentManifest!, this._currentManifest?.dvr_window_minutes, this._liveStartProgramTimestamp);
            
        }

        return uri;

    }

    private calculateStartingPosition():number {

        let startPosition = 0;

        if (!this._isLive && this._startPosition && this._startPosition > 0){
            startPosition = this._startPosition * 1000;

        }

        return startPosition;
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

    get isReady(): boolean {
        return this._isReady;
    }

    get dvrWindowSeconds(): number | undefined {
        return this._dvrWindowSeconds;
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
