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
  disabled?: boolean;
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

// Downloads Actions Events

export type OnDownloadProgressData = Readonly<{

}>;

export type OnDownloadStateChangedData = Readonly<{

}>;

export type OnDownloadCompletedData = Readonly<{

}>;

export type OnDownloadRemovedData = Readonly<{

}>;

// License Events

export type OnLicenseDownloadedData = Readonly<{

}>;

export type OnLicenseDownloadFailedData = Readonly<{

}>;

export type OnLicenseCheckData = Readonly<{

}>;

export type OnLicenseCheckFailedData = Readonly<{

}>;

export type OnLicenseReleaseData = Readonly<{

}>;

export type OnLicenseReleaseFailedData = Readonly<{

}>;

export type OnLicenseKeysRestoredData = Readonly<{

}>;

export type OnLicenseRestoreFailedData = Readonly<{

}>;

export type OnAllLicensesReleasedData = Readonly<{

}>;

export type OnAllLicensesReleaseFailedData = Readonly<{

}>;

export type OnPreparedData = Readonly<{

}>;

export type OnPrepareErrorData = Readonly<{

}>;
