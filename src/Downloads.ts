import NetInfo from '@react-native-community/netinfo';
import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';

import { calculateTotalDownloadsSize, getBinaryDownloadsDirectory, removeUri } from './downloads/filesystem';
import { getNetworkInfo } from './downloads/network';
import { readStorage, saveStorage } from './downloads/storage';
import { refactorOldEntries } from './downloads/upgrade';
import { formatBytes, listToConsole } from './downloads/utils';
import { PlayerError } from './player/core/errors/PlayerError';

import type {
    ConfigDownloads,
    DownloadItem,
    NetworkState,
    NewDownloadItem,
    OnAllLicensesReleasedData,
    OnAllLicensesReleaseFailedData,
    OnDownloadCompletedData,
    OnDownloadProgressData,
    OnDownloadRemovedData,
    OnDownloadStateChangedData,
    OnLicenseCheckData,
    OnLicenseCheckFailedData,
    OnLicenseDownloadedData,
    OnLicenseDownloadFailedData,
    OnLicenseKeysRestoredData,
    OnLicenseReleasedData,
    OnLicenseReleasedFailedData,
    OnLicenseRestoreFailedData,
    OnPreparedData,
    OnPrepareErrorData,
    SearchDownloadItem
} from './types';

import { DownloadStates } from './types';

let RNBackgroundDownloader;

/*
 *  Downloads Module
 *  Interface for the native downloads module
 * 
 */

const { DownloadsModule } = NativeModules;

class Singleton {

    static #instance: Singleton;
    static networkState: NetworkState | null = null;

    private savedDownloads: DownloadItem[] = [];
    private firstMounted: boolean = false;
    private user_required: boolean = true;
    private download_just_wifi: boolean = true;
    private log_key: string = `[Downloads]`;
    private initialized: boolean = false;

    private DOWNLOADS_BINARY_DIR = '';
    private binaryTasks: Array<any> = [];

    public downloadsEnabled: boolean = false;
    public binaryDownloadsEnabled: boolean = false;
    public isStarted: boolean = false;
    public isPending: boolean = false;
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

            this.download_just_wifi = !!config.download_just_wifi;

            if (config.log_key){
                this.log_key = config.log_key;
    
            }

            if (config.user_required !== undefined && config.user_required !== null){
                this.user_required = config.user_required;

            }

            if (!this.downloadsEnabled){
                return resolve([]);

            }

            // Dynamic Dependencies
            if (this.binaryDownloadsEnabled){
                try {
                    
                    import('@kesha-antonov/react-native-background-downloader').then(module => {
                        RNBackgroundDownloader = module;

                        module.setConfig({
                            isLogsEnabled: true
                        });

                        this.DOWNLOADS_BINARY_DIR = getBinaryDownloadsDirectory(module);

                    }).catch(err => {
                        console.log(`${this.log_key} react-native-background-downloader not found: ${err}`);

                    });

                } catch(ex){
                    console.log(`${this.log_key} react-native-background-downloader not found: ${ex?.message}`);

                }

            }

