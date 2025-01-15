import { Platform, DeviceEventEmitter, NativeEventEmitter, NativeModules } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
//import { download, completeHandler, checkForExistingDownloads, setConfig, directories, type DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import RNFS from 'react-native-fs';
import { EventRegister } from 'react-native-event-listeners';

import type {
    ConfigDownloads,
    NetworkState,
    ReadDirItem,
    DownloadItem,
    NewDownloadItem,
    SearchDownloadItem,

    OnDownloadProgressData,
    OnDownloadStateChangedData,
    OnDownloadCompletedData,
    OnDownloadRemovedData,
    OnLicenseDownloadedData,
    OnLicenseDownloadFailedData,
    OnLicenseCheckData,
    OnLicenseCheckFailedData,
    OnLicenseReleasedData,
    OnLicenseReleasedFailedData,
    OnLicenseKeysRestoredData,
    OnLicenseRestoreFailedData,
    OnAllLicensesReleasedData,
    OnAllLicensesReleaseFailedData,
    OnPreparedData,
    OnPrepareErrorData
} from './types';

import { DownloadStates } from './types';

let RNBackgroundDownloader;



/*
 *  Downloads Module
 *  Interface for the native downloads module
 * 
 */

const { DownloadsModule } = NativeModules;
const DOWNLOADS_OLDKEY = 'off_downloads';
const DOWNLOADS_KEY = 'off_downloads_v2';
const DOWNLOADS_DIR = (Platform.OS === 'ios') ? RNFS?.LibraryDirectoryPath : RNFS?.DocumentDirectoryPath + '/downloads';

class Singleton {

    static #instance: Singleton;
    static networkState: NetworkState | null = null;

    private savedDownloads: DownloadItem[] = [];
    private firstMounted: boolean = false;
    private disabled: boolean = true;
    private binaryEnabled: boolean = false;
    private user_required: boolean = true;
    private download_just_wifi: boolean = true;
    private log_key: string = `[Downloads]`;
    private initialized: boolean = false;

    private DOWNLOADS_BINARY_DIR = '';
    private binaryTasks: Array<any> = [];

    public isStarted: boolean = false;
    public size: number = 0;
    public user_isLogged: boolean = false;
    public user_id: string = '';

    // Events
    unsubscribeNetworkListener: any = null;

    onProgressListener: any = null;
    onLicenseDownloadedListener: any = null;
    onLicenseDownloadFailedListener: any = null;
    onLicenseCheckListener: any = null;
    onLicenseCheckFailedListener: any = null;
    onLicenseReleasedListener: any = null;
    onLicenseReleasedFailedListener: any = null;
    onLicenseKeysRestoredListener: any = null;
    onLicenseRestoreFailedListener: any = null;
    onAllLicensesReleasedListener: any = null;
    onAllLicensesReleaseFailedListener: any = null;
    onPreparedListener: any = null;
    onPrepareErrorListener: any = null;
    onDownloadStateChangedListener: any = null;
    onCompletedListener: any = null;
    onRemovedListener: any = null;

    private constructor() { }

    public static get instance(): Singleton {

        if (!Singleton.#instance) {
            Singleton.#instance = new Singleton();
        }

        return Singleton.#instance;

    }

