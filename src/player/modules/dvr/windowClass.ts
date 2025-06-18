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
}

export interface WindowClassProps {
    manifest?:IManifest;
    // Callbacks

}

export class WindowClass {

    private _position:number = 0;
    private _duration:number = 0;
    private _startTime:number = 0;

    constructor(props:WindowClassProps) {


    }

    private createWindow() {

    }

    public getPosition() {
        
    }

    public getDuration() {
        
    }

}