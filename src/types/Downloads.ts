import type {
  Drm,
} from './video';

export enum DownloadStates {
  RESTART = 'RESTART',
  RESTARTING = 'RESTARTING',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED',
  REMOVING = 'REMOVING',
  DOWNLOADING = 'DOWNLOADING',
  STOPPED = 'STOPPED'
};

export type ConfigDownloads = {
  enabled?: boolean;
  download_just_wifi?: boolean;
  log_key?: string;
};

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean;
  isWifiEnabled: boolean;
  type: string | null;
};

export type ReadDirItem = {
	ctime: Date | undefined // The creation date of the file (iOS only)
	mtime: Date | undefined // The last modified date of the file
	name: string // The name of the item
	path: string // The absolute path to the item
	size: number // Size in bytes
	isFile: () => boolean // Is the file just a file?
	isDirectory: () => boolean // Is the file a directory?
}

export type DownloadItem = {
  media: any;
  offlineData: {
      session_ids:Array<string>;
      source: {
          ...source,
          title: string;
      },
      state: DownloadStates;
      drm: Drm;
  }
};

export type PromiseFunction = Promise<any> | ((params: Params) => Promise<any>);
export type ReturnPromise<T> = [T | null, null | Error];