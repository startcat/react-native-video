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
}

export class TudumClass {

    private _tudumSource: IVideoSource | undefined = undefined;
    private _tudumManifest?: IManifest | null | undefined;
    private _tudumDrm:IDrm | undefined = undefined;

    private _shouldPlay: boolean = false;
    private _isPlaying: boolean = false;
    private _hasPlayed: boolean = false;

    constructor(props:TudumClassProps) {
        console.log(`[Player] (TudumClass) constructor: ${JSON.stringify(props)}`);

        if (props.getTudumSource && typeof props.getTudumSource === 'function'){
            const tudumSource = props.getTudumSource();

            if (tudumSource){
                this._tudumSource = tudumSource;
                this._shouldPlay = !!props.enabled;
            }

        } else if (props.getTudumManifest && typeof props.getTudumManifest === 'function'){
            this._tudumManifest = props.getTudumManifest();

            if (this._tudumManifest){

                this._tudumDrm = getDRM(this._tudumManifest!);
                this._tudumSource = {
                    uri: getVideoSourceUri(this._tudumManifest)
                };
                this._shouldPlay = !!props.enabled;

            }
        }

    }

    get source(): IVideoSource | undefined {
        return this._tudumSource;
    }

    get drm(): IDrm | undefined {
        return this._tudumDrm;
    }

    get isReady(): boolean {
        return !!this._tudumSource && this._shouldPlay && !this._hasPlayed;
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get hasPlayed(): boolean {
        return this._hasPlayed;
    }

    set isPlaying(value: boolean) {

        if (!value && this._isPlaying){
            this._hasPlayed = true;
        }

        this._isPlaying = value;
    }

}