    public init (config: ConfigDownloads): Promise<DownloadItem[]> {

        return new Promise((resolve, reject) => {

            this.disabled = !!config.disabled;
            this.binaryEnabled = !!config.binaryEnabled;
            this.download_just_wifi = !!config.download_just_wifi;

            if (config.log_key){
                this.log_key = config.log_key;
    
            }

            if (config.user_required !== undefined && config.user_required !== null){
                this.user_required = config.user_required;

            }

            // Dynamic Dependencies
            if (this.binaryEnabled){
                import('@kesha-antonov/react-native-background-downloader').then(module => {
                    RNBackgroundDownloader = module;

                    module.setConfig({
                        isLogsEnabled: true
                    });

                    this.DOWNLOADS_BINARY_DIR = (Platform.OS === 'ios') ? module.directories.documents : RNFS?.DocumentDirectoryPath + '/downloads';

                }).catch(err => {
                    console.log(`${this.log_key} react-native-background-downloader not found: ${err}`);

                });

            }

            AsyncStorage.getItem(DOWNLOADS_KEY).then(async (result: string | null) => {

                if (typeof(result) === 'string'){
                    try {
                        this.savedDownloads = JSON.parse(result);

                        if (!result){
                            this.savedDownloads = [];

                        }

                    } catch(ex: any){
                        console.error(ex?.message);
                    }

                } else {
                    this.savedDownloads = [];

                }

                if (Platform.OS === 'ios'){
                    this.savedDownloads = this.savedDownloads.map((item: DownloadItem) => {

                        if (!item.offlineData?.state || item.offlineData?.state !== DownloadStates.COMPLETED){
                            item.offlineData.state = DownloadStates.RESTART;

                        }

                        return item;

                    });

                }

                await this.getNetworkInfo();

                await this.checkTotalSize();

                await this.refactorOldEntries();

                if (!this.disabled && !this.initialized){
                    DownloadsModule.moduleInit().then(() => {

                        this.unsubscribeNetworkListener = NetInfo.addEventListener((state: any) => {
                            console.log(`${this.log_key} getNetworkInfo update - isConnected? ${state?.isConnected} (${state?.type})`);

                            Singleton.networkState = {
                                isConnected: state?.isConnected,
                                isInternetReachable: state?.isInternetReachable,
                                isWifiEnabled: state?.isWifiEnabled,
                                type: state?.type
                            };

                            EventRegister.emit('downloadsEnable', { enabled:this.canDownload });

                            if (this.firstMounted){
                                this.resume();

                            }

                        });

                        const emitter = Platform.OS === 'ios' ? new NativeEventEmitter(NativeModules.DownloadsModule) : DeviceEventEmitter

                        this.onProgressListener = emitter.addListener('downloadProgress', (data: OnDownloadProgressData) => this.onProgress(data));
                        this.onLicenseDownloadedListener = emitter.addListener('onLicenseDownloaded', (data: OnLicenseDownloadedData) => this.onLicenseDownloaded(data));
                        this.onLicenseDownloadFailedListener = emitter.addListener('onLicenseDownloadFailed', (data: OnLicenseDownloadFailedData) => this.onLicenseDownloadFailed(data));
                        this.onLicenseCheckListener = emitter.addListener('onLicenseCheck', (data: OnLicenseCheckData) => this.onLicenseCheck(data));
                        this.onLicenseCheckFailedListener = emitter.addListener('onLicenseCheckFailed', (data: OnLicenseCheckFailedData) => this.onLicenseCheckFailed(data));
                        this.onLicenseReleasedListener = emitter.addListener('onLicenseReleased', (data: OnLicenseReleasedData) => this.onLicenseReleased(data));
                        this.onLicenseReleasedFailedListener = emitter.addListener('onLicenseReleasedFailed', (data: OnLicenseReleasedFailedData) => this.onLicenseReleasedFailed(data));
                        this.onLicenseKeysRestoredListener = emitter.addListener('onLicenseKeysRestored', (data: OnLicenseKeysRestoredData) => this.onLicenseKeysRestored(data));
                        this.onLicenseRestoreFailedListener = emitter.addListener('onLicenseRestoreFailed', (data: OnLicenseRestoreFailedData) => this.onLicenseRestoreFailed(data));
                        this.onAllLicensesReleasedListener = emitter.addListener('onAllLicensesReleased', (data: OnAllLicensesReleasedData) => this.onAllLicensesReleased(data));
                        this.onAllLicensesReleaseFailedListener = emitter.addListener('onAllLicensesReleaseFailed', (data: OnAllLicensesReleaseFailedData) => this.onAllLicensesReleaseFailed(data));
                        this.onPreparedListener = emitter.addListener('onPrepared', (data: OnPreparedData) => this.onPrepared(data));
                        this.onPrepareErrorListener = emitter.addListener('onPrepareError', (data: OnPrepareErrorData) => this.onPrepareError(data));
                        this.onDownloadStateChangedListener = emitter.addListener('onDownloadStateChanged', (data: OnDownloadStateChangedData) => this.onDownloadStateChanged(data));
                        this.onCompletedListener = emitter.addListener('downloadCompleted', (data: OnDownloadCompletedData) => this.onCompleted(data));
                        this.onRemovedListener = emitter.addListener('downloadRemoved', (data: OnDownloadRemovedData) => this.onRemoved(data));

                        this.listToConsole();
                        this.initialized = true;

                        console.log(`${this.log_key} Initialized`);
                        
                        return resolve(this.savedDownloads);

                    }).catch((err: any) => {
                        return reject(err);

                    });

                }

                return resolve(this.savedDownloads);

            });
        });

    }

    removeEvents () {

        this.onLicenseDownloadedListener?.remove();
        this.onLicenseDownloadFailedListener?.remove();
        this.onLicenseCheckListener?.remove();
        this.onLicenseCheckFailedListener?.remove();
        this.onLicenseReleasedListener?.remove();
        this.onLicenseReleasedFailedListener?.remove();
        this.onLicenseKeysRestoredListener?.remove();
        this.onLicenseRestoreFailedListener?.remove();
        this.onAllLicensesReleasedListener?.remove();
        this.onAllLicensesReleaseFailedListener?.remove();
        this.onPreparedListener?.remove();
        this.onPrepareErrorListener?.remove();
        this.onDownloadStateChangedListener?.remove();
        this.onProgressListener?.remove();
        this.onCompletedListener?.remove();
        this.onRemovedListener?.remove();

        if (this.unsubscribeNetworkListener){
            this.unsubscribeNetworkListener();
        }
        
    }

