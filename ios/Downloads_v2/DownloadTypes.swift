import Foundation

// MARK: - Download State Enum
@objc enum DownloadState: Int, CaseIterable {
    case notDownloaded = 0
    case preparing = 1
    case queued = 2
    case downloading = 3
    case paused = 4
    case completed = 5
    case failed = 6
    case removing = 7
    case stopped = 8
    case waitingForNetwork = 9
    case licenseExpired = 10
    case drmExpired = 11
    case restarting = 12
    
    var stringValue: String {
        switch self {
        case .notDownloaded: return "NOT_DOWNLOADED"
        case .preparing: return "PREPARING"
        case .queued: return "QUEUED"
        case .downloading: return "DOWNLOADING"
        case .paused: return "PAUSED"
        case .completed: return "COMPLETED"
        case .failed: return "FAILED"
        case .removing: return "REMOVING"
        case .stopped: return "STOPPED"
        case .waitingForNetwork: return "WAITING_FOR_NETWORK"
        case .licenseExpired: return "LICENSE_EXPIRED"
        case .drmExpired: return "DRM_EXPIRED"
        case .restarting: return "RESTARTING"
        }
    }
}

// MARK: - Download Info Structure
struct DownloadInfo {
    let id: String
    let uri: String
    let title: String
    var state: DownloadState
    var progress: Float
    var totalBytes: Int64
    var downloadedBytes: Int64
    var speed: Double
    var remainingTime: Int
    var quality: String?
    var hasSubtitles: Bool
    var hasDRM: Bool
    var error: Error?
    var startTime: Date?
    var completionTime: Date?
    var assetPath: String? // Path where iOS stored the downloaded asset
}

// MARK: - Download Constants
enum DownloadConstants {
    // UserDefaults keys
    static let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates"
    static let ASSET_PATHS_KEY = "com.downloads.assetPaths"
    static let ASSET_BOOKMARKS_KEY = "com.downloads.assetBookmarks"
    static let SUBTITLE_BOOKMARKS_KEY = "com.downloads.subtitleBookmarks"
    
    // Cache TTL
    static let DOWNLOAD_SPACE_CACHE_TTL: TimeInterval = 5.0
    
    // Thresholds and defaults (SA-13)
    static let PROGRESS_THRESHOLD: Float = 0.98
    static let MIN_ASSET_SIZE: Int64 = 1_000_000
    static let DEFAULT_ESTIMATED_SIZE: Int64 = 500_000_000
}

// MARK: - Download Quality
enum DownloadQuality: String {
    case low
    case medium
    case high
    case auto
    
    var minBitrate: Int {
        switch self {
        case .low: return 500_000
        case .medium: return 1_500_000
        case .high: return 3_000_000
        case .auto: return 0
        }
    }
}