            readStorage(this.log_key).then(async (result: DownloadItem[] | null) => {

                if (result && result.length > 0) {
                    this.savedDownloads = result;
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

                await getNetworkInfo(this.log_key).then(state => {
                    Singleton.networkState = state;
                });

                await this.checkTotalSize();

                await this.refactorOldEntries();

                if (this.downloadsEnabled && !this.initialized){
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

                        listToConsole(this.log_key, this.savedDownloads);
                        this.initialized = true;

                        console.log(`${this.log_key} Initialized`);
                        
                        // Inicializar isPending con el estado correcto desde el inicio
                        this.checkDownloadsStatus();
                        
                        return resolve(this.savedDownloads);

                    }).catch((err: any) => {
                        return reject(err);

                    });

                }

                this.checkDownloadsStatus();

                return resolve(this.savedDownloads);

            });
        });

    }

    removeEvents() {
        const listeners = [
            'onLicenseDownloadedListener',
            'onLicenseDownloadFailedListener',
            'onLicenseCheckListener',
            'onLicenseCheckFailedListener',
            'onLicenseReleasedListener',
            'onLicenseReleasedFailedListener',
            'onLicenseKeysRestoredListener',
            'onLicenseRestoreFailedListener',
            'onAllLicensesReleasedListener',
            'onAllLicensesReleaseFailedListener',
            'onPreparedListener',
            'onPrepareErrorListener',
            'onDownloadStateChangedListener',
            'onProgressListener',
            'onCompletedListener',
            'onRemovedListener'
        ];
        
        listeners.forEach(listenerName => {
            if (this[listenerName]) {
                this[listenerName].remove();
                this[listenerName] = null;
            }
        });
        
        if (this.unsubscribeNetworkListener) {
            this.unsubscribeNetworkListener();
            this.unsubscribeNetworkListener = null;
        }
    }

    initialStart () {
        this.firstMounted = true;
        this.resume();

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

                });                

            } else {
                console.log(`${this.log_key} Resume all.`);
                this.resumeAll();

            }

            // if (this.binaryDownloadsEnabled && RNBackgroundDownloader){

            //     try {
            //         const lostTasks = await RNBackgroundDownloader.checkForExistingDownloads();
            //         console.log(`${this.log_key} Binary lost tasks: ${JSON.stringify(lostTasks)}`);
            
                    /*
                    if (lostTasks.length > 0) {

                        this.binaryTasks = [...this.binaryTasks, ...lostTasks];

                        lostTasks.forEach((task, index) => {

                            task.progress(({ bytesDownloaded, bytesTotal }) => {

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

                        });

                        //tasks.map(task => this.process(task));

                    }
                    */
            //     } catch (e) {
            //         console.warn(`${this.log_key} checkForExistingDownloads e`, e);

            //     }

            // }

        } else {
            this.pause();

        }

    }

    public async pause (): Promise<void> {

        if (this.downloadsEnabled && this.isStarted){

            if (Platform.OS === 'android'){

                await DownloadsModule.pauseAll().then(() => {
                    this.isStarted = false;
                    console.log(`${this.log_key} Paused all.`);
                    this.checkDownloadsStatus();

                }).catch((err: any) => {
                    console.log(`${this.log_key} Couldn't pause downloads: ${err?.message}`);

                });

            } else {
                console.log(`${this.log_key} Pause all.`);
                this.pauseAll();

            }

        } else if (this.downloadsEnabled){

            console.log(`${this.log_key} Paused but it wasn't started...`);
            this.checkDownloadsStatus();

        }

    }

    public async resumeAll (): Promise<void> {

        for (const downloadItem of this.savedDownloads) {
            
            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state !== DownloadStates.COMPLETED){

                if (this.binaryDownloadsEnabled && RNBackgroundDownloader && downloadItem.offlineData.isBinary){



                } else {

                    await DownloadsModule.resume(downloadItem?.offlineData?.source, downloadItem?.offlineData?.drm).then(() => {
                        console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Resumed.`);
        
                    }).catch((err: any) => {
                        console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Couldn't start: ${err?.message}`);
        
                    });

                }

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
                    console.log(`${this.log_key} ${downloadItem?.offlineData?.source?.title} (${downloadItem?.offlineData?.source?.uri}) Paused.`);
    
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
            saveStorage(this.savedDownloads, this.log_key).then((success) => {

                if (success) {
                    return resolve(this.savedDownloads);
                } else {
                    return reject(new PlayerError('STORAGE_ASYNC_002', {
                        operation: 'saveDownloadsList',
                        itemCount: this.savedDownloads?.length || 0
                    }));
                }

            }).catch((err: any) => {
                return reject(err);

            });
        });

    }

    private updateRefListItem (index: number, obj: DownloadItem): Promise<void> {

        return new Promise((resolve, reject) => {

            // Verificar índice y array
            if (index < 0) {
                console.error(`${this.log_key} updateRefListItem error: Invalid negative index ${index}`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_ITEM_NOT_FOUND', {
                    operation: 'updateRefListItem',
                    index: index,
                    reason: 'Invalid negative index'
                }));
            }

            if (!this.savedDownloads || this.savedDownloads.length === 0) {
                console.error(`${this.log_key} updateRefListItem error: savedDownloads array is empty`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_ITEM_NOT_FOUND', {
                    operation: 'updateRefListItem',
                    index: index,
                    reason: 'Downloads array is empty'
                }));
            }

            if (index >= this.savedDownloads.length) {
                console.error(`${this.log_key} updateRefListItem error: Index ${index} exceeds array length ${this.savedDownloads.length}`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_ITEM_NOT_FOUND', {
                    operation: 'updateRefListItem',
                    index: index,
                    arrayLength: this.savedDownloads.length,
                    reason: 'Index exceeds array length'
                }));
            }

            console.log(`${this.log_key} updateRefListItem: Updating index ${index} with ${obj?.offlineData?.source?.title} (${obj?.offlineData?.source?.uri})`);
            this.savedDownloads.splice(index, 1, obj);
            this.saveRefList().finally(() => {
                EventRegister.emit('offlineData', { index:index, item:obj });
                this.checkDownloadsStatus();
                resolve();

            });

        });

    }

    private removeRefListItem (index: number): Promise<void> {

        return new Promise((resolve, reject) => {

            // Verificar índice y array
            if (index < 0) {
                console.error(`${this.log_key} removeRefListItem error: Invalid negative index ${index}`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_REMOVE_FAILED', {
                    operation: 'removeRefListItem',
                    index: index,
                    reason: 'Invalid negative index'
                }));
            }

            if (!this.savedDownloads || this.savedDownloads.length === 0) {
                console.error(`${this.log_key} removeRefListItem error: savedDownloads array is empty`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_REMOVE_FAILED', {
                    operation: 'removeRefListItem',
                    index: index,
                    reason: 'Downloads array is empty'
                }));
            }

            if (index >= this.savedDownloads.length) {
                console.error(`${this.log_key} removeRefListItem error: Index ${index} exceeds array length ${this.savedDownloads.length}`);
                return reject(new PlayerError('DOWNLOAD_QUEUE_REMOVE_FAILED', {
                    operation: 'removeRefListItem',
                    index: index,
                    arrayLength: this.savedDownloads.length,
                    reason: 'Index exceeds array length'
                }));
            }

            const itemToRemove = this.savedDownloads[index];
            console.log(`${this.log_key} removeRefListItem: Removing index ${index} - ${itemToRemove?.offlineData?.source?.title} (${itemToRemove?.offlineData?.source?.uri})`);
            
            this.savedDownloads.splice(index, 1);
            this.saveRefList().finally(() => {
                EventRegister.emit('downloadsList', {});
                this.checkDownloadsStatus();
                resolve();

            });

        });

    }

    // From old versions
    private async refactorOldEntries(): Promise<void> {
        await refactorOldEntries(
            () => this.saveRefList(),
            this.savedDownloads,
            this.log_key
        );
    }


    // Utils 
    
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

    // List Methods
    public async checkRestartItems (): Promise<void> {

        for (const downloadItem of this.savedDownloads) {
            
            if (downloadItem?.offlineData?.session_ids?.includes(this.user_id) && downloadItem?.offlineData?.state === DownloadStates.RESTART){

                if (this.binaryDownloadsEnabled && RNBackgroundDownloader && downloadItem.offlineData.isBinary){



                } else {

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

    }

    public checkItem (uri: string): Promise<DownloadItem | null> {
        return new Promise(async (resolve, reject) => {

            if (!this.downloadsEnabled){
                return reject(new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', {
                    operation: 'checkItem',
                    uri: uri
                }));

            }

            if (!uri){
                return reject(new PlayerError('DOWNLOAD_INVALID_CONTENT_ID', {
                    operation: 'checkItem',
                    reason: 'Missing URI parameter'
                }));

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

            if (this.binaryDownloadsEnabled && RNBackgroundDownloader && newItem.offlineData.isBinary){
                newItem.offlineData.fileUri = `${this.DOWNLOADS_BINARY_DIR}/${obj.offlineData.source.id}.mp3`;

            }

            this.savedDownloads.push(newItem);
            const newItemIndex = this.savedDownloads.length - 1;

            console.log(`${this.log_key} setItemToLocal source type ${obj.offlineData.source.drmScheme} (isBinary ${newItem.offlineData.isBinary}) (index ${newItemIndex})`);

            if (this.binaryDownloadsEnabled && RNBackgroundDownloader && newItem.offlineData.isBinary){
                // Los binarios los descargamos de forma senzilla con la librería react-native-background-downloader
                const downloadId = obj.offlineData.source.id?.toString();

                const newTask = RNBackgroundDownloader.download({
                    id: downloadId,
                    url: obj.offlineData.source.uri,
                    destination: newItem.offlineData.fileUri!,
                    metadata: {}
                });

                this.saveRefList().then(async () => {
                    listToConsole(this.log_key, this.savedDownloads);
                    EventRegister.emit('downloadsList', {});
                    this.checkDownloadsStatus();
                    await this.checkTotalSize();

                }).catch((err: any) => {
                    this.checkDownloadsStatus();

                });

                this.process(newTask);
                
                return resolve();

            } else {
                // Los streams los descargamos con el módulo nativo relacionado con el player
                DownloadsModule.addItem(newItem?.offlineData?.source, newItem?.offlineData?.drm).then(() => {

                    this.saveRefList().then(async () => {
                        listToConsole(this.log_key, this.savedDownloads);
                        EventRegister.emit('downloadsList', {});
                        this.checkDownloadsStatus();
                        await this.checkTotalSize();
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

            if (!this.downloadsEnabled){
                return reject(new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', {
                    operation: 'addItem',
                    title: obj?.offlineData?.source?.title,
                    uri: obj?.offlineData?.source?.uri
                }));

            }

            console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri})`);

            if (!obj){
                return reject(new PlayerError('DOWNLOAD_INVALID_CONTENT_ID', {
                    operation: 'addItem',
                    reason: 'Missing download object'
                }));
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
                            listToConsole(this.log_key, this.savedDownloads);
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
                        return reject(new PlayerError('DOWNLOAD_QUEUE_ADD_ITEM_FAILED', {
                            operation: 'setItemToLocal',
                            originalError: ex?.message,
                            title: obj?.offlineData?.source?.title,
                            uri: obj?.offlineData?.source?.uri
                        }));

                    }

                }

            }).catch(async () => {

                console.log(`${this.log_key} Add ${obj?.offlineData?.source?.title} (${obj.offlineData?.source?.uri}): Not found...`);

                try {
                    await this.setItemToLocal(obj);
                    return resolve();

                } catch(ex: any){
                    return reject(new PlayerError('DOWNLOAD_QUEUE_ADD_ITEM_FAILED', {
                        operation: 'addItem_fallback',
                        originalError: ex?.message,
                        title: obj?.offlineData?.source?.title,
                        uri: obj?.offlineData?.source?.uri
                    }));

                }

            });

        });

    }

    public removeItem (obj: DownloadItem): Promise<void> {

        return new Promise(async (resolve, reject) => {

            if (!this.downloadsEnabled){
                return reject(new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', {
                    operation: 'removeItem',
                    title: obj?.offlineData?.source?.title,
                    uri: obj?.offlineData?.source?.uri
                }));
                
            }

            try {

                if (obj?.offlineData?.source?.uri){

                    if (this.binaryDownloadsEnabled && RNBackgroundDownloader && obj?.offlineData?.isBinary){
                        await removeUri(obj?.offlineData?.fileUri!);
                        this.onBinaryRemoved(obj?.offlineData?.source?.id!);

                    } else {
                        await DownloadsModule.removeItem(obj?.offlineData?.source, obj?.offlineData?.drm);

                        const foundAtIndex = this.savedDownloads?.findIndex(item => item.offlineData?.source?.uri === obj?.offlineData?.source?.uri);

                        if (foundAtIndex !== undefined && foundAtIndex !== null && foundAtIndex >= 0){
                            console.log(`${this.log_key} removeItem: Removing item at index ${foundAtIndex} (${obj?.offlineData?.source?.uri})`);
                            this.removeRefListItem(foundAtIndex);
                        } else {
                            console.log(`${this.log_key} removeItem: Item not found in local list (${obj?.offlineData?.source?.uri})`);
                        }

                        await this.checkTotalSize();

                    }

                }

                return resolve();

            } catch(ex:any){
                await this.onBinaryRemoved(obj?.offlineData?.source?.id!);
                return reject(new PlayerError('DOWNLOAD_QUEUE_REMOVE_FAILED', {
                    operation: 'removeItem',
                    originalError: ex?.message,
                    title: obj?.offlineData?.source?.title,
                    uri: obj?.offlineData?.source?.uri,
                    contentId: obj?.offlineData?.source?.id
                }));

            }

        });
        
    }

    public getItemById (id: string): DownloadItem | undefined {

        return this.savedDownloads?.find(item => item.offlineData.source.id === id && item.offlineData?.session_ids?.includes(this.user_id));
        
    }

    public getItemBySrc (src: string): Promise<SearchDownloadItem> {

        return new Promise((resolve, reject) => {

            const foundItem = this.savedDownloads?.find(item => (item.offlineData?.source?.uri === src || encodeURI(item.offlineData?.source?.uri) === src));

            const foundAtIndex = this.savedDownloads?.findIndex(item => (item.offlineData?.source?.uri === src || encodeURI(item.offlineData?.source?.uri) === src));

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

    public getList (): Array<DownloadItem> {
        return this.savedDownloads;
        
    }

    // Binary Tasks
    private process (task) {

        if (this.binaryDownloadsEnabled && RNBackgroundDownloader){

            const { index } = this.getTask(task.id)!;

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
        
        if (this.binaryDownloadsEnabled && RNBackgroundDownloader){
            // @ts-ignore
            const index = this.binaryTasks.findIndex(task => task.id === id);
            const task = this.binaryTasks[index];
            return { index, task };

        } else {
            return null;

        }

    }

    private checkTotalSize (): Promise<void> {
        return new Promise((resolve) => {
            calculateTotalDownloadsSize()
                .then(size => {
                    if (typeof(size) === 'number') {
                        this.size = size;
                        console.log(`${this.log_key} Total size ${this.size} --> ${formatBytes(this.size)}`);
                        EventRegister.emit('downloadsSize', { size:this.size });
                    }
                    resolve();
                })
                .catch(() => {
                    resolve();
                });
        });
    }


    // Events
    private async onProgress (data: OnDownloadProgressData): Promise<void> {
        console.log(`${this.log_key} onProgress ${JSON.stringify(data)}`);

        let searchResult = null;
        
        try {
            // Intentar búsqueda por URI primero (método original)
            searchResult = await this.getItemBySrc(data?.id);
        } catch (e) {
            // Si no se encuentra por URI, intentar buscar por ID como fallback
            try {
                searchResult = await this.getItemByIdAsync(data?.id);
            } catch (e2) {
                console.log(`${this.log_key} onProgress: Item not found by URI or ID (${data?.id}) - possible desync with native system`);
                return;
            }
        }

        if (!searchResult?.item) {
            console.log(`${this.log_key} onProgress: No valid item found for progress update`);
            return;
        }

        const obj = searchResult;

        if (!!obj.item && obj.item?.offlineData?.percent !== data?.percent && data?.percent > 0){
            console.log(`${this.log_key} onProgress: Updating item ${obj.item.offlineData?.source?.title} from ${obj.item.offlineData?.percent}% to ${data?.percent}%`);
            obj.item.offlineData.percent = data?.percent;
            this.updateRefListItem(obj.index, obj.item);
        }

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

        if (foundAtIndex !== undefined && foundAtIndex !== null && foundAtIndex >= 0){
            console.log(`${this.log_key} onLicenseReleased: Removing item at index ${foundAtIndex} (${data?.manifest})`);
            this.removeRefListItem(foundAtIndex);
        } else {
            console.log(`${this.log_key} onLicenseReleased: Item not found for manifest (${data?.manifest})`);
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

        // Intentar buscar por URI primero, luego por ID
        let searchResult = null;
        
        try {
            // Búsqueda por URI (método original)
            searchResult = await this.getItemBySrc(data?.id);
        } catch (e) {
            // Si no se encuentra por URI, intentar buscar por ID
            try {
                searchResult = await this.getItemByIdAsync(data?.id);
            } catch (e2) {
                console.log(`${this.log_key} onDownloadStateChanged: Item not found by URI or ID (${data?.id})`);
                
                if (data?.state === DownloadStates.FAILED) {
                    console.error(`${this.log_key} DOWNLOAD FAILED but item not in local list: ${data?.id}`);
                    // Emitir evento de error global para que la aplicación pueda reaccionar
                    EventRegister.emit('downloadError', {
                        id: data?.id,
                        state: data?.state,
                        message: `Download failed for ${data?.id} but item not found in local storage`
                    });
                }
                return;
            }
        }

        if (!searchResult?.item) {
            console.log(`${this.log_key} onDownloadStateChanged: No valid item found`);
            return;
        }

        const obj = searchResult;

        if (!!obj.item && obj.item?.offlineData?.state !== data?.state && data?.state !== DownloadStates.REMOVING){
            console.log(`${this.log_key} onDownloadStateChanged updating item: ${JSON.stringify(data)}`);
            obj.item.offlineData.state = data?.state;
            this.updateRefListItem(obj.index, obj.item);

            if (data?.state === DownloadStates.COMPLETED){
                await this.checkTotalSize();
    
            } else if (data?.state === DownloadStates.FAILED) {
                console.error(`${this.log_key} DOWNLOAD FAILED for item: ${obj.item?.offlineData?.source?.title} (${data?.id})`);
                EventRegister.emit('downloadError', {
                    id: data?.id,
                    state: data?.state,
                    item: obj.item,
                    message: `Download failed: ${obj.item?.offlineData?.source?.title}`
                });
            }

        } else if (!!obj.item && obj.item?.offlineData?.state !== data?.state && data?.state === DownloadStates.REMOVING){

            console.log(`${this.log_key} onDownloadStateChanged: Removing item via REMOVING state at index ${obj.index} (${data?.id})`);
            
            // Verificar que el índice sigue siendo válido (evitar condición de carrera)
            if (obj.index >= 0 && obj.index < this.savedDownloads.length && 
                this.savedDownloads[obj.index]?.offlineData?.source?.uri === data?.id) {
                
                this.removeRefListItem(obj.index).catch(error => {
                    console.error(`${this.log_key} onDownloadStateChanged: Failed to remove item at index ${obj.index}:`, error);
                });
                
            } else {
                console.log(`${this.log_key} onDownloadStateChanged: Item already removed or index changed (index: ${obj.index}, array length: ${this.savedDownloads.length})`);
            }

        }

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

        this.getItemByIdAsync(id).then(async obj => {

            obj.item.offlineData.state = DownloadStates.COMPLETED;
            this.updateRefListItem(obj.index, obj.item);
            await this.checkTotalSize();

        }).catch(() => {
            console.log(`${this.log_key} onBinaryCompleted: Item not found (${id})`);

        });

    }

    private async onBinaryRemoved (id: string): Promise<void> {
        console.log(`${this.log_key} onBinaryRemoved ${id}`);

        this.getItemByIdAsync(id).then(obj => {

            this.savedDownloads.splice(obj.index, 1);

            this.saveRefList().finally(async () => {
                listToConsole(this.log_key, this.savedDownloads);
                EventRegister.emit('downloadsList', {});
                this.checkDownloadsStatus();
                await this.checkTotalSize();

            });

        }).catch(() => {
            console.log(`${this.log_key} onBinaryRemoved: Item not found (${id})`);

        });

    }

    private async onBinaryError (id: string, err: string, errorCode: number): Promise<void> {
        console.log(`${this.log_key} onBinaryError (${errorCode}) ${err}`);

        this.getItemByIdAsync(id).then(async obj => {

            obj.item.offlineData.state = DownloadStates.FAILED;
            this.updateRefListItem(obj.index, obj.item);
            await this.checkTotalSize();

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

        this.isPending = !!pendingItems;

        console.log(`${this.log_key} Pending items for this user id: ${pendingItems} / isStarted ${this.isStarted}`);

        EventRegister.emit('downloads', { 
            isStarted: (pendingItems > 0 && !!this.isStarted),
            pending: !!pendingItems
        });

    }

    get canDownload (): boolean {
        return (this.downloadsEnabled && !!Singleton.networkState?.isConnected && (!this.download_just_wifi || Singleton.networkState?.type === 'wifi') && (!this.user_required || this.user_isLogged));

    }

}

export default Singleton.instance;