    initialStart () {
        this.firstMounted = true;
        this.resume();

    }

    private retryStart (): void {

    }

    private retryStop (): void {

    }

    public async resume (): Promise<void> {

        console.log(`${this.log_key} Resume - isStarted ${this.isStarted}`);
        console.log(`${this.log_key} Resume - isConnected ${Singleton.networkState?.isConnected} (Network type ${Singleton.networkState?.type})`);
        console.log(`${this.log_key} Resume - canDownload ${this.canDownload}`);
        
        if (this.canDownload){

            if (Platform.OS === 'android'){

                await DownloadsModule.resumeAll().then(() => {
                    this.isStarted = true;
                    console.log(`${this.log_key} Resumed.`);
                    this.checkRestartItems();
                    this.checkDownloadsStatus();

                }).catch((err: any) => {
                    console.log(`${this.log_key} Couldn't start: ${err?.message}`);
                    this.retryStart();

                });                

            } else {
                console.log(`${this.log_key} Resume all.`);
                this.resumeAll();

            }

            if (this.binaryEnabled && RNBackgroundDownloader){

                try {
                    const tasks = await RNBackgroundDownloader.checkForExistingDownloads();
                    console.log(`${this.log_key} Binary tasks: ${JSON.stringify(tasks)}`);
            
                    if (tasks.length > 0) {
                        tasks.map(task => this.process(task));

                        this.binaryTasks = [...this.binaryTasks, ...tasks];

                    }
                } catch (e) {
                    console.warn(`${this.log_key} checkForExistingDownloads e`, e);

                }

            }

        } else {
            this.pause();

        }

    }

    public async pause (): Promise<void> {

        if (!this.disabled && this.isStarted){

            if (Platform.OS === 'android'){

                await DownloadsModule.pauseAll().then(() => {
                    this.isStarted = false;
                    console.log(`${this.log_key} Paused all.`);
                    this.checkDownloadsStatus();

                }).catch((err: any) => {
                    console.log(`${this.log_key} Couldn't pause downloads: ${err?.message}`);
                    this.retryStop();

                });

            } else {
                console.log(`${this.log_key} Pause all.`);
                this.pauseAll();

            }

        } else if (!this.disabled){

            console.log(`${this.log_key} Paused but it wasn't started...`);
            this.checkDownloadsStatus();

        }

    }

