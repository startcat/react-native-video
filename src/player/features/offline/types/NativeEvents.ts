/**
 * Standardized Native Events for Downloads Module
 * 
 * This file defines the TypeScript interfaces for events emitted by the native
 * download modules (Android and iOS). Both platforms should emit events with
 * these exact field names and types.
 */

/**
 * Download progress event
 * Emitted periodically during download to report progress
 */
export interface DownloadProgressEvent {
  /** Download ID */
  id: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes (may be estimated) */
  totalBytes: number;
  /** Download speed in bytes per second */
  speed: number;
  /** Estimated remaining time in seconds */
  remainingTime: number;
}

/**
 * Download state changed event
 * Emitted when download state transitions
 */
export interface DownloadStateChangedEvent {
  /** Download ID */
  id: string;
  /** New state */
  state: DownloadState;
  /** Previous state (optional) */
  previousState?: DownloadState;
}

/**
 * Download completed event
 * Emitted when download finishes successfully
 */
export interface DownloadCompletedEvent {
  /** Download ID */
  id: string;
  /** Path to downloaded asset */
  path: string;
  /** Final size in bytes */
  totalBytes: number;
  /** Download duration in seconds */
  duration: number;
  /** True if download was partial (e.g., 98% with recoverable error) */
  partial?: boolean;
}

/**
 * Download error event
 * Emitted when download fails
 */
export interface DownloadErrorEvent {
  /** Download ID */
  id: string;
  /** Progress at time of error (0-100) */
  progress?: number;
  /** Error details */
  error: {
    /** Standardized error code */
    code: DownloadErrorCode;
    /** Human-readable error message */
    message: string;
    /** Error domain (iOS) or source (Android) */
    domain?: string;
    /** Native error code */
    errorCode?: number;
    /** Whether the download can be retried */
    recoverable?: boolean;
    /** Whether the download must be restarted from 0% */
    requiresRestart?: boolean;
  };
}

/**
 * Download prepared event
 * Emitted when download task is created and ready to start
 */
export interface DownloadPreparedEvent {
  /** Download ID */
  id: string;
  /** Also includes downloadId for compatibility */
  downloadId: string;
  /** Source URI */
  uri: string;
  /** Content title */
  title: string;
  /** Content duration in seconds (may be 0 if unknown) */
  duration: number;
  /** Available tracks */
  tracks: TrackInfo[];
  /** Selected quality setting */
  quality: string;
  /** Whether content has DRM */
  hasDRM: boolean;
  /** Success message */
  message?: string;
}

/**
 * Track information
 */
export interface TrackInfo {
  /** Track type */
  type: 'video' | 'audio' | 'text';
  /** Track ID */
  id: number | string;
  /** Language code (for audio/text) */
  language?: string;
  /** Video width (for video tracks) */
  width?: number;
  /** Video height (for video tracks) */
  height?: number;
  /** Bitrate in bps (if available) */
  bitrate?: number;
}

/**
 * Download states
 */
export type DownloadState = 
  | 'QUEUED'
  | 'PREPARING'
  | 'DOWNLOADING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REMOVING';

/**
 * Standardized error codes
 */
export type DownloadErrorCode =
  // Network errors
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_LOST'
  // Storage errors
  | 'NO_SPACE_LEFT'
  | 'STORAGE_ERROR'
  | 'FILE_NOT_FOUND'
  // Content errors
  | 'INVALID_MANIFEST'
  | 'UNSUPPORTED_FORMAT'
  | 'CONTENT_NOT_AVAILABLE'
  // DRM errors
  | 'DRM_LICENSE_ERROR'
  | 'DRM_KEY_EXPIRED'
  // Preparation errors
  | 'PREPARATION_FAILED'
  | 'PREPARATION_TIMEOUT'
  // Validation errors
  | 'ASSET_VALIDATION_FAILED'
  // Platform-specific errors
  | 'DOWNLOAD_LOST'           // iOS: app was terminated
  | 'DOWNLOAD_INTERRUPTED'
  // Generic errors
  | 'UNKNOWN_ERROR'
  | 'DOWNLOAD_FAILED';

/**
 * iOS-specific event: Download resume deferred
 * Emitted when iOS cannot resume a download and must restart
 */
export interface DownloadResumeDeferredEvent {
  /** Download ID */
  id: string;
  /** Reason for deferral */
  reason: string;
  /** Previous progress percentage before interruption */
  previousProgress: number;
}

/**
 * Event name constants
 */
export const DOWNLOAD_EVENTS = {
  PROGRESS: 'overonDownloadProgress',
  STATE_CHANGED: 'overonDownloadStateChanged',
  COMPLETED: 'overonDownloadCompleted',
  ERROR: 'overonDownloadError',
  PREPARED: 'overonDownloadPrepared',
  PREPARE_ERROR: 'overonDownloadPrepareError',
  RESUME_DEFERRED: 'overonDownloadResumeDeferred',
  PAUSED_ALL: 'overonDownloadsPaused',
  RESUMED_ALL: 'overonDownloadsResumed',
} as const;
