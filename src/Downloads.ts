import { Platform, DeviceEventEmitter, NativeEventEmitter, NativeModules } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { EventRegister } from 'react-native-event-listeners';

import type {
    ConfigDownloads,
    NetworkState,
    ReadDirItem,
    DownloadItem
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
    private firstMounted: boolean = false;
    private download_just_wifi: boolean = true;
    private log_key: string = `[Downloads]`;

    public isStarted: boolean = false;
    public size: number = 0;

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

        this.download_just_wifi = !!config.download_just_wifi;

        if (config.log_key){
            this.log_key = config.log_key;

        }

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
                            console.log(`${this.log_key} getNetworkInfo update - isConnected? ${state?.isConnected} (${state?.type})`);

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

                        console.log(`${this.log_key} Initialized`);
                        
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

        return new Promise((resolve) => {
            NetInfo.fetch().then((state: any) => {
                console.log(`${log_key} getNetworkInfo - isConnected? ${state?.isConnected} (${state?.type})`);
                
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


    }

    public checkItem (uri: string): Promise<DownloadItem | null | Error> {
        return new Promise(async (resolve, reject) => {

            if (DISABLED){
                return reject();

            }

            //console.log(`${this.log_key} checkItem ${JSON.stringify(uri)}`);

            if (!uri){
                return reject(`Incomplete media data`);
            }

            await DownloadsModule.getItem(uri).then(res => {
                //console.log(`${this.log_key} checkItem (${uri}) ${JSON.stringify(res)}`);
                resolve(res);

            }).catch(err => {
                console.log(`${this.log_key} checkItem  error (${uri}) ${JSON.stringify(err)}`);
                reject(err);

            });

        });
        
    }

    public addItem (obj: DownloadItem): Promise<void | Error> {

        return new Promise(async (resolve, reject) => {

        });

    }

    public removeItem (obj: DownloadItem): Promise<void | Error> {

        return new Promise(async (resolve, reject) => {

        });
        
    }

    public getItem (): Promise<DownloadItem | null | Error> {

        return new Promise(async (resolve, reject) => {

        });
        
    }

    public getItemBySrc (src: string): Promise<DownloadItem | null | Error> {

        return new Promise((resolve, reject) => {


        });
        
    }

    public getItemIndex (obj: DownloadItem): Promise<number | Error> {

        return new Promise((resolve, reject) => {


        });
        
    }

    public getList (): Array<DownloadItem> {
        return [];
        
    }

    // Directories
    public readDirectory (dir: string): Promise<number | Error>  {

        return new Promise((resolve, reject) => {

            let dirSize = 0;

            RNFS.readDir(dir).then(async (result: ReadDirItem[]): Promise<void> => {

                for (const item of result) {

                    if (item.isDirectory()){
                        await this.readDirectory(item.path).then(size => {

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

    private getAppleDownloadsDirectory (dir: string): Promise<string | Error> {

        return new Promise((resolve, reject) => {

            let path = '';

            RNFS.readDir(dir).then(async (result: ReadDirItem[]) => {

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

    private checkTotalSize (): Promise<void | Error> {

        return new Promise((resolve, reject) => {

            if (Platform.OS === 'ios'){

                this.getAppleDownloadsDirectory(DOWNLOADS_DIR).then(path => {

                    if (typeof(path) === 'string'){

                        this.readDirectory(path).then(size => {

                            if (typeof(size) === 'number'){
                                this.size = size;
                                console.log(`${this.log_key} Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                                EventRegister.emit('downloadsSize', { size:this.size });

                            }

                            resolve();

                        }). catch(err => {
                            reject(err);

                        });

                    }

                }). catch(err => {
                    reject(err);

                });

            } else {

                this.readDirectory(DOWNLOADS_DIR).then(size => {

                    if (typeof(size) === 'number'){
                        this.size = size;
                        console.log(`${this.log_key} Total size ${this.size} --> ${this.formatBytes(this.size)}`);
                        EventRegister.emit('downloadsSize', { size:this.size });

                    }

                    resolve();

                }). catch(err => {
                    reject(err);

                });

            }

        });

    }


    // Events
    private async onProgress (data: any): Promise<void> {
        console.log(`${this.log_key} onProgress ${JSON.stringify(data)}`);

    }

    private async onLicenseDownloaded (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseDownloaded ${JSON.stringify(data)}`);

    }

    private async onLicenseDownloadFailed (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseDownloadFailed ${JSON.stringify(data)}`);

    }

    private async onLicenseCheck (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseCheck ${JSON.stringify(data)}`);

    }
    
    private async onLicenseCheckFailed (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseCheckFailed ${JSON.stringify(data)}`);

    }
    
    private async onLicenseReleased (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseReleased ${JSON.stringify(data)}`);

    }
    
    private async onLicenseReleaseFailed (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseReleaseFailed ${JSON.stringify(data)}`);

    }
    
    private async onLicenseKeysRestored (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseKeysRestored ${JSON.stringify(data)}`);

    }
    
    private async onLicenseRestoreFailed (data: any): Promise<void> {
        console.log(`${this.log_key} onLicenseRestoreFailed ${JSON.stringify(data)}`);

    }
    
    private async onAllLicensesReleased (data: any): Promise<void> {
        console.log(`${this.log_key} onAllLicensesReleased ${JSON.stringify(data)}`);

    }
    
    private async onAllLicensesReleaseFailed (data: any): Promise<void> {
        console.log(`${this.log_key} onAllLicensesReleaseFailed ${JSON.stringify(data)}`);

    }
    
    private async onPrepared (data: any): Promise<void> {
        console.log(`${this.log_key} onPrepared ${JSON.stringify(data)}`);

    }
    
    private async onPrepareError (data: any): Promise<void> {
        console.log(`${this.log_key} onPrepareError ${JSON.stringify(data)}`);

    }
    
    private async onDownloadStateChanged (data: any): Promise<void> {
        console.log(`${this.log_key} onDownloadStateChanged ${JSON.stringify(data)}`);

    }

    private async onCompleted (data: any): Promise<void> {
        console.log(`${this.log_key} onCompleted ${JSON.stringify(data)}`);

    }

    private async onRemoved (data: any): Promise<void> {
        console.log(`${this.log_key} onRemoved ${JSON.stringify(data)}`);

    }



    // Actions
    public checkDownloadsStatus (): void {

    }

    public download (id: string): Promise<void> {

        return new Promise((resolve, reject) => {



        });

    }

    public remove (path: string) {

        return RNFS.unlink(path);

    }

    get canDownload (): boolean {
        return (!!Singleton.networkState?.isConnected && (!this.download_just_wifi || Singleton.networkState?.type === 'wifi'));

    }

}

export default Singleton.instance;
