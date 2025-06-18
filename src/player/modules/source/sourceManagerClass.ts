import {
    type IDrm,
    type IManifest,
    type IVideoSource,
    type Headers,
    STREAM_FORMAT_TYPE,
} from '../../types';

import {
    type SourceClassProps,
    type onSourceChangedProps,
} from './sourceClass';

import {
    getBestManifest,
    getDRM,
    getManifestSourceType,
    getMinutesFromTimestamp,
    getMinutesSinceStart,
    getVideoSourceUri,
    mergeMenuData,
    onAdStarted,
    subtractMinutesFromDate
} from '../../utils';

import { SourceClass } from './sourceClass';

export interface onSourceManagerChangedProps extends onSourceChangedProps {
    isTudum?: boolean;
}

export interface SourceManagerClassProps extends SourceClassProps {
    showExternalTudum?: boolean;
    headers?: Headers;

    // Callbacks
    getTudumManifest?: () => IManifest | null | undefined;
    onSourceChanged?: (data:onSourceManagerChangedProps) => void;
}

export class SourceManagerClass {

    private _currentSource:SourceClass | null = null;
    private _tudumSource:SourceClass | null = null;

    private _isPlayingTudum: boolean = false;
    private _tudumHasBeenPlayed: boolean = false;
    private _showExternalTudum: boolean;
    private _getTudumManifest?: () => IManifest | null | undefined;
    private _onSourceChanged?: (data:onSourceManagerChangedProps) => void;

    constructor(props:SourceManagerClassProps) {
        this._showExternalTudum = !!props.showExternalTudum;
        this._getTudumManifest = props.getTudumManifest;
        this._onSourceChanged = props.onSourceChanged;

        if (props.manifests && props.manifests.length > 0){
            this.changeSource(props);
        }

        this.handleTudumSource();
    }

    private clearCurrentSource() {
        this._currentSource = null;
        this._tudumSource = null;
        this._isPlayingTudum = false;
    }

    private handleTudumSource() {

        if (this._showExternalTudum && this._getTudumManifest && typeof this._getTudumManifest === 'function'){
            const tudumManifest = this._getTudumManifest();

            if (tudumManifest){
                this._tudumSource = new SourceClass({
                    manifests: [tudumManifest],
                    onSourceChanged: (data:onSourceChangedProps) => {

                        if (this._onSourceChanged && typeof this._onSourceChanged === 'function'){
                            this._onSourceChanged({
                                ...data,
                                isTudum: true
                            });
                        }

                    }
                });

            } else {
                this._tudumSource = null;
                this._isPlayingTudum = false;

            }

        } else {
            this._tudumSource = null;
            this._isPlayingTudum = false;

        }

    }

    public changeSource(props: SourceClassProps) {
        if (this._currentSource){
            this._currentSource.changeSource(props);

        } else {
            this._currentSource = new SourceClass({
                ...props, 
                onSourceChanged: (data:onSourceChangedProps) => {

                    if (this._onSourceChanged && typeof this._onSourceChanged === 'function'){
                        this._onSourceChanged({
                            ...data,
                            isTudum: false
                        });
                    }
                    
                }
            });

        }
    }

    set showExternalTudum(value: boolean) {
        this._showExternalTudum = value;
        this.handleTudumSource();
    }

    get showExternalTudum(): boolean {
        return !!this._showExternalTudum;
    }

    get isPlayingTudum(): boolean {
        return this._isPlayingTudum;
    }

}
