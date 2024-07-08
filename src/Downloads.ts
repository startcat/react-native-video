import { Platform, DeviceEventEmitter, NativeEventEmitter, NativeModules } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { EventRegister } from 'react-native-event-listeners';

import type {
    ConfigDownloads,
    NetworkState
} from './types';



/*
 *  Downloads Module
 *  Interface for the native downloads module
 * 
 */

const DISABLED = false;

const { DownloadsModule } = NativeModules;
const DOWNLOADS_KEY = 'off_downloads';
const DOWNLOADS_DIR = (Platform.OS === 'ios') ? RNFS.LibraryDirectoryPath : RNFS.DocumentDirectoryPath + '/downloads';

class Singleton {

    static #instance: Singleton;
    static networkState: NetworkState | null = null;

    private savedDownloads = [];

    private isStarted: boolean = false;
    private firstMounted: boolean = false;
    private size: number = 0;

    // Events
    unsubscribeNetworkListener = null;

    onProgressListener = null;
    onLicenseDownloadedListener = null;
    onLicenseDownloadFailedListener = null;
    onLicenseCheckListener = null;
    onLicenseCheckFailedListener = null;
    onLicenseReleaseListener = null;
    onLicenseReleaseFailedListener = null;
    onLicenseKeysRestoredListener = null;
    onLicenseRestoreFailedListener = null;
    onAllLicensesReleasedListener = null;
    onAllLicensesReleaseFailedListener = null;
    onPreparedListener = null;
    onPrepareErrorListener = null;
    onDownloadStateChangedListener = null;
    onCompletedListener = null;
    onRemovedListener = null;

    private constructor() { }

    public static get instance(): Singleton {

        if (!Singleton.#instance) {
            Singleton.#instance = new Singleton();
        }

        return Singleton.#instance;

    }

    public init (config: ConfigDownloads): Promise<void> {

        return new Promise((resolve, reject) => {
            AsyncStorage.getItem(DOWNLOADS_KEY, async (err, result: string) => {

                if (err) {
                    return reject(err);
                }

                try {
                    this.savedDownloads = JSON.parse(result);

                    if (!result){
                        this.savedDownloads = [];

                    }

                } catch(ex){
                    console.error(ex.message);
                }

                if (Platform.OS === 'ios'){
                    this.savedDownloads = this.savedDownloads.map(item => {

                        if (!item.offlineData?.state || item.offlineData?.state !== 'COMPLETED'){
                            item.offlineData.state = 'RESTART';

                        }

                        return item;

                    });

                }

                this.getNetworkInfo();

                if (!DISABLED){
                    DownloadsModule.moduleInit().then(() => {

                        this.unsubscribeNetworkListener = NetInfo.addEventListener(state => {
                            console.log(`[Downloads] getNetworkInfo update - isConnected? ${state?.isConnected} (${state?.type})`);

                            this.networkState = state;

                            EventRegister.emit('downloadsEnable', { enabled:this.getCanDownload() });

                            if (this.firstMounted){
                                this.resume(state);

                            }

                        });

                        const emitter = Platform.OS === 'ios' ? new NativeEventEmitter(NativeModules.DownloadsModule) : DeviceEventEmitter

                        this.onProgressListener = emitter.addListener('downloadProgress', (data) => this.onProgress(data));
                        this.onLicenseDownloadedListener = emitter.addListener('onLicenseDownloaded', (data) => this.onLicenseDownloaded(data));
                        this.onLicenseDownloadFailedListener = emitter.addListener('onLicenseDownloadFailed', (data) => this.onLicenseDownloadFailed(data));
                        this.onLicenseCheckListener = emitter.addListener('onLicenseCheck', (data) => this.onLicenseCheck(data));
                        this.onLicenseCheckFailedListener = emitter.addListener('onLicenseCheckFailed', (data) => this.onLicenseCheckFailed(data));
                        this.onLicenseReleasedListener = emitter.addListener('onLicenseReleased', (data) => this.onLicenseReleased(data));
                        this.onLicenseReleaseFailedListener = emitter.addListener('onLicenseReleaseFailed', (data) => this.onLicenseReleaseFailed(data));
                        this.onLicenseKeysRestoredListener = emitter.addListener('onLicenseKeysRestored', (data) => this.onLicenseKeysRestored(data));
                        this.onLicenseRestoreFailedListener = emitter.addListener('onLicenseRestoreFailed', (data) => this.onLicenseRestoreFailed(data));
                        this.onAllLicensesReleasedListener = emitter.addListener('onAllLicensesReleased', (data) => this.onAllLicensesReleased(data));
                        this.onAllLicensesReleaseFailedListener = emitter.addListener('onAllLicensesReleaseFailed', (data) => this.onAllLicensesReleaseFailed(data));
                        this.onPreparedListener = emitter.addListener('onPrepared', (data) => this.onPrepared(data));
                        this.onPrepareErrorListener = emitter.addListener('onPrepareError', (data) => this.onPrepareError(data));
                        this.onDownloadStateChangedListener = emitter.addListener('onDownloadStateChanged', (data) => this.onDownloadStateChanged(data));
                        this.onCompletedListener = emitter.addListener('downloadCompleted', (data) => this.onCompleted(data));
                        this.onRemovedListener = emitter.addListener('downloadRemoved', (data) => this.onRemoved(data));

                        this.listToConsole();

                        console.log(`[Downloads] Initialized`);
                        
                        return resolve(this.savedDownloads);

                    }).catch((err) => {
                        return reject(err);

                    });

                }

                return resolve(this.savedDownloads);

            });
        });

    }

    removeEvents () {


        
    }

    resumeWithCheck () {

        

    }

    initialStart () {


    }

    public retryStart (): void {

    }

    public retryStop (): void {

    }

    public resume (): void {

    }

    public pause (): void {

    }

    public async resumeAll (): Promise<void> {

    }

    public async pauseAll (): Promise<void> {

    }



    // Local Settings
    private save (): Promise<void> {

        return new Promise((resolve, reject) => {

        });

    }

    private updateItem (index: number, obj: any): Promise<void> {

        return new Promise((resolve, reject) => {


        });

    }



    // Utils
    private formatBytes (bytes: number = 0, decimals: number = 2): string {

        let strSize: string = '0 Bytes';
        
        if (bytes === 0){
            return strSize;
        } 

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        strSize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];

        return strSize;

    }

    public listToConsole (): void {

    }

    private getNetworkInfo (): Promise<NetworkState> {

        /*
         *	"isConnected": true,
	     *  "type": "wifi",
	     *  "isInternetReachable": true,
	     *  "isWifiEnabled": true
         *
         */

        return new Promise((resolve, reject) => {
            NetInfo.fetch().then(state => {
                console.log(`[Downloads] getNetworkInfo - isConnected? ${state?.isConnected} (${state?.type})`);
                this.networkState = state;

                resolve({
                    isConnected: state?.isConnected,
                    isInternetReachable: state?.isInternetReachable,
                    isWifiEnabled: state?.isWifiEnabled,
                    type: state?.type
                });

            }).catch(error => {
                console.log(`[Downloads] getNetworkInfo error ${JSON.stringify(error)}`);
                resolve({
                    isConnected: true,
                    isInternetReachable: false,
                    isWifiEnabled: false,
                    type: null
                });

            });
        });

    }

    downloadMedia (obj) {

        return new Promise(async (resolve, reject) => {

            //console.log(`[Downloads] downloadMedia ${JSON.stringify(obj)}`);

            // Download player media
            apiFetch({
                uri: `/v1/media/${obj?.slug || obj?.id}`,
                offlineKey: `off_/v1/media_${obj?.slug || obj?.id}_${require('~/api/common').getLangCode()}`,
            }).then(res => {
                resolve(res);

            }).catch(err => {
                reject(err);

            });

        });

    }



    // List Methods
    async checkRestartItems () {

        for (const downloadItem of this.savedDownloads) {
            
            if (downloadItem?.offlineData?.profiles?.includes(this.session.id) && downloadItem?.offlineData?.state === 'RESTART'){

                await DownloadsModule.addItem(downloadItem?.offlineData?.source, downloadItem?.offlineData?.drm).then(() => {
                    console.log(`[Downloads] ${downloadItem?.offlineData?.source?.uri} Restarting.`);

            
                }).catch(async err => {
                    console.log(`[Downloads] ${downloadItem?.offlineData?.source?.uri} Coudn't restart: ${err.message}`);

                    if (err.message){
                        await this.onDownloadStateChanged({
                            id: downloadItem?.offlineData?.source?.uri,
                            state: err.message
                        });

                    }

                });

            }
            
        }

    }

    checkItem (uri) {
        return new Promise(async (resolve, reject) => {

            if (DISABLED){
                return reject();

            }

            //console.log(`[Downloads] checkItem ${JSON.stringify(uri)}`);

            if (!uri){
                return reject(`Incomplete media data`);
            }

            await DownloadsModule.getItem(uri).then(res => {
                //console.log(`[Downloads] checkItem (${uri}) ${JSON.stringify(res)}`);
                resolve(res);

            }).catch(err => {
                console.log(`[Downloads] checkItem  error (${uri}) ${JSON.stringify(err)}`);
                reject(err);

            });

        });
        
    }

    addItem (obj) {

        return new Promise(async (resolve, reject) => {

            if (DISABLED){
                return reject();

            }

            console.log(`[Downloads] Add (${obj.offlineData?.source?.uri}) ${JSON.stringify(obj)}`);

            if (!obj){
                return reject(`Incomplete media data`);
            }

            this.getItemBySrc(obj.offlineData?.source?.uri).then(res => {

                console.log(`[Downloads] Add: Already in the list`);

                if (!res?.item?.profiles?.includes(this.session.id)){

                    console.log(`[Downloads] Add: Already in the list -> Not for this profile`);
                    if (!res?.item?.profiles){
                        res.item.profiles = [];
                    }

                    res?.item?.profiles?.push(this.session.id);

                    this.savedDownloads.splice(res.index, 1, res.item);

                    this.save().then( async () => {
                        this.listToConsole();
                        EventRegister.emit('downloadsList', {});
                        this.checkDownloadsStatus();
                        return resolve();

                    }).catch(err => {
                        this.checkDownloadsStatus();
                        return reject(err);

                    });

                }

                return resolve();

            }).catch(async () => {

                console.log(`[Downloads] Add (${obj.offlineData?.source?.uri}) Not found...`);

                this.downloadMedia(obj).then(async (mediaObj) => {

                    let manifest, source, drm;

                    manifest = mediaObj.manifests?.find(item => {

                        if (Platform.OS === 'ios' && !!item.drmConfig){
                            return item.type === 'hls' && item.drmConfig.type === 'fairplay';
            
                        } else if (Platform.OS === 'ios'){
                            return item.type === 'hls';
            
                        } else if (Platform.OS === 'android' && !!item.drmConfig){
                            return item.type === 'dash' && item.drmConfig.type === 'widevine';
            
                        } else if (Platform.OS === 'android'){
                            return item.type === 'dash';
            
                        }
            
                    });
            
                    if (!!manifest){
            
                        source = { 
                            id: mediaObj?.id?.toString(),
                            uri: require('~/api/common').SITE_URL + manifest?.manifestURL,
                            type: (Platform.OS === 'ios') ? 'm3u8' : 'mpd'
                        };
            
                        if (manifest?.drmConfig?.type === 'fairplay'){
                            drm = {
                                type: 'fairplay',
                                licenseServer: require('~/api/common').SITE_URL + manifest?.drmConfig?.licenseAcquisitionURL,
                                certificateUrl: manifest?.drmConfig?.certificateURL
                            };
            
                        } else if (manifest?.drmConfig?.type === 'widevine'){
                            drm = {
                                drmScheme: 'widevine',
                                licenseServer: require('~/api/common').SITE_URL + manifest?.drmConfig?.licenseAcquisitionURL,
                            };
            
                        }

                        if (drm?.licenseServer && drm?.licenseServer?.includes('?')){
                            drm.licenseServer += '&offline=true';

                        } else if (drm?.licenseServer && !drm?.licenseServer?.includes('?')){
                            drm.licenseServer += '?offline=true';

                        }
                        
                        console.log(`[Downloads] DRM ${JSON.stringify(drm)}`);

                        const newItem = {
                            ...mediaObj,
                            offlineData: {
                                //datum: new Date(),
                                profiles:[this.session.id],
                                source: {
                                    ...source,
                                    title: mediaObj.title
                                },
                                state: 'RESTART',
                                drm: drm
                            }
                        };

                        this.savedDownloads.push(newItem);

                        DownloadsModule.addItem(newItem?.offlineData?.source, newItem?.offlineData?.drm).then(() => {

                            this.save().then( async () => {
                                this.listToConsole();
                                EventRegister.emit('downloadsList', {});
                                this.checkDownloadsStatus();
                                this.checkTotalSize();
                                return resolve();
        
                            }).catch(err => {
                                this.checkDownloadsStatus();
                                return reject(err);
        
                            });
                    
                        }).catch(err => {
                            return reject(err);

                        });

                    } else {
                        return reject(`No valid manifest found.`);
    
                    }

                }).catch(err => {
                    return reject(err);

                });

            });

        });

    }

    removeItem (obj) {

        return new Promise(async (resolve, reject) => {

            if (DISABLED || !obj.offlineData){
                return reject();
                
            }

            DownloadsModule.removeItem(obj?.offlineData?.source, obj?.offlineData?.drm).then(() => {

                this.getItemIndex(obj).then(index => {

                    this.savedDownloads.splice(index, 1);

                    this.save().then( async () => {
                        this.listToConsole();
                        EventRegister.emit('downloadsList', {});
                        this.checkDownloadsStatus();
                        this.checkTotalSize();
                        return resolve();

                    }).catch(err => {
                        EventRegister.emit('downloadsList', {});
                        this.checkDownloadsStatus();
                        return reject(err);

                    });

                }).catch(err => {
                    return resolve();

                });
        
            }).catch(err => {
                return reject(err);

            });

        });
        
    }

    getItem (obj) {

        //console.log(`[Downloads] getItem - id ${obj.id} / Profile ${this.session.id}`);
        //console.log(`[Downloads] getItem - ${JSON.stringify(this.savedDownloads)}`);

        //this.savedDownloads?.forEach(item => {
            //console.log(`[Downloads] forEach item - id ${item.id} / Profile ${item.offlineData?.profiles}`);
        //});

        return this.savedDownloads?.find(item => item.id === obj.id && item.offlineData?.profiles?.includes(this.session.id));
        
    }

    getItemBySrc (src) {

        return new Promise((resolve, reject) => {

            const foundItem = this.savedDownloads?.find(item => item.offlineData?.source?.uri === src);
            const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === src);

            if (!!foundItem){
                resolve({
                    item: foundItem,
                    index: foundAtIndex
                });

            } else {
                reject();

            }

        });
        
    }

    getItemIndex (obj) {

        return new Promise((resolve, reject) => {

            if (!obj){
                return reject(`[Downloads] [getItemIndex] Incomplete item data`);
            }

            const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === obj.offlineData?.source?.uri);

            if (foundAtIndex !== undefined && foundAtIndex !== null){
                resolve(foundAtIndex);

            } else {
                reject();

            }

        });
        
    }

    getList () {

        return this.savedDownloads;
        
    }

    readDirectory = (dir) => {

        return new Promise((resolve, reject) => {

            let dirSize = 0;

            //console.log(`[Files] ----- readDirectory ${dir}`);

            RNFS.readDir(dir).then(async (result) => {
                //console.log('[Files] GOT RESULT', result);

                for (const item of result) {

                    if (item.isDirectory()){
                        await this.readDirectory(item.path).then(size => {
                            dirSize = size + dirSize;
                        });

                    } else if (item.isFile()){
                        dirSize = dirSize + item.size;
                        //console.log(`[Files] ${item.path} ${item.size}`);

                    }

                }

                //console.log(`[Files] ----- readDirectory ${dir} ---> ${dirSize}`);
                resolve(dirSize);

            }).catch((err) => {
                console.log(err.message, err.code);
                resolve(dirSize);

            });

        });

    }

    getAppleDownloadsDirectory = (dir) => {

        return new Promise((resolve, reject) => {

            let path = '';

            RNFS.readDir(dir).then(async (result) => {

                for (const item of result) {

                    if (item.isDirectory() && item.name?.match(/com.apple.UserManagedAssets/gi)){
                        path = item.path;
                    }

                }

                if (!!path  && false){
                    resolve(path);

                } else {
                    resolve(dir);

                }

            }).catch((err) => {
                console.log(err.message, err.code);
                resolve(path);

            });

        });

    }


    // Events
    async onProgress (data) {

        //console.log(`[Downloads] onProgress ${JSON.stringify(data)}`);

        this.getItemBySrc(data.id).then(obj => {

            if (!!obj.item && obj.item?.offlineData?.percent !== data?.percent && data?.percent > 0){
                //console.log(`[Downloads] onProgress ${JSON.stringify(data)}`);
                obj.item.offlineData.percent = data?.percent;
                this.updateItem(obj.index, obj.item);
    
            }

        }).catch(ex => {



        });

    }

    async onLicenseDownloaded (data) {
        console.log(`[Downloads] onLicenseDownloaded ${JSON.stringify(data)}`);

    }

    async onLicenseDownloadFailed (data) {
        console.log(`[Downloads] onLicenseDownloadFailed ${JSON.stringify(data)}`);

    }

    async onLicenseCheck (data) {
        console.log(`[Downloads] onLicenseCheck ${JSON.stringify(data)}`);

    }
    
    async onLicenseCheckFailed (data) {
        console.log(`[Downloads] onLicenseCheckFailed ${JSON.stringify(data)}`);

    }
    
    async onLicenseReleased (data) {
        console.log(`[Downloads] onLicenseReleased ${JSON.stringify(data)}`);

    }
    
    async onLicenseReleaseFailed (data) {
        console.log(`[Downloads] onLicenseReleaseFailed ${JSON.stringify(data)}`);

    }
    
    async onLicenseKeysRestored (data) {
        console.log(`[Downloads] onLicenseKeysRestored ${JSON.stringify(data)}`);

    }
    
    async onLicenseRestoreFailed (data) {
        console.log(`[Downloads] onLicenseRestoreFailed ${JSON.stringify(data)}`);

    }
    
    async onAllLicensesReleased (data) {
        console.log(`[Downloads] onAllLicensesReleased ${JSON.stringify(data)}`);

    }
    
    async onAllLicensesReleaseFailed (data) {
        console.log(`[Downloads] onAllLicensesReleaseFailed ${JSON.stringify(data)}`);

    }
    
    async onPrepared (data) {
        console.log(`[Downloads] onPrepared ${JSON.stringify(data)}`);

    }
    
    async onPrepareError (data) {
        console.log(`[Downloads] onPrepareError ${JSON.stringify(data)}`);

    }
    
    async onDownloadStateChanged (data) {

        //console.log(`[Downloads] onDownloadStateChanged ${JSON.stringify(data)}`);
        
        this.getItemBySrc(data.id).then(obj => {

            if (!!obj.item && obj.item?.offlineData?.state !== data?.state){
                //console.log(`[Downloads] onDownloadStateChanged ${JSON.stringify(data)}`);
                obj.item.offlineData.state = data?.state;
                this.updateItem(obj.index, obj.item);
    
            }

        }).catch(ex => {



        });

        if (data?.state === 'COMPLETED'){
            this.checkTotalSize();

        }

    }

    async onCompleted (data) {
        console.log(`[Downloads] onCompleted ${JSON.stringify(data)}`);

    }

    async onRemoved (data) {
        console.log(`[Downloads] onRemoved ${JSON.stringify(data)}`);

    }



    // Actions
    checkDownloadsStatus () {

        let pendingItems = 0;

        for (const downloadItem of this.savedDownloads) {
            
            console.log(`Downloads - checkDownloadsStatus downloadItem?.offlineData?.state ${downloadItem?.offlineData?.state}`);
            if (downloadItem?.offlineData?.profiles?.includes(this.session.id) && downloadItem?.offlineData?.state !== 'COMPLETED' || !downloadItem?.offlineData){
                pendingItems++;

            }
            
        }

        console.log(`Downloads - Pending items ${pendingItems} / isStarted ${this.isStarted}`);

        EventRegister.emit('downloads', { 
            isStarted: (pendingItems > 0 && !!this.isStarted),
            pending: !!pendingItems
        });

    }

    download (id) {

        return new Promise((resolve, reject) => {



        });

    }

    remove (path) {

        return RNFS.unlink(path);

    }

    getIsStarted () {
        return !!this.isStarted;
    }

    getCanDownload () {
        return (this.networkState.isConnected && (!this.session.download_just_wifi || this.networkState.type === 'wifi'));

    }

    getTotalSize () {
        return new Promise((resolve, reject) => {

            if (Platform.OS === 'ios'){

                this.getAppleDownloadsDirectory(DOWNLOADS_DIR).then(path => {
    
                    if (!!path){
                        this.readDirectory(path).then(size => {
                            this.size = size;
                            console.log(`[Files] ----- Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                            resolve(this.size);
                        });

                    }
    
                });
    
            } else {
    
                this.readDirectory(DOWNLOADS_DIR).then(size => {
                    this.size = size;
                    console.log(`[Files] ----- Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                    resolve(this.size);
                });
    
            }

        });
        
    }

    checkTotalSize () {

        if (Platform.OS === 'ios'){

            this.getAppleDownloadsDirectory(DOWNLOADS_DIR).then(path => {

                if (!!path){

                    this.readDirectory(path).then(size => {
                        this.size = size;
                        console.log(`[Files] ----- Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                        EventRegister.emit('downloadsSize', { size:this.size });
                    });

                }

            });

        } else {

            this.readDirectory(DOWNLOADS_DIR).then(size => {
                this.size = size;
                console.log(`[Files] ----- Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                EventRegister.emit('downloadsSize', { size:this.size });
            });

        }

    }

}

export default Singleton.instance;
