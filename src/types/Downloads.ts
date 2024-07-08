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
};

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean;
  isWifiEnabled: boolean;
  type: string | null;
};

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