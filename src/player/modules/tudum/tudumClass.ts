import {
    type IDrm,
    type IManifest,
    type IVideoSource,
} from '../../types';

import {
    getDRM,
    getVideoSourceUri,
} from '../../utils';

export interface TudumClassProps {
    enabled?: boolean;
    getTudumManifest?: () => IManifest | null | undefined;
    getTudumSource?: () => IVideoSource | null | undefined;
    isAutoNext?: boolean;
}

export class TudumClass {

    private _tudumSource: IVideoSource | undefined = undefined;
    private _tudumManifest?: IManifest | null | undefined;
    private _tudumDrm:IDrm | undefined = undefined;

    private _shouldPlay: boolean = false;
    private _isPlaying: boolean = false;
    private _hasPlayed: boolean = false;
    private _isAutoNext: boolean = false;

    constructor(props:TudumClassProps) {
        console.log(`[Player] (TudumClass) constructor: ${JSON.stringify(props)}`);

        this._isAutoNext = !!props.isAutoNext;

        if (props.getTudumSource && typeof props.getTudumSource === 'function'){
            const tudumSource = props.getTudumSource();

            if (tudumSource){
                this._tudumSource = tudumSource;
                // Solo habilitar si NO es salto automático
                this._shouldPlay = !!props.enabled && !this._isAutoNext;
            }

        } else if (props.getTudumManifest && typeof props.getTudumManifest === 'function'){
            this._tudumManifest = props.getTudumManifest();

            if (this._tudumManifest){

                this._tudumDrm = getDRM(this._tudumManifest!);
                this._tudumSource = {
                    uri: getVideoSourceUri(this._tudumManifest)
                };
                // Solo habilitar si NO es salto automático
                this._shouldPlay = !!props.enabled && !this._isAutoNext;

            }
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
        console.log(`[Player] (TudumClass) prepareForAutoNext`);
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
        console.log(`[Player] (TudumClass) getStats: ${JSON.stringify({
            source: this._tudumSource,
            drm: this._tudumDrm,
            isReady: this.isReady,
            isPlaying: this._isPlaying,
            hasPlayed: this._hasPlayed,
            isAutoNext: this._isAutoNext
        })}`);
    };

    get source(): IVideoSource | undefined {
        return this._tudumSource;
    }

    get drm(): IDrm | undefined {
        return this._tudumDrm;
    }

    get isReady(): boolean {
        const ready = !!this._tudumSource && this._shouldPlay && !this._hasPlayed && !this._isAutoNext;
        console.log(`[Player] (TudumClass) isReady: ${ready} (source: ${!!this._tudumSource}, shouldPlay: ${this._shouldPlay}, hasPlayed: ${this._hasPlayed}, isAutoNext: ${this._isAutoNext})`);
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

        console.log(`[Player] (TudumClass) set isPlaying ${value} - _isPlaying ${this._isPlaying} - _hasPlayed ${this._hasPlayed} - _isAutoNext ${this._isAutoNext}`);

        if (!value && this._isPlaying){
            this._hasPlayed = true;
        }

        this._isPlaying = value;
        console.log(`[Player] (TudumClass) isPlaying ${this._isPlaying}`);
    }

}