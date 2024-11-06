import type {
  Drm,
} from './video';

export enum DownloadStates {
  RESTART = 'RESTART',
  RESTARTING = 'RESTARTING',
  FAILED = 'FAILED',
  REMOVING = 'REMOVING',
  STOPPED = 'STOPPED',
  DOWNLOADING = 'DOWNLOADING',
  NOT_DOWNLOADED = 'NOT_DOWNLOADED',
  COMPLETED = 'COMPLETED',
  QUEUED = 'QUEUED'
};

export type ConfigDownloads = {
  disabled?: boolean;
  user_required?: boolean;
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
	ctime: Date | undefined;
	mtime: Date | undefined;
	name: string;
	path: string;
	size: number;
	isFile: () => boolean;
	isDirectory: () => boolean;
}

export type DownloadItem = {
  media?: any;
  offlineData: {
    session_ids:Array<string>;
    source: {
      id: string;
      title: string;
      uri: string;
      type?: string;
      drmScheme?: string;
      dvrWindowMinutes?:number;
    },
    state: DownloadStates;
    drm?: Drm;
    percent?: number;
  }
};

export type NewDownloadItem = {
  media?: any;
  offlineData: {
    session_ids?:Array<string>;
    source: {
      id: string;
      title: string;
      uri: string;
      drmScheme: string;
      dvrWindowMinutes?:number;
    },
    state?: DownloadStates;
    drm?: Drm;
  }
};

export type SearchDownloadItem = {
  item: DownloadItem;
  index: number;
}

// Downloads Actions Events

export type OnDownloadProgressData = Readonly<{
  id: string;
  percent: number;
}>;

export type OnDownloadStateChangedData = Readonly<{
  id: string;
  state: DownloadStates
}>;

export type OnDownloadCompletedData = Readonly<{

}>;

export type OnDownloadRemovedData = Readonly<{

}>;

// License Events

export type OnLicenseDownloadedData = Readonly<{
  manifest: string;
}>;

export type OnLicenseDownloadFailedData = Readonly<{
  manifest: string;
  error?: string;
  code?: number;
}>;

export type OnLicenseCheckData = Readonly<{
  manifest: string;
  isValid: boolean;
}>;

export type OnLicenseCheckFailedData = Readonly<{
  manifest: string;
  error?: string;
  code?: number;
}>;

export type OnLicenseReleasedData = Readonly<{
  manifest: string;
}>;

export type OnLicenseReleasedFailedData = Readonly<{
  manifest: string;
  error?: string;
  code?: number;
}>;

export type OnLicenseKeysRestoredData = Readonly<{
  manifest: string;
}>;

export type OnLicenseRestoreFailedData = Readonly<{
  manifest: string;
  error?: string;
  code?: number;
}>;

export type OnAllLicensesReleasedData = Readonly<{

}>;

export type OnAllLicensesReleaseFailedData = Readonly<{
  error?: string;
  code?: number;
}>;

export type OnPreparedData = Readonly<{
  mediaId: string;
}>;

export type OnPrepareErrorData = Readonly<{
  mediaId: string;
  error?: string;
}>;