    public async resumeAll (): Promise<void> {

        for (const downloadItem of this.savedDownloads) {
            
            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state !== DownloadStates.COMPLETED){
                await DownloadsModule.resume(downloadItem?.offlineData?.source, downloadItem?.offlineData?.drm).then(() => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Resumed.`);
    
                }).catch((err: any) => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Couldn't start: ${err?.message}`);
    
                });
            }

        }

        this.isStarted = true;
        this.checkRestartItems();
        this.checkDownloadsStatus();

    }

    public async pauseAll (): Promise<void> {

        for (const downloadItem of this.savedDownloads) {

            console.log(`${this.log_key} pauseAll: Item ${downloadItem?.offlineData?.source?.title} state ${downloadItem?.offlineData?.state}`)
            
            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state !== DownloadStates.COMPLETED){
                await DownloadsModule.pause(downloadItem?.offlineData?.source, downloadItem?.offlineData?.drm).then(() => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Resumed.`);
    
                }).catch((err: any) => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Couldn't pause: ${err?.message}`);
    
                });
            }
            
        }

        this.isStarted = false;
        this.checkDownloadsStatus();

    }



    // Local Settings
    private saveRefList (): Promise<DownloadItem[]> {

        return new Promise((resolve, reject) => {
            AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(this.savedDownloads), (err: any) => {

                if (err) {
                    return reject(err);

                }

                return resolve(this.savedDownloads);

            });
        });

    }

    private updateRefListItem (index: number, obj: DownloadItem): Promise<void> {

        return new Promise((resolve, reject) => {

            if (index > -1 && this.savedDownloads?.length > index){
                this.savedDownloads.splice(index, 1, obj);
                this.saveRefList().finally(() => {
                    EventRegister.emit('offlineData', { index:index, item:obj });
                    this.checkDownloadsStatus();
                    resolve();

                });

            } else {
                console.log(`${this.log_key} updateRefListItem error: No item at ${index}`);
                reject(`No current item index`);
            }

        });

    }

    private removeRefListItem (index: number): Promise<void> {

        return new Promise((resolve, reject) => {

            if (index > -1 && this.savedDownloads?.length > index){
                this.savedDownloads.splice(index, 1);
                this.saveRefList().finally(() => {
                    EventRegister.emit('downloadsList', {});
                    this.checkDownloadsStatus();
                    resolve();

                });

            } else {
                console.log(`${this.log_key} removeRefListItem error: No item at ${index}`);
                reject(`No current item index`);
            }

        });

    }



    // From old versions
    private async refactorOldEntries (): Promise<void> {

        const avoidMediaFields = ['offlineData', 'theme'];

        AsyncStorage.getItem(DOWNLOADS_OLDKEY).then(async (result: string | null) => {

            if (typeof(result) === 'string'){

                const oldDownloads = JSON.parse(result);

                if (Array.isArray(oldDownloads) && oldDownloads?.length > 0){

                    for (const oldItem of oldDownloads) {
                        
                        const newItem: DownloadItem = {
                            media: {},
                            offlineData: {
                                session_ids: [...oldItem?.offlineData?.profiles],
                                source: oldItem?.offlineData?.source,
                                state: oldItem?.offlineData?.state,
                                drm: oldItem?.offlineData?.drm,
                                percent: oldItem?.offlineData?.percent || 0
                            }
                        }

                        for (const key in oldItem){

                            if (!avoidMediaFields.includes(key)){
                                newItem.media[key] = oldItem[key];
                            }

                        }

                        this.savedDownloads.push(newItem);
                        
                    }

                    try {
                        await this.saveRefList();
                        AsyncStorage.removeItem(DOWNLOADS_OLDKEY);

                    } catch (ex: any){
                        console.log(`${this.log_key} refactorOldEntries error: ${ex?.message}`);
                    }

                }

            }

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

    private cleanLocalList (): void {

        let pendingRemove: number[] = [];

        this.savedDownloads?.forEach((item, index) => {

            if (item?.offlineData?.state === DownloadStates.REMOVING){
                pendingRemove.push(index);

            }

        });

        if (pendingRemove.length > 0){
            this.savedDownloads.splice(pendingRemove.shift()!, 1);
            this.saveRefList().then(() => {
                this.cleanLocalList();
            });

        }

    }

    public listToConsole (): void {

        this.savedDownloads?.forEach(item => {

            console.log(`${this.log_key} --- [${item?.media?.collection}] ${item?.media?.slug}: ${item?.media?.title} ${JSON.stringify(item?.offlineData)}`);

        });

        console.log(`${this.log_key} Found ${this.savedDownloads?.length} items.`);

    }

    private getNetworkInfo (): Promise<NetworkState> {

        /*
         *	"isConnected": true,
	     *  "type": "wifi",
	     *  "isInternetReachable": true,
	     *  "isWifiEnabled": true
         *
         */

        return new Promise((resolve) => {
            NetInfo.fetch().then((state: any) => {
                console.log(`${this.log_key} getNetworkInfo - isConnected? ${state?.isConnected} (${state?.type})`);
                
                Singleton.networkState = {
                    isConnected: state?.isConnected,
                    isInternetReachable: state?.isInternetReachable,
                    isWifiEnabled: state?.isWifiEnabled,
                    type: state?.type
                };

                resolve(Singleton.networkState);

            }).catch(() => {

                resolve({
                    isConnected: true,
                    isInternetReachable: false,
                    isWifiEnabled: false,
                    type: null
                });

            });
        });

    }



    // List Methods
    public async checkRestartItems (): Promise<void> {

        for (const downloadItem of this.savedDownloads) {
            
            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state === DownloadStates.RESTART){

                await DownloadsModule.addItem(downloadItem?.offlineData?.source, downloadItem?.offlineData?.drm).then(() => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.uri} Restarting.`);
            
                }).catch(async (err: any) => {
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.uri} Coudn't restart: ${err?.message}`);

                    if (err){
                        await this.onDownloadStateChanged({
                            id: downloadItem?.offlineData?.source?.uri,
                            state: err?.message
                        });

                    }

                });

            }
            
        }

    }

    public checkItem (uri: string): Promise<DownloadItem | null> {
        return new Promise(async (resolve, reject) => {

            if (this.disabled){
                return reject();

            }

            if (!uri){
                return reject(`Incomplete media data`);

            }

            await DownloadsModule.getItem(uri).then((res: DownloadItem | null) => {
                console.log(`${this.log_key} checkItem (${uri}) ${JSON.stringify(res)}`);
                resolve(res);

            }).catch((err: any) => {
                console.log(`${this.log_key} checkItem  error (${uri}) ${JSON.stringify(err)}`);
                reject(err);

            });

        });
        
    }

    private setItemToLocal (obj: NewDownloadItem): Promise<void> {

        return new Promise(async (resolve, reject) => {

            let newItem: DownloadItem = {
                media: obj.media,
                offlineData: {
                    session_ids:[this.user_id],
                    source: obj.offlineData.source,
                    state: DownloadStates.RESTART,
                    drm: obj.offlineData.drm,
                    isBinary: Platform.OS === 'android' && obj.offlineData.source.drmScheme === 'mp3'
                }
            };

            if (this.binaryEnabled && RNBackgroundDownloader && newItem.offlineData.isBinary){
                newItem.offlineData.fileUri = `${this.DOWNLOADS_BINARY_DIR}/${obj.offlineData.source.id}.mp3`;

            }

            this.savedDownloads.push(newItem);
            const newItemIndex = this.savedDownloads.length - 1;

            console.log(`${this.log_key} setItemToLocal source type ${obj.offlineData.source.drmScheme} (isBinary ${newItem.offlineData.isBinary}) (index ${newItemIndex})`);

            if (this.binaryEnabled && RNBackgroundDownloader && newItem.offlineData.isBinary){
                // Los binarios los descargamos de forma senzilla con la librería react-native-background-downloader
                const downloadId = obj.offlineData.source.id?.toString();

                this.saveRefList().then( async () => {
                    this.listToConsole();
                    EventRegister.emit('downloadsList', {});
                    this.checkDownloadsStatus();
                    this.checkTotalSize();

                }).catch((err: any) => {
                    this.checkDownloadsStatus();

                });

                this.process(RNBackgroundDownloader.download({
                    id: downloadId,
                    url: obj.offlineData.source.uri,
                    destination: newItem.offlineData.fileUri!,
                    metadata: {}
                }));
                
                return resolve();

            } else {
                // Los streams los descargamos con el módulo nativo relacionado con el player
                DownloadsModule.addItem(newItem?.offlineData?.source, newItem?.offlineData?.drm).then(() => {

                    this.saveRefList().then( async () => {
                        this.listToConsole();
                        EventRegister.emit('downloadsList', {});
                        this.checkDownloadsStatus();
                        this.checkTotalSize();
                        return resolve();

                    }).catch((err: any) => {
                        this.checkDownloadsStatus();
                        return reject(err);

                    });
            
                }).catch((err: any) => {
                    return reject(err);

                });

            }

        });

    }

    public addItem (obj: NewDownloadItem): Promise<void | Error> {

        return new Promise(async (resolve, reject) => {

            if (this.disabled){
                return reject();

            }

            console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri})`);

            if (!obj){
                return reject(`Incomplete media data`);
            }

            this.getItemBySrc(obj.offlineData?.source?.uri).then(async (res) => {

                if (res !== null && res.index > -1){
                    console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri}): Already in the list`);

                    // Miramos de incluir el ID de usuario en la lista de usuarios que han descargado este item
                    if (!res?.item?.offlineData?.session_ids?.includes(this.user_id)){

                        console.log(`${this.log_key} Add: Already in the list -> Adding user ID to the list of this item`);
                        if (!res?.item?.offlineData?.session_ids){
                            res.item.offlineData.session_ids = [];
                        }

                        res.item.offlineData.session_ids.push(this.user_id);

                        this.savedDownloads.splice(res.index, 1, res.item);

                        this.saveRefList().then( async () => {
                            this.listToConsole();
                            EventRegister.emit('downloadsList', {});
                            this.checkDownloadsStatus();
                            return resolve();

                        }).catch(err => {
                            EventRegister.emit('downloadsList', {});
                            this.checkDownloadsStatus();
                            return reject(err);

                        });

                    }

                } else {

                    console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri}): Not found...`);

                    try {
                        await this.setItemToLocal(obj);
                        return resolve();

                    } catch(ex: any){
                        return reject(ex?.message);

                    }

                }

            }).catch(async () => {

                console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri}): Not found...`);

                try {
                    await this.setItemToLocal(obj);
                    return resolve();

                } catch(ex: any){
                    return reject(ex?.message);

                }

            });

        });

    }

    public removeItem (obj: DownloadItem): Promise<void> {

        return new Promise(async (resolve, reject) => {

            if (this.disabled){
                return reject();
                
            }

            try {

                if (obj?.offlineData?.source?.uri){

                    if (this.binaryEnabled && RNBackgroundDownloader && obj?.offlineData?.isBinary){
                        await RNFS?.unlink(obj?.offlineData?.fileUri!);
                        this.onBinaryRemoved(obj?.offlineData?.source?.id!);

                    } else {
                        await DownloadsModule.removeItem(obj?.offlineData?.source, obj?.offlineData?.drm);

                        const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === obj?.offlineData?.source?.uri);

                        if (foundAtIndex !== undefined && foundAtIndex !== null){
                            this.removeRefListItem(foundAtIndex);
                
                        }

                    }

                }

                return resolve();

            } catch(ex:any){
                return reject(ex?.message);

            }

        });
        
    }

    public getItemById (id: string): DownloadItem | undefined {

        return this.savedDownloads?.find(item => item.offlineData.source.id === id && item.offlineData?.session_ids?.includes(this.user_id));
        
    }

    public getItemBySrc (src: string): Promise<SearchDownloadItem> {

        return new Promise((resolve, reject) => {

            const foundItem = this.savedDownloads?.find(item => {
                console.log(`${this.log_key} [DANI] ${JSON.stringify(item.offlineData?.source?.uri)} --- ${JSON.stringify(src)}`);
                return item.offlineData?.source?.uri === src;
            });

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

    public getItemByIdAsync (id: string): Promise<SearchDownloadItem> {

        return new Promise((resolve, reject) => {

            const foundItem = this.savedDownloads?.find(item => item.offlineData?.source?.id === id);
            const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.id === id);

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

    public getItemIndex (obj: DownloadItem): Promise<number> {

        return new Promise((resolve, reject) => {

            if (!obj){
                return reject(`${this.log_key} getItemIndex: Incomplete item data`);

            }

            const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === obj.offlineData?.source?.uri);

            if (foundAtIndex !== undefined && foundAtIndex !== null){
                resolve(foundAtIndex);

            } else {
                reject();

            }

        });
        
    }

    public getList (): Array<DownloadItem> {
        return this.savedDownloads;
        
    }

    // Binary Tasks
    private process (task) {

        if (this.binaryEnabled && RNBackgroundDownloader){

            const { index } = this.getTask(task.id);

            return task
                .begin(({ expectedBytes, headers }) => {
                    console.log(`${this.log_key} task: begin`, { id: task.id, expectedBytes, headers });

                    // @ts-ignore
                    this.binaryTasks[index] = task;

                    this.onBinaryStart(task.id);

                }).progress(({ bytesDownloaded, bytesTotal }) => {

                    console.log(`${this.log_key} task: progress`, { id: task.id, bytesDownloaded, bytesTotal });
                    const percent = bytesDownloaded / bytesTotal * 100;

                    // @ts-ignore
                    this.binaryTasks[index] = task;

                    this.onBinaryProgress(task.id, percent);

                }).done(() => {
                    console.log(`${this.log_key} task: done`, { id: task.id });
                    // @ts-ignore
                    this.binaryTasks[index] = task;
        
                    RNBackgroundDownloader.completeHandler(task.id);
                    this.onBinaryCompleted(task.id);

                }).error(e => {
                    console.error(`${this.log_key} task: error`, { id: task.id, e });
                    // @ts-ignore
                    this.binaryTasks[index] = task;
        
                    RNBackgroundDownloader.completeHandler(task.id);
                    this.onBinaryError(task.id, e, 0);

                });

        }

    }

    private getTask (id) {
        
        if (this.binaryEnabled && RNBackgroundDownloader){
            // @ts-ignore
            const index = this.binaryTasks.findIndex(task => task.id === id);
            const task = this.binaryTasks[index];
            return { index, task };
            
        } else {
            return null;

        }

    }

    // Directories
    public readDirectorySize (dir: string): Promise<number>  {

        return new Promise((resolve, reject) => {

            let dirSize = 0;

            if (!RNFS){
                reject('No react-native-fs module');
            }

            RNFS?.readDir(dir).then(async (result: ReadDirItem[]): Promise<void> => {

                for (const item of result) {

                    if (item.isDirectory()){
                        await this.readDirectorySize(item.path).then(size => {

                            if (typeof(size) === 'number'){
                                dirSize = size + dirSize;
                            }
                            
                        });

                    } else if (item.isFile()){
                        dirSize = dirSize + item.size;

                    }

                }

                resolve(dirSize);

            }).catch((err: any) => {
                reject(err);

            });

        });

    }

    private getAppleDownloadsDirectory (dir: string): Promise<string> {

        return new Promise((resolve, reject) => {

            let path = '';

            if (!RNFS){
                reject('No react-native-fs module');
            }

            RNFS?.readDir(dir).then(async (result: ReadDirItem[]) => {

                for (const item of result) {

                    if (item.isDirectory() && item.name?.match(/com.apple.UserManagedAssets/gi)){
                        path = item.path;
                    }

                }

                if (!!path){
                    resolve(path);

                } else {
                    resolve(dir);

                }

            }).catch((err: any) => {
                reject(err);

            });

        });

    }

    private checkTotalSize (): Promise<void> {

        return new Promise((resolve) => {

            if (Platform.OS === 'ios'){

                this.getAppleDownloadsDirectory(DOWNLOADS_DIR).then(path => {

                    if (typeof(path) === 'string'){

                        this.readDirectorySize(path).then(size => {

                            if (typeof(size) === 'number'){
                                this.size = size;
                                console.log(`${this.log_key} Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                                EventRegister.emit('downloadsSize', { size:this.size });

                            }

                            resolve();

                        }). catch(() => {
                            resolve();

                        });

                    }

                }). catch(() => {
                    resolve();

                });

            } else {

                this.readDirectorySize(DOWNLOADS_DIR).then(size => {

                    if (typeof(size) === 'number'){
                        this.size = size;
                        console.log(`${this.log_key} Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                        EventRegister.emit('downloadsSize', { size:this.size });

                    }

                    resolve();

                }). catch(() => {
                    resolve();

                });

            }

        });

    }


    // Events
    private async onProgress (data: OnDownloadProgressData): Promise<void> {
        console.log(`${this.log_key} onProgress ${JSON.stringify(data)}`);

        this.getItemBySrc(data?.id).then(obj => {

            if (!!obj.item && obj.item?.offlineData?.percent !== data?.percent && data?.percent > 0){
                obj.item.offlineData.percent = data?.percent;
                this.updateRefListItem(obj.index, obj.item);
    
            }

        }).catch(() => {
            console.log(`${this.log_key} onProgress: Item not found (${data?.id})`);

        });

    }

    private async onLicenseDownloaded (data: OnLicenseDownloadedData): Promise<void> {
        console.log(`${this.log_key} onLicenseDownloaded ${JSON.stringify(data)}`);

    }

    private async onLicenseDownloadFailed (data: OnLicenseDownloadFailedData): Promise<void> {
        console.log(`${this.log_key} onLicenseDownloadFailed ${JSON.stringify(data)}`);

    }

    private async onLicenseCheck (data: OnLicenseCheckData): Promise<void> {
        console.log(`${this.log_key} onLicenseCheck ${JSON.stringify(data)}`);

    }
    
    private async onLicenseCheckFailed (data: OnLicenseCheckFailedData): Promise<void> {
        console.log(`${this.log_key} onLicenseCheckFailed ${JSON.stringify(data)}`);

    }
    
    private async onLicenseReleased (data: OnLicenseReleasedData): Promise<void> {
        console.log(`${this.log_key} onLicenseReleased ${JSON.stringify(data)}`);

        const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === data?.manifest);

        if (foundAtIndex !== undefined && foundAtIndex !== null){
            this.removeRefListItem(foundAtIndex);

        }

    }
    
    private async onLicenseReleasedFailed (data: OnLicenseReleasedFailedData): Promise<void> {
        console.log(`${this.log_key} onLicenseReleasedFailed ${JSON.stringify(data)}`);

    }
    
    private async onLicenseKeysRestored (data: OnLicenseKeysRestoredData): Promise<void> {
        console.log(`${this.log_key} onLicenseKeysRestored ${JSON.stringify(data)}`);

    }
    
    private async onLicenseRestoreFailed (data: OnLicenseRestoreFailedData): Promise<void> {
        console.log(`${this.log_key} onLicenseRestoreFailed ${JSON.stringify(data)}`);

    }
    
    private async onAllLicensesReleased (data: OnAllLicensesReleasedData): Promise<void> {
        console.log(`${this.log_key} onAllLicensesReleased ${JSON.stringify(data)}`);

    }
    
    private async onAllLicensesReleaseFailed (data: OnAllLicensesReleaseFailedData): Promise<void> {
        console.log(`${this.log_key} onAllLicensesReleaseFailed ${JSON.stringify(data)}`);

    }
    
    private async onPrepared (data: OnPreparedData): Promise<void> {
        console.log(`${this.log_key} onPrepared ${JSON.stringify(data)}`);

    }
    
    private async onPrepareError (data: OnPrepareErrorData): Promise<void> {
        console.log(`${this.log_key} onPrepareError ${JSON.stringify(data)}`);

    }
    
    private async onDownloadStateChanged (data: OnDownloadStateChangedData): Promise<void> {
        console.log(`${this.log_key} onDownloadStateChanged ${JSON.stringify(data)}`);

        this.getItemBySrc(data?.id).then(obj => {

            if (!!obj.item && obj.item?.offlineData?.state !== data?.state && data?.state !== DownloadStates.REMOVING){
                console.log(`${this.log_key} onDownloadStateChanged ${JSON.stringify(data)}`);
                obj.item.offlineData.state = data?.state;
                this.updateRefListItem(obj.index, obj.item);

                if (data?.state === DownloadStates.COMPLETED){
                    this.checkTotalSize();
        
                }
    
            } else if (!!obj.item && obj.item?.offlineData?.state !== data?.state && data?.state === DownloadStates.REMOVING){

                // Lo eliminamos del listado
                this.savedDownloads.splice(obj.index, 1);

                this.saveRefList().finally(() => {
                    this.listToConsole();
                    EventRegister.emit('downloadsList', {});
                    this.checkDownloadsStatus();
                    this.checkTotalSize();

                });

            }

        }).catch(() => {
            console.log(`${this.log_key} onDownloadStateChanged: Item not found (${data?.id})`);

        });

    }

    private async onCompleted (data: OnDownloadCompletedData): Promise<void> {
        console.log(`${this.log_key} onCompleted ${JSON.stringify(data)}`);

    }

    private async onRemoved (data: OnDownloadRemovedData): Promise<void> {
        console.log(`${this.log_key} onRemoved ${JSON.stringify(data)}`);

    }



    // Binary Events
    private async onBinaryStart (id: string): Promise<void> {
        console.log(`${this.log_key} onBinaryStart ${id}`);

        this.getItemByIdAsync(id).then(obj => {

            obj.item.offlineData.state = DownloadStates.DOWNLOADING;
            this.updateRefListItem(obj.index, obj.item);

        }).catch(() => {
            console.log(`${this.log_key} onBinaryStart: Item not found (${id})`);

        });

    }

    private async onBinaryProgress (id: string, percent: number): Promise<void> {
        console.log(`${this.log_key} onBinaryProgress ${id} ${percent}%`);

        this.getItemByIdAsync(id).then(obj => {

            if (!!obj.item && obj.item?.offlineData?.percent !== percent && percent > 0){
                obj.item.offlineData.percent = percent;
                obj.item.offlineData.state = DownloadStates.DOWNLOADING;
                this.updateRefListItem(obj.index, obj.item);
    
            }

        }).catch(() => {
            console.log(`${this.log_key} onBinaryProgress: Item not found (${id})`);

        });

    }

    private async onBinaryCompleted (id: string): Promise<void> {
        console.log(`${this.log_key} onBinaryCompleted ${id}`);

        this.getItemByIdAsync(id).then(obj => {

            obj.item.offlineData.state = DownloadStates.COMPLETED;
            this.updateRefListItem(obj.index, obj.item);
            this.checkTotalSize();

        }).catch(() => {
            console.log(`${this.log_key} onBinaryCompleted: Item not found (${id})`);

        });

    }

    private async onBinaryRemoved (id: string): Promise<void> {
        console.log(`${this.log_key} onBinaryRemoved ${id}`);

        this.getItemByIdAsync(id).then(obj => {

            this.savedDownloads.splice(obj.index, 1);

            this.saveRefList().finally(() => {
                this.listToConsole();
                EventRegister.emit('downloadsList', {});
                this.checkDownloadsStatus();
                this.checkTotalSize();

            });

        }).catch(() => {
            console.log(`${this.log_key} onBinaryRemoved: Item not found (${id})`);

        });

    }

    private async onBinaryError (id: string, err: string, errorCode: number): Promise<void> {
        console.log(`${this.log_key} onBinaryError (${errorCode}) ${err}`);

        this.getItemByIdAsync(id).then(obj => {

            obj.item.offlineData.state = DownloadStates.FAILED;
            this.updateRefListItem(obj.index, obj.item);
            this.checkTotalSize();

        }).catch(() => {
            console.log(`${this.log_key} onBinaryError: Item not found (${id})`);

        });

    }



    // Actions
    public checkDownloadsStatus (): void {

        let pendingItems = 0;

        for (const downloadItem of this.savedDownloads) {
            
            console.log(`${this.log_key} checkDownloadsStatus ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}): ${downloadItem?.offlineData?.state}`);

            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state !== DownloadStates.COMPLETED){
                pendingItems++;

            }
            
        }

        console.log(`${this.log_key} Pending items for this user id: ${pendingItems} / isStarted ${this.isStarted}`);

        EventRegister.emit('downloads', { 
            isStarted: (pendingItems > 0 && !!this.isStarted),
            pending: !!pendingItems
        });

    }

    public remove (path: string): Promise<void> {

        return RNFS?.unlink(path);

    }

    get canDownload (): boolean {
        return (!this.disabled && !!Singleton.networkState?.isConnected && (!this.download_just_wifi || Singleton.networkState?.type === 'wifi') && (!this.user_required || this.user_isLogged));

    }

}

export default Singleton.instance;
