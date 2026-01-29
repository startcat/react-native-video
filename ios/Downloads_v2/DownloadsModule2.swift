import Foundation
import AVFoundation
import React
import UIKit

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

// MARK: - Main Downloads Module Class
@objc(DownloadsModule2)
class DownloadsModule2: RCTEventEmitter {
    
    // MARK: - Singleton for offline playback access
    private static var sharedInstance: DownloadsModule2?
    
    /// Get the shared instance (may be nil if module not initialized)
    @objc static var shared: DownloadsModule2? {
        return sharedInstance
    }
    
    /// Get the asset path for a download by ID (for offline playback)
    /// Returns the path if the download is completed and the file exists
    @objc func getOfflineAssetPath(forId downloadId: String) -> String? {
        // First check activeDownloads in memory
        if let downloadInfo = activeDownloads[downloadId],
           downloadInfo.state == .completed,
           let assetPath = downloadInfo.assetPath {
            // Try original path first (iOS uses /.nofollow prefix for symlinks)
            if FileManager.default.fileExists(atPath: assetPath) {
                return assetPath
            }
            // Try without /.nofollow prefix
            if assetPath.hasPrefix("/.nofollow") {
                let cleanPath = String(assetPath.dropFirst("/.nofollow".count))
                if FileManager.default.fileExists(atPath: cleanPath) {
                    return cleanPath
                }
            }
        }
        
        // Try bookmark data (survives sandbox UUID changes)
        if let resolvedURL = resolveAssetBookmark(forDownloadId: downloadId) {
            let resolvedPath = resolvedURL.path
            if FileManager.default.fileExists(atPath: resolvedPath) {
                return resolvedPath
            }
        }
        
        // Fallback to UserDefaults paths (may be stale after recompile)
        let assetPathsKey = "com.downloads.assetPaths"
        if let assetPaths = UserDefaults.standard.dictionary(forKey: assetPathsKey) as? [String: String],
           let assetPath = assetPaths[downloadId] {
            // Try original path first
            if FileManager.default.fileExists(atPath: assetPath) {
                return assetPath
            }
            // Try without /.nofollow prefix
            if assetPath.hasPrefix("/.nofollow") {
                let cleanPath = String(assetPath.dropFirst("/.nofollow".count))
                if FileManager.default.fileExists(atPath: cleanPath) {
                    return cleanPath
                }
            }
        }
        
        return nil
    }
    
    /// Static method to get offline asset path without needing instance
    @objc static func getOfflineAssetPathStatic(forId downloadId: String) -> String? {
        // First try shared instance
        if let path = sharedInstance?.getOfflineAssetPath(forId: downloadId) {
            return path
        }
        
        // Try bookmark data directly (survives sandbox UUID changes)
        let bookmarksKey = "com.downloads.assetBookmarks"
        if let bookmarks = UserDefaults.standard.dictionary(forKey: bookmarksKey) as? [String: Data],
           let bookmarkData = bookmarks[downloadId] {
            var bookmarkDataIsStale = false
            do {
                let url = try URL(resolvingBookmarkData: bookmarkData, bookmarkDataIsStale: &bookmarkDataIsStale)
                if FileManager.default.fileExists(atPath: url.path) {
                    return url.path
                }
            } catch {
                // Bookmark resolution failed
            }
        }
        
        // Fallback to direct UserDefaults paths
        let assetPathsKey = "com.downloads.assetPaths"
        if let assetPaths = UserDefaults.standard.dictionary(forKey: assetPathsKey) as? [String: String],
           let assetPath = assetPaths[downloadId] {
            if FileManager.default.fileExists(atPath: assetPath) {
                return assetPath
            }
            // Try without /.nofollow prefix
            if assetPath.hasPrefix("/.nofollow") {
                let cleanPath = String(assetPath.dropFirst("/.nofollow".count))
                if FileManager.default.fileExists(atPath: cleanPath) {
                    return cleanPath
                }
            }
        }
        
        return nil
    }
    
    /// Static method to get offline asset URL directly (preferred for HLS offline playback)
    /// Uses bookmarks as primary source (survives sandbox changes), falls back to paths
    static func getOfflineAssetURLStatic(forId downloadId: String) -> URL? {
        // Helper to check path and create URL
        // IMPORTANT: Use URL(fileURLWithPath:) instead of URL(string:) to handle special characters correctly
        func tryPath(_ path: String) -> URL? {
            if FileManager.default.fileExists(atPath: path) {
                // Use fileURLWithPath to properly handle spaces, apostrophes, and other special characters
                return URL(fileURLWithPath: path)
            }
            // Try without /.nofollow prefix (iOS symlink prefix)
            if path.hasPrefix("/.nofollow") {
                let cleanPath = String(path.dropFirst("/.nofollow".count))
                if FileManager.default.fileExists(atPath: cleanPath) {
                    return URL(fileURLWithPath: cleanPath)
                }
            }
            return nil
        }
        
        // PRIORITY 1: Try bookmark data (survives sandbox UUID changes)
        let bookmarksKey = "com.downloads.assetBookmarks"
        if let bookmarks = UserDefaults.standard.dictionary(forKey: bookmarksKey) as? [String: Data],
           let bookmarkData = bookmarks[downloadId] {
            var isStale = false
            do {
                let resolvedURL = try URL(resolvingBookmarkData: bookmarkData, bookmarkDataIsStale: &isStale)
                if FileManager.default.fileExists(atPath: resolvedURL.path) {
                    return resolvedURL
                }
            } catch {
                // Bookmark resolution failed, try other methods
            }
        }
        
        // PRIORITY 2: Try sharedInstance's in-memory activeDownloads
        if let downloadInfo = sharedInstance?.activeDownloads[downloadId],
           downloadInfo.state == .completed,
           let assetPath = downloadInfo.assetPath {
            if let url = tryPath(assetPath) {
                return url
            }
        }
        
        // PRIORITY 3: Try UserDefaults saved paths (fallback)
        let assetPathsKey = "com.downloads.assetPaths"
        if let assetPaths = UserDefaults.standard.dictionary(forKey: assetPathsKey) as? [String: String],
           let assetPath = assetPaths[downloadId] {
            if let url = tryPath(assetPath) {
                return url
            }
        }
        
        return nil
    }
    
    // MARK: - Properties
    private var downloadsSession: AVAssetDownloadURLSession?
    private var activeDownloads: [String: DownloadInfo] = [:]
    private var downloadTasks: [String: AVAggregateAssetDownloadTask] = [:]
    private var contentKeySession: AVContentKeySession?

    // Configuration
    private var downloadDirectory: String = "Downloads"
    private var tempDirectory: String = "Temp"
    private var subtitlesDirectory: String = "Subtitles"
    private var maxConcurrentDownloads: Int = 3
    private var notificationsEnabled: Bool = true
    private var currentStreamQuality: String = "auto"
    private var allowCellularDownloads: Bool = false
    private var requireWifi: Bool = true
    
    // State tracking
    private var isInitialized: Bool = false
    private let downloadQueue = DispatchQueue(label: "com.downloads.queue", qos: .background)
    
    // Track completion state - delegates can arrive in any order
    private var pendingLocations: [String: URL] = [:]  // Location from didFinishDownloadingTo
    private var completedWithoutError: Set<String> = []  // Downloads that completed without error
    
    // Cache para downloadSpace (evitar cálculos costosos)
    private var cachedDownloadSpace: Int64 = 0
    private var downloadSpaceCacheTime: Date?
    private let DOWNLOAD_SPACE_CACHE_TTL: TimeInterval = 5.0 // 5 segundos
    
    // Progress timer - only runs when there are active downloads
    private var progressTimer: Timer?
    
    // Persistencia de asset paths para recuperar después de restart
    private let ASSET_PATHS_KEY = "com.downloads.assetPaths"
    private let ASSET_BOOKMARKS_KEY = "com.downloads.assetBookmarks" // NEW: Use bookmarkData for persistence
    private let SUBTITLE_BOOKMARKS_KEY = "com.downloads.subtitleBookmarks" // Bookmarks for subtitle files (survives sandbox UUID changes)
    private let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates" // NUEVO: Persistir descargas en progreso
    
    // Speed tracking
    private var lastProgressUpdate: [String: (bytes: Int64, time: Date)] = [:]
    // Track last reported progress percentage to avoid duplicate emissions
    private var lastReportedProgress: [String: Int] = [:]
    
    // MARK: - RCTEventEmitter Overrides
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    override func supportedEvents() -> [String]! {
        return [
            "overonDownloadProgress",
            "overonDownloadStateChanged",
            "overonDownloadCompleted",
            "overonDownloadError",
            "overonLicenseDownloaded",
            "overonLicenseError",
            "overonLicenseExpired",
            "overonLicenseCheck",
            "overonLicenseCheckFailed",
            "overonLicenseReleased",
            "overonLicenseReleaseFailed",
            "overonLicenseKeysRestored",
            "overonLicenseRestoreFailed",
            "overonAllLicensesReleased",
            "overonAllLicensesReleaseFailed",
            "overonNetworkChanged",
            "overonStorageWarning",
            "overonDownloadsPaused",
            "overonDownloadsResumed",
            "overonDownloadResumeDeferred",
            "overonDownloadResumedAfterDefer",
            "overonDownloadPrepared",
            "overonDownloadPrepareError"
        ]
    }
    
    // MARK: - Initialization Methods
    @objc func moduleInit(_ config: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Set shared instance for offline playback access
        DownloadsModule2.sharedInstance = self
        
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                if let config = config {
                    self.updateModuleConfig(config)
                }
                
                try self.initializeDownloadSession()
                try self.createDirectoriesIfNeeded()
                self.setupContentKeySession()
                self.setupNetworkMonitoring()
                
                // Pausar todas las descargas por defecto - JavaScript controlará cuando resumir
                self.pauseAllDownloads()
                
                self.isInitialized = true
                
                DispatchQueue.main.async {
                    resolve(self.getSystemInfoDict())
                }
            } catch {
                DispatchQueue.main.async {
                    reject("INIT_FAILED", "Failed to initialize DownloadsModule2: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func setDownloadDirectories(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                if let downloadDir = config["downloadDir"] as? String {
                    self.downloadDirectory = downloadDir
                }
                if let tempDir = config["tempDir"] as? String {
                    self.tempDirectory = tempDir
                }
                if let subtitlesDir = config["subtitlesDir"] as? String {
                    self.subtitlesDirectory = subtitlesDir
                }
                
                try self.createDirectoriesIfNeeded()
                
                DispatchQueue.main.async {
                    resolve(nil)
                }
            } catch {
                DispatchQueue.main.async {
                    reject("DIRECTORY_CONFIG_FAILED", "Failed to configure directories: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func getSystemInfo(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let systemInfo = self.getSystemInfoDict()
            
            DispatchQueue.main.async {
                resolve(systemInfo)
            }
        }
    }
    
    @objc func getDownloadsFolderSize(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let totalSize = self.calculateTotalDownloadsSize()
            
            DispatchQueue.main.async {
                resolve([
                    "totalBytes": totalSize,
                    "totalMB": Double(totalSize) / 1024.0 / 1024.0,
                    "downloadCount": self.activeDownloads.filter { $0.value.state == .completed }.count
                ])
            }
        }
    }
    
    // MARK: - Download Management Methods
    @objc func addDownload(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            guard self.isInitialized else {
                DispatchQueue.main.async {
                    reject("NOT_INITIALIZED", "DownloadsModule2 not initialized", nil)
                }
                return
            }
            
            do {
                guard self.validateDownloadConfig(config) else {
                    DispatchQueue.main.async {
                        reject("INVALID_CONFIG", "Invalid download configuration", nil)
                    }
                    return
                }
                
                let id = config["id"] as! String
                let uri = config["uri"] as! String
                let title = config["title"] as! String
                // Check if download already exists (puede haber sido restaurado)
                if let existingDownload = self.activeDownloads[id] {
                    // Si la descarga está pausada, intentar reanudarla
                    if existingDownload.state == .paused {
                        // Si hay una tarea asociada, reanudarla
                        if let downloadTask = self.downloadTasks[id] {
                            downloadTask.resume()
                            var downloadInfo = existingDownload
                            downloadInfo.state = .downloading
                            self.activeDownloads[id] = downloadInfo
                            self.persistDownloadState()
                            self.startProgressTimerIfNeeded()
                            
                            self.sendEvent(withName: "overonDownloadStateChanged", body: [
                                "id": id,
                                "state": downloadInfo.state.stringValue
                            ])
                            
                            DispatchQueue.main.async {
                                resolve(nil)
                            }
                            return
                        } else {
                            // Emitir evento para informar a JavaScript
                            self.sendEvent(withName: "overonDownloadResumeDeferred", body: [
                                "id": id,
                                "reason": "iOS task was lost - HLS downloads must restart",
                                "previousProgress": Int(existingDownload.progress * 100)
                            ])
                            
                            // Limpiar descarga existente para recrear desde 0%
                            self.activeDownloads.removeValue(forKey: id)
                            // Continuar para recrear la tarea (comenzará desde 0%)
                        }
                    }
                    // Si ya está descargando o completada, simplemente devolver éxito
                    else if existingDownload.state == .downloading || existingDownload.state == .completed {
                        DispatchQueue.main.async {
                            resolve(nil)
                        }
                        return
                    }
                    // Si está en otro estado (failed, etc), permitir recrear
                    else {
                        // Limpiar descarga existente
                        self.activeDownloads.removeValue(forKey: id)
                        self.downloadTasks.removeValue(forKey: id)
                    }
                }
                
                // Create download info - Verificar si había una descarga previa restaurada (para preservar progreso)
                let restoredDownload = self.activeDownloads[id]
                
                var downloadInfo = DownloadInfo(
                    id: id,
                    uri: uri,
                    title: title,
                    state: .preparing,
                    progress: restoredDownload?.progress ?? 0.0,
                    totalBytes: restoredDownload?.totalBytes ?? 0,
                    downloadedBytes: restoredDownload?.downloadedBytes ?? 0,
                    speed: 0.0,
                    remainingTime: 0,
                    quality: config["quality"] as? String ?? restoredDownload?.quality,
                    hasSubtitles: (config["subtitles"] as? NSArray)?.count ?? 0 > 0,
                    hasDRM: config["drm"] != nil,
                    error: nil,
                    startTime: restoredDownload?.startTime ?? Date(),
                    assetPath: restoredDownload?.assetPath
                )
                
                self.activeDownloads[id] = downloadInfo
                
                // Create AVURLAsset
                guard let url = URL(string: uri) else {
                    DispatchQueue.main.async {
                        reject("INVALID_URI", "Invalid download URI", nil)
                    }
                    return
                }
                
                // Configurar opciones del asset con headers HTTP si están presentes
                var assetOptions: [String: Any] = [:]
                
                // Agregar headers HTTP - incluir User-Agent por defecto si no está configurado
                var headers = config["headers"] as? [String: String] ?? [:]
                if headers["User-Agent"] == nil {
                    // Use Safari User-Agent to avoid server blocking
                    headers["User-Agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                }
                if !headers.isEmpty {
                    assetOptions["AVURLAssetHTTPHeaderFieldsKey"] = headers
                }
                
                // Agregar cookies HTTP
                if let cookies = HTTPCookieStorage.shared.cookies {
                    assetOptions[AVURLAssetHTTPCookiesKey] = cookies
                }
                
                let asset = AVURLAsset(url: url, options: assetOptions)
                
                // Handle DRM if present
                if let drmConfig = config["drm"] as? NSDictionary {
                    try self.setupDRMForAsset(asset, config: drmConfig, contentId: id)
                }
                
                // Create download task - Clean up any existing task for this ID
                if let existingTask = self.downloadTasks[id] {
                    existingTask.cancel()
                    self.downloadTasks.removeValue(forKey: id)
                }
                
                let downloadTask = try self.createDownloadTask(for: asset, with: downloadInfo, downloadId: id)
                self.downloadTasks[id] = downloadTask
                
                // Update state and start download
                downloadInfo.state = .queued
                self.activeDownloads[id] = downloadInfo
                
                // Emit prepared event (consistent with Android)
                self.emitDownloadPrepared(downloadId: id, downloadInfo: downloadInfo, asset: asset)
                
                // Persistir estado
                self.persistDownloadState()
                self.startDownloadIfPossible(id)
                DispatchQueue.main.async {
                    resolve(nil)
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("ADD_DOWNLOAD_FAILED", "Failed to add download: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func removeDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                // Cancel download task if active
                if let downloadTask = self.downloadTasks[downloadId] {
                    downloadTask.cancel()
                    self.downloadTasks.removeValue(forKey: downloadId)
                }
                
                // Remove download info
                self.activeDownloads.removeValue(forKey: downloadId)
                self.lastProgressUpdate.removeValue(forKey: downloadId)
                self.lastReportedProgress.removeValue(forKey: downloadId)
                
                // Remove asset path from UserDefaults (IMPORTANTE para cálculo de espacio)
                self.removeAssetPath(forDownloadId: downloadId)
                
                // Remove downloaded files
                try self.removeDownloadedFiles(for: downloadId)
                
                // Persistir estado actualizado
                self.persistDownloadState()
                
                // Invalidar cache de downloadSpace
                self.invalidateDownloadSpaceCache()
                
                // Release license if DRM
                self.releaseLicenseForDownload(downloadId)
                
                DispatchQueue.main.async {
                    resolve(nil)
                }
                
            } catch {
                DispatchQueue.main.async {
                    reject("REMOVE_DOWNLOAD_FAILED", "Failed to remove download: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func pauseDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            guard var downloadInfo = self.activeDownloads[downloadId] else {
                DispatchQueue.main.async {
                    reject("DOWNLOAD_NOT_FOUND", "Download not found", nil)
                }
                return
            }
            
            if let downloadTask = self.downloadTasks[downloadId] {
                downloadTask.suspend()
                downloadInfo.state = .paused
                self.activeDownloads[downloadId] = downloadInfo
                
                // Persistir estado
                self.persistDownloadState()
                
                self.sendEvent(withName: "overonDownloadStateChanged", body: [
                    "id": downloadId,
                    "state": downloadInfo.state.stringValue
                ])
            }
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    @objc func resumeDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            guard var downloadInfo = self.activeDownloads[downloadId] else {
                DispatchQueue.main.async {
                    reject("DOWNLOAD_NOT_FOUND", "Download not found", nil)
                }
                return
            }
            
            if let downloadTask = self.downloadTasks[downloadId] {
                downloadTask.resume()
                downloadInfo.state = .downloading
                self.activeDownloads[downloadId] = downloadInfo
                
                // Persistir estado
                self.persistDownloadState()
                self.startProgressTimerIfNeeded()
                
                self.sendEvent(withName: "overonDownloadStateChanged", body: [
                    "id": downloadId,
                    "state": downloadInfo.state.stringValue
                ])
            }
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    @objc func cancelDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Same as removeDownload for now
        removeDownload(downloadId, resolver: resolve, rejecter: reject)
    }
    
    // MARK: - Global Control Methods
    @objc func pauseAll(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            for (downloadId, downloadTask) in self.downloadTasks {
                downloadTask.suspend()
                if var downloadInfo = self.activeDownloads[downloadId] {
                    downloadInfo.state = .paused
                    self.activeDownloads[downloadId] = downloadInfo
                }
            }
            
            // Persistir estado de todas las descargas pausadas
            self.persistDownloadState()
            self.stopProgressTimerIfNotNeeded()
            
            self.sendEvent(withName: "overonDownloadsPaused", body: ["reason": "user"])
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    @objc func resumeAll(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            for (downloadId, downloadTask) in self.downloadTasks {
                downloadTask.resume()
                if var downloadInfo = self.activeDownloads[downloadId] {
                    downloadInfo.state = .downloading
                    self.activeDownloads[downloadId] = downloadInfo
                }
            }
            
            // Persistir estado de todas las descargas reanudadas
            self.persistDownloadState()
            self.startProgressTimerIfNeeded()
            
            self.sendEvent(withName: "overonDownloadsResumed", body: ["reason": "user"])
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    @objc func cancelAll(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            for (downloadId, downloadTask) in self.downloadTasks {
                downloadTask.cancel()
            }
            
            self.downloadTasks.removeAll()
            self.activeDownloads.removeAll()
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    // MARK: - Query Methods
    @objc func getDownloads(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let downloadsArray = self.activeDownloads.values.map { downloadInfo in
                return self.createDownloadInfoDict(from: downloadInfo)
            }
            
            DispatchQueue.main.async {
                resolve(["downloads": downloadsArray])
            }
        }
    }
    
    @objc func getDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            if let downloadInfo = self.activeDownloads[downloadId] {
                let downloadDict = self.createDownloadInfoDict(from: downloadInfo)
                DispatchQueue.main.async {
                    resolve(downloadDict)
                }
            } else {
                DispatchQueue.main.async {
                    resolve(nil)
                }
            }
        }
    }
    
    @objc func hasDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let exists = self.activeDownloads[downloadId] != nil
            DispatchQueue.main.async {
                resolve(exists)
            }
        }
    }
    
    @objc func getStats(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let downloads = Array(self.activeDownloads.values)
            
            let active = downloads.filter { $0.state == .downloading }.count
            let queued = downloads.filter { $0.state == .queued }.count
            let completed = downloads.filter { $0.state == .completed }.count
            let failed = downloads.filter { $0.state == .failed }.count
            let totalDownloaded = downloads.reduce(0) { $0 + $1.downloadedBytes }
            let averageSpeed = downloads.filter { $0.state == .downloading }.reduce(0.0) { $0 + $1.speed } / Double(max(1, active))
            
            let stats = [
                "activeDownloads": active,
                "queuedDownloads": queued,
                "completedDownloads": completed,
                "failedDownloads": failed,
                "totalDownloaded": totalDownloaded,
                "averageSpeed": averageSpeed
            ] as [String : Any]
            
            DispatchQueue.main.async {
                resolve(stats)
            }
        }
    }
    
    // MARK: - Configuration Methods
    @objc func setStreamQuality(_ quality: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        currentStreamQuality = quality
        resolve(nil)
    }
    
    @objc func setNetworkPolicy(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let allowCellular = config["allowCellular"] as? Bool {
            allowCellularDownloads = allowCellular
        }
        if let requireWifi = config["requireWifi"] as? Bool {
            self.requireWifi = requireWifi
        }
        
        applyNetworkPolicy()
        resolve(nil)
    }
    
    @objc func setDownloadLimits(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let maxConcurrent = config["maxConcurrent"] as? Int {
            maxConcurrentDownloads = maxConcurrent
        }
        resolve(nil)
    }
    
    @objc func setNotificationConfig(_ config: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let enabled = config["enabled"] as? Bool {
            notificationsEnabled = enabled
        }
        resolve(nil)
    }
    
    // MARK: - DRM Management Methods
    @objc func downloadLicense(_ contentId: String, drmConfig: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                try self.downloadLicenseForContent(contentId, config: drmConfig)
                DispatchQueue.main.async {
                    resolve(nil)
                }
            } catch {
                DispatchQueue.main.async {
                    reject("LICENSE_DOWNLOAD_FAILED", "Failed to download license: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func checkLicense(_ contentId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let isValid = self.checkLicenseValidity(for: contentId)
            
            self.sendEvent(withName: "overonLicenseCheck", body: [
                "contentId": contentId,
                "isValid": isValid
            ])
            
            DispatchQueue.main.async {
                resolve(nil)
            }
        }
    }
    
    @objc func renewLicense(_ contentId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for license renewal
        resolve(nil)
    }
    
    @objc func releaseLicense(_ contentId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        releaseLicenseForDownload(contentId)
        resolve(nil)
    }
    
    @objc func releaseAllLicenses(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for releasing all licenses
        resolve(nil)
    }
    
    // MARK: - Subtitle Management Methods
    @objc func addSubtitles(_ downloadId: String, subtitles: NSArray, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for adding subtitles
        resolve(nil)
    }
    
    @objc func removeSubtitles(_ downloadId: String, languages: NSArray, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for removing subtitles
        resolve(nil)
    }
    
    @objc func getSubtitles(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for getting subtitles
        resolve([])
    }
    
    /// Save a bookmark for a subtitle file path (survives sandbox UUID changes)
    /// Called from TypeScript after downloading a subtitle file
    @objc func saveSubtitleBookmarkFromPath(_ downloadId: String, language: String, filePath: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let url = URL(fileURLWithPath: filePath)
        
        // Verify file exists before saving bookmark
        guard FileManager.default.fileExists(atPath: filePath) else {
            reject("SUBTITLE_NOT_FOUND", "Subtitle file not found at path: \(filePath)", nil)
            return
        }
        
        saveSubtitleBookmark(for: url, downloadId: downloadId, language: language)
        resolve(true)
    }
    
    /// Resolve a subtitle bookmark to get the current valid path
    /// Returns the resolved path or null if bookmark doesn't exist or file is missing
    @objc func resolveSubtitlePath(_ downloadId: String, language: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let resolvedURL = resolveSubtitleBookmark(forDownloadId: downloadId, language: language) {
            resolve(resolvedURL.path)
        } else {
            // Return null instead of rejecting - caller can handle fallback
            resolve(NSNull())
        }
    }
    
    /// Resolve multiple subtitle bookmarks at once (batch operation for efficiency)
    /// Input: Array of {downloadId, language} objects
    /// Output: Dictionary mapping "downloadId:language" to resolved path (or null if not found)
    @objc func resolveSubtitlePaths(_ subtitles: NSArray, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        var results: [String: Any] = [:]
        
        for item in subtitles {
            guard let dict = item as? [String: String],
                  let downloadId = dict["downloadId"],
                  let language = dict["language"] else {
                continue
            }
            
            let key = "\(downloadId):\(language)"
            if let resolvedURL = resolveSubtitleBookmark(forDownloadId: downloadId, language: language) {
                results[key] = resolvedURL.path
            } else {
                results[key] = NSNull()
            }
        }
        
        resolve(results)
    }
    
    // MARK: - Recovery and Cleanup Methods
    @objc func recoverDownloads(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Implementation for recovering downloads
            let recoveredDownloads: [[String: Any]] = []
            
            DispatchQueue.main.async {
                resolve(recoveredDownloads)
            }
        }
    }
    
    @objc func cleanupTempFiles(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                let (filesRemoved, spaceFreed) = try self.cleanupTemporaryFiles()
                
                DispatchQueue.main.async {
                    resolve([
                        "filesRemoved": filesRemoved,
                        "spaceFreed": spaceFreed
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    reject("CLEANUP_FAILED", "Failed to cleanup temp files: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func validateDownloads(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            let validationResults = self.validateAllDownloads()
            
            DispatchQueue.main.async {
                resolve(validationResults)
            }
        }
    }
    
    @objc func repairDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for repairing download
        resolve(nil)
    }
    
    // MARK: - Utility Methods
    @objc func generateDownloadId(_ uri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let id = generateUniqueId(from: uri)
        resolve(id)
    }
    
    @objc func validateDownloadUri(_ uri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let isValid = URL(string: uri) != nil
        let type = uri.contains(".m3u8") || uri.contains(".mpd") ? "stream" : "binary"
        
        resolve([
            "isValid": isValid,
            "type": type
        ])
    }
    
    @objc func getManifestInfo(_ uri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for getting manifest info
        resolve([
            "duration": 0,
            "qualities": [],
            "hasAudio": false,
            "hasSubtitles": false,
            "drmProtected": false
        ])
    }
    
    @objc func estimateDownloadTime(_ uri: String, quality: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implementation for estimating download time
        resolve([
            "estimatedBytes": 0,
            "estimatedDuration": 0
        ])
    }
    
    // MARK: - Legacy Methods (Backwards Compatibility)
    @objc func setItem(_ src: NSDictionary, drm: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Legacy method for backwards compatibility
        resolve(nil)
    }
    
    @objc func addItem(_ src: NSDictionary, drm: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Convert legacy format to new format and call addDownload
        var config: [String: Any] = [:]
        
        if let id = src["id"] as? String { config["id"] = id }
        if let uri = src["uri"] as? String { config["uri"] = uri }
        if let title = src["title"] as? String { config["title"] = title }
        if let drm = drm { config["drm"] = drm }
        
        addDownload(config as NSDictionary, resolver: resolve, rejecter: reject)
    }
    
    @objc func removeItem(_ src: NSDictionary, drm: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let id = src["id"] as? String {
            removeDownload(id, resolver: resolve, rejecter: reject)
        } else {
            reject("INVALID_ID", "Invalid download ID", nil)
        }
    }
    
    @objc func getItem(_ uri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Legacy method implementation
        resolve([
            "isDownloaded": false,
            "isProtected": false
        ])
    }
    
    @objc func getList(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        getDownloads(resolve, rejecter: reject)
    }
    
    @objc func pause(_ src: NSDictionary, drm: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let id = src["id"] as? String {
            pauseDownload(id, resolver: resolve, rejecter: reject)
        } else {
            reject("INVALID_ID", "Invalid download ID", nil)
        }
    }
    
    @objc func resume(_ src: NSDictionary, drm: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let id = src["id"] as? String {
            resumeDownload(id, resolver: resolve, rejecter: reject)
        } else {
            reject("INVALID_ID", "Invalid download ID", nil)
        }
    }
    
    @objc func downloadLicense(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Legacy method for downloading license
        resolve(nil)
    }
    
    // MARK: - Private Helper Methods
    private func initializeDownloadSession() throws {
        // Use bundle identifier for unique session ID
        let bundleId = Bundle.main.bundleIdentifier ?? "com.downloads"
        let sessionId = "\(bundleId).assetdownload"
        
        print("📥 [DownloadsModule2] Initializing download session with ID: \(sessionId)")
        
        let config = URLSessionConfiguration.background(withIdentifier: sessionId)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.allowsCellularAccess = allowCellularDownloads
        config.httpMaximumConnectionsPerHost = 4
        
        // Allow connections to any host
        config.tlsMinimumSupportedProtocolVersion = .TLSv12
        
        // IMPORTANT: Set waitsForConnectivity to true to wait for network instead of failing immediately
        config.waitsForConnectivity = true
        
        print("📥 [DownloadsModule2] Session config: allowsCellular=\(allowCellularDownloads), isDiscretionary=false, waitsForConnectivity=true")
        
        downloadsSession = AVAssetDownloadURLSession(
            configuration: config,
            assetDownloadDelegate: self,
            delegateQueue: OperationQueue.main  // Use main queue for delegate callbacks
        )
        
        // SOLUCIÓN 2: Recuperar tareas pendientes del sistema
        // Recover pending tasks from iOS - handles both aggregate (new) and regular (legacy) tasks
        downloadsSession?.getAllTasks { [weak self] tasks in
            guard let self = self else { return }
            for task in tasks {
                // Try aggregate task first (new implementation)
                if let aggregateTask = task as? AVAggregateAssetDownloadTask {
                    self.recoverPendingTask(aggregateTask)
                }
                // Fallback to regular asset task (legacy downloads)
                else if let assetTask = task as? AVAssetDownloadTask {
                    self.recoverPendingTask(assetTask)
                }
            }
        }
        
        // SOLUCIÓN 3: Restaurar estado de descargas persistidas
        restoreDownloadStates()
    }
    
    private func createDirectoriesIfNeeded() throws {
        let fileManager = FileManager.default
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        
        let downloadPath = documentsPath.appendingPathComponent(downloadDirectory)
        let tempPath = documentsPath.appendingPathComponent(tempDirectory)
        let subtitlesPath = documentsPath.appendingPathComponent(subtitlesDirectory)
        
        try fileManager.createDirectory(at: downloadPath, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: tempPath, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: subtitlesPath, withIntermediateDirectories: true)
    }
    
    private func setupContentKeySession() {
        #if targetEnvironment(simulator)
        contentKeySession = nil
        #else
        contentKeySession = AVContentKeySession(keySystem: .fairPlayStreaming)
        contentKeySession?.setDelegate(self, queue: downloadQueue)
        #endif
    }
    
    private func setupNetworkMonitoring() {
        // Implementation for network monitoring
    }
    
    // MARK: - Progress Timer Management
    
    /// Starts the progress timer if there are active downloads and timer is not already running
    private func startProgressTimerIfNeeded() {
        // Don't create if already exists
        guard progressTimer == nil else { return }
        
        // Only create if there are downloads in progress
        let hasActiveDownloads = activeDownloads.values.contains {
            $0.state == .downloading || $0.state == .preparing
        }
        
        guard hasActiveDownloads else { return }
        
        print("📥 [DownloadsModule2] Starting progress timer")
        
        DispatchQueue.main.async { [weak self] in
            self?.progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                self?.checkProgressUpdates()
            }
            // Ensure timer runs during scroll
            if let timer = self?.progressTimer {
                RunLoop.main.add(timer, forMode: .common)
            }
        }
    }
    
    /// Stops the progress timer if there are no active downloads
    private func stopProgressTimerIfNotNeeded() {
        // Check if there are still active downloads
        let hasActiveDownloads = activeDownloads.values.contains {
            $0.state == .downloading || $0.state == .preparing
        }
        
        // If no active downloads, stop the timer
        if !hasActiveDownloads {
            invalidateProgressTimer()
        }
    }
    
    /// Invalidates and cleans up the progress timer
    private func invalidateProgressTimer() {
        guard progressTimer != nil else { return }
        
        print("📥 [DownloadsModule2] Stopping progress timer")
        DispatchQueue.main.async { [weak self] in
            self?.progressTimer?.invalidate()
            self?.progressTimer = nil
        }
    }
    
    /// Called by the timer to check for stalled downloads or other periodic tasks
    private func checkProgressUpdates() {
        // Check if there are still active downloads
        let activeCount = activeDownloads.values.filter {
            $0.state == .downloading || $0.state == .preparing
        }.count
        
        if activeCount == 0 {
            stopProgressTimerIfNotNeeded()
            return
        }
        
        // Additional periodic checks can be added here
        // e.g., detecting stalled downloads
    }
    
    private func updateModuleConfig(_ config: NSDictionary) {
        if let downloadDir = config["downloadDirectory"] as? String {
            downloadDirectory = downloadDir
        }
        if let tempDir = config["tempDirectory"] as? String {
            tempDirectory = tempDir
        }
        if let maxConcurrent = config["maxConcurrentDownloads"] as? Int {
            maxConcurrentDownloads = maxConcurrent
        }
        if let notifications = config["enableNotifications"] as? Bool {
            notificationsEnabled = notifications
        }
    }
    
    private func validateDownloadConfig(_ config: NSDictionary) -> Bool {
        return config["id"] != nil && config["uri"] != nil && config["title"] != nil
    }
    
    private func createDownloadTask(for asset: AVURLAsset, with downloadInfo: DownloadInfo, downloadId: String) throws -> AVAggregateAssetDownloadTask {
        guard let session = downloadsSession else {
            throw NSError(domain: "DownloadsModule2", code: -1, userInfo: [NSLocalizedDescriptionKey: "Download session not initialized"])
        }
        
        // Determine bitrate based on quality setting
        // NOTE: iOS uses AVAssetDownloadTaskMinimumRequiredMediaBitrateKey which selects the LOWEST
        // quality that meets the minimum. To match Android behavior (which selects highest up to max),
        // we use lower values so iOS selects similar quality levels.
        // 
        // Quality mapping (normalized with Android):
        // - low:    ~480p (Android max: 1.5 Mbps, iOS min: 500 Kbps)
        // - medium: ~720p (Android max: 3 Mbps, iOS min: 1.5 Mbps)
        // - high:   ~1080p (Android max: 6 Mbps, iOS min: 3 Mbps)
        // - auto:   Best available (no restriction)
        let minBitrate: Int
        switch downloadInfo.quality {
        case "low":
            minBitrate = 500_000    // 500 Kbps - will select ~480p
        case "medium":
            minBitrate = 1_500_000  // 1.5 Mbps - will select ~720p
        case "high":
            minBitrate = 3_000_000  // 3 Mbps - will select ~1080p
        case "auto", .none:
            minBitrate = 0          // No minimum - select best available
        default:
            minBitrate = 1_500_000  // Default to medium
        }
        
        // Use aggregateAssetDownloadTask to download video + all media selections (subtitles, audio tracks)
        // This is the Apple-recommended way to download HLS with embedded subtitles
        // See: WWDC 2020 - Session 10655 "Discover how to download and play HLS offline"
        var options: [String: Any] = [:]
        if minBitrate > 0 {
            options[AVAssetDownloadTaskMinimumRequiredMediaBitrateKey] = minBitrate
        }
        
        // Get all available media selections (includes subtitles and alternative audio)
        // NOTE: For HLS, allMediaSelections may be empty if the asset hasn't been loaded yet
        // The aggregate download task will still work - it will download the default renditions
        var mediaSelections = asset.allMediaSelections
        
        // DEBUG: Log asset status and media selections
        print("📥 [DownloadsModule2] Asset status for \(downloadId):")
        print("📥 [DownloadsModule2]   - isPlayable: \(asset.isPlayable)")
        print("📥 [DownloadsModule2]   - isExportable: \(asset.isExportable)")
        print("📥 [DownloadsModule2]   - mediaSelections count: \(mediaSelections.count)")
        print("📥 [DownloadsModule2]   - URL: \(asset.url)")
        
        // If no media selections available, create a default one
        // This ensures the download task has at least one selection to work with
        if mediaSelections.isEmpty {
            print("📥 [DownloadsModule2] No media selections available, using preferredMediaSelection")
            // Use preferredMediaSelection as fallback - this is always available
            mediaSelections = [asset.preferredMediaSelection]
        }
        
        RCTLog("[DownloadsModule2] Creating aggregate download task with \(mediaSelections.count) media selections for ID: \(downloadId)")
        
        // Use downloadId as assetTitle to avoid special characters in filename
        // iOS uses assetTitle to generate the .movpkg filename
        // Using ID ensures clean filenames without spaces, apostrophes, or other problematic characters
        let downloadTask = session.aggregateAssetDownloadTask(
            with: asset,
            mediaSelections: mediaSelections,
            assetTitle: downloadId,
            assetArtworkData: nil,
            options: options
        )
        
        guard let task = downloadTask else {
            throw NSError(
                domain: "DownloadsModule2",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create aggregate download task for ID: \(downloadId)"]
            )
        }
        
        return task
    }
    
    /// Emits the download prepared event (consistent with Android behavior)
    /// - Parameters:
    ///   - downloadId: The download ID
    ///   - downloadInfo: The download info
    ///   - asset: The AVURLAsset that was prepared
    private func emitDownloadPrepared(downloadId: String, downloadInfo: DownloadInfo, asset: AVURLAsset) {
        var tracks: [[String: Any]] = []
        
        // Get video tracks
        for track in asset.tracks(withMediaType: .video) {
            var trackInfo: [String: Any] = [
                "type": "video",
                "id": track.trackID
            ]
            
            // Try to get dimensions
            let size = track.naturalSize
            if size.width > 0 && size.height > 0 {
                trackInfo["width"] = Int(size.width)
                trackInfo["height"] = Int(size.height)
            }
            
            tracks.append(trackInfo)
        }
        
        // Get audio tracks
        for track in asset.tracks(withMediaType: .audio) {
            let trackInfo: [String: Any] = [
                "type": "audio",
                "id": track.trackID,
                "language": track.languageCode ?? "und"
            ]
            tracks.append(trackInfo)
        }
        
        // Get subtitle tracks
        for track in asset.tracks(withMediaType: .text) {
            let trackInfo: [String: Any] = [
                "type": "text",
                "id": track.trackID,
                "language": track.languageCode ?? "und"
            ]
            tracks.append(trackInfo)
        }
        
        // Get duration (may be unknown for HLS before loading)
        let duration = CMTimeGetSeconds(asset.duration)
        let validDuration = duration.isNaN || duration.isInfinite ? 0 : duration
        
        print("📥 [DownloadsModule2] Emitting downloadPrepared for \(downloadId): \(tracks.count) tracks, duration=\(validDuration)s")
        
        sendEvent(withName: "overonDownloadPrepared", body: [
            "id": downloadId,
            "downloadId": downloadId,
            "uri": downloadInfo.uri,
            "title": downloadInfo.title,
            "duration": validDuration,
            "tracks": tracks,
            "quality": downloadInfo.quality ?? "auto",
            "hasDRM": downloadInfo.hasDRM,
            "message": "Download prepared successfully"
        ])
    }
    
    private func startDownloadIfPossible(_ downloadId: String) {
        let activeCount = activeDownloads.values.filter { $0.state == .downloading }.count
        
        print("📥 [DownloadsModule2] startDownloadIfPossible: \(downloadId), activeCount=\(activeCount), maxConcurrent=\(maxConcurrentDownloads)")
        
        if activeCount < maxConcurrentDownloads {
            if let downloadTask = downloadTasks[downloadId] {
                // DEBUG: Log task state before resume
                print("📥 [DownloadsModule2] Task state before resume: \(downloadTask.state.rawValue) (0=running, 1=suspended, 2=canceling, 3=completed)")
                
                downloadTask.resume()
                
                // DEBUG: Log task state after resume
                print("📥 [DownloadsModule2] Task state after resume: \(downloadTask.state.rawValue)")
                
                if var downloadInfo = activeDownloads[downloadId] {
                    downloadInfo.state = .downloading
                    activeDownloads[downloadId] = downloadInfo
                    persistDownloadState()
                    startProgressTimerIfNeeded()
                    
                    sendEvent(withName: "overonDownloadStateChanged", body: [
                        "id": downloadId,
                        "state": downloadInfo.state.stringValue
                    ])
                }
            } else {
                print("📥 [DownloadsModule2] ERROR: No download task found for \(downloadId)")
            }
        } else {
            print("📥 [DownloadsModule2] Download queued (max concurrent reached): \(downloadId)")
        }
    }
    
    private func pauseAllDownloads() {
        // Pausar todas las descargas activas
        for (_, downloadTask) in downloadTasks {
            downloadTask.suspend()
        }
        
        // Actualizar estado de todas las descargas
        for (downloadId, var downloadInfo) in activeDownloads {
            if downloadInfo.state == .downloading || downloadInfo.state == .queued {
                downloadInfo.state = .paused
                activeDownloads[downloadId] = downloadInfo
            }
        }
    }
    
    private func setupDRMForAsset(_ asset: AVURLAsset, config: NSDictionary, contentId: String) throws {
        #if targetEnvironment(simulator)
        // DRM not available in simulator
        return
        #else
        guard let contentKeySession else {
            throw NSError(
                domain: "DownloadsModule2",
                code: -3,
                userInfo: [NSLocalizedDescriptionKey: "ContentKeySession no inicializada"]
            )
        }
        contentKeySession.addContentKeyRecipient(asset)
        #endif
    }
    
    private func removeDownloadedFiles(for downloadId: String) throws {
        let fileManager = FileManager.default
        
        // Try to get asset path from activeDownloads first
        let downloadInfo = activeDownloads[downloadId]
        
        // If asset path exists in memory, delete the downloaded asset
        if let assetPath = downloadInfo?.assetPath {
            let assetURL = URL(fileURLWithPath: assetPath)
            if fileManager.fileExists(atPath: assetPath) {
                try fileManager.removeItem(at: assetURL)
            }
        }
        
        // IMPORTANTE: También intentar obtener el path desde UserDefaults
        // Esto maneja casos donde la descarga no está en activeDownloads pero sí tiene archivos
        let assetPathsKey = "com.downloads.assetPaths"
        if let assetPaths = UserDefaults.standard.dictionary(forKey: assetPathsKey) as? [String: String],
           let savedAssetPath = assetPaths[downloadId] {
            if fileManager.fileExists(atPath: savedAssetPath) {
                try? fileManager.removeItem(atPath: savedAssetPath)
            }
            // Try without /.nofollow prefix
            if savedAssetPath.hasPrefix("/.nofollow") {
                let cleanPath = String(savedAssetPath.dropFirst("/.nofollow".count))
                if fileManager.fileExists(atPath: cleanPath) {
                    try? fileManager.removeItem(atPath: cleanPath)
                }
            }
        }
        
        // Also clean up any files in the download directory with this ID
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let downloadDir = documentsPath.appendingPathComponent(downloadDirectory)
        
        // Look for directories/files named with the downloadId
        do {
            let contents = try fileManager.contentsOfDirectory(at: downloadDir, includingPropertiesForKeys: nil)
            
            for item in contents {
                let itemName = item.lastPathComponent
                if itemName.contains(downloadId) {
                    try fileManager.removeItem(at: item)
                }
            }
        } catch {
            // Partial cleanup is acceptable
        }
        
        // Also check in subdirectories (Binaries, Streams, etc.) for downloads
        let subdirectories = ["Binaries", "Streams"]
        for subdirName in subdirectories {
            let subdir = downloadDir.appendingPathComponent(subdirName)
            if fileManager.fileExists(atPath: subdir.path) {
                do {
                    let contents = try fileManager.contentsOfDirectory(at: subdir, includingPropertiesForKeys: nil)
                    
                    for item in contents {
                        let itemName = item.lastPathComponent
                        if itemName == downloadId || itemName.contains(downloadId) {
                            try fileManager.removeItem(at: item)
                        }
                    }
                } catch {
                    // Partial cleanup is acceptable
                }
            }
        }
    }
    
    private func releaseLicenseForDownload(_ downloadId: String) {
        // Implementation for releasing license
    }
    
    private func downloadLicenseForContent(_ contentId: String, config: NSDictionary) throws {
        // Implementation for downloading license
    }
    
    private func checkLicenseValidity(for contentId: String) -> Bool {
        // Implementation for checking license validity
        return true
    }
    
    private func applyNetworkPolicy() {
        // Implementation for applying network policy
    }
    
    private func cleanupTemporaryFiles() throws -> (Int, Int64) {
        // Implementation for cleaning up temporary files
        return (0, 0)
    }
    
    private func validateAllDownloads() -> [[String: Any]] {
        // Implementation for validating all downloads
        return []
    }
    
    private func generateUniqueId(from uri: String) -> String {
        return "\(uri.hashValue)_\(Date().timeIntervalSince1970)"
    }
    
    private func getSystemInfoDict() -> [String: Any] {
        let fileManager = FileManager.default
        
        // Get directory paths
        let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let cachesPath = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        
        let downloadPath = documentsPath.appendingPathComponent(downloadDirectory).path
        let tempPath = cachesPath.appendingPathComponent(tempDirectory).path
        
        // Get storage information
        do {
            // IMPORTANTE: Usar volumeAvailableCapacityForImportantUsageKey en lugar de volumeAvailableCapacityKey
            // volumeAvailableCapacityForImportantUsageKey incluye espacio que iOS puede liberar automáticamente
            // (caché, archivos temporales, etc.) y coincide con el valor mostrado en Configuración de iOS
            let resourceValues = try documentsPath.resourceValues(forKeys: [
                .volumeAvailableCapacityForImportantUsageKey,
                .volumeTotalCapacityKey
            ])
            
            // Preferir volumeAvailableCapacityForImportantUsage (incluye espacio purgeable)
            // Fallback a volumeAvailableCapacity si no está disponible (iOS < 11)
            let availableSpace: Int64
            if let importantUsageCapacity = resourceValues.volumeAvailableCapacityForImportantUsage {
                availableSpace = importantUsageCapacity
            } else if let regularCapacity = resourceValues.volumeAvailableCapacity {
                availableSpace = Int64(regularCapacity)
            } else {
                availableSpace = 0
            }
            
            let totalSpace = resourceValues.volumeTotalCapacity.map { Int64($0) } ?? 0
            
            // Calculate actual downloads space
            let downloadsSpace = calculateTotalDownloadsSize()
            
            // Solo log si es un cálculo nuevo (no cache)
            // print("📥 [DownloadsModule2] Storage info - Total: \(totalSpace), Available: \(availableSpace), Downloads: \(downloadsSpace)")
            
            return [
                "totalSpace": totalSpace,
                "availableSpace": availableSpace,
                "downloadSpace": downloadsSpace,
                "downloadDirectory": downloadPath,
                "tempDirectory": tempPath,
                "isConnected": true, // Get from network monitoring
                "isWifiConnected": true, // Get from network monitoring
                "isCellularConnected": false // Get from network monitoring
            ]
        } catch {
            // Error getting storage info
            return [
                "downloadDirectory": downloadPath,
                "tempDirectory": tempPath
            ]
        }
    }
    
    private func createDownloadInfoDict(from downloadInfo: DownloadInfo) -> [String: Any] {
        return [
            "id": downloadInfo.id,
            "uri": downloadInfo.uri,
            "title": downloadInfo.title,
            "state": downloadInfo.state.stringValue,
            "progress": Int(downloadInfo.progress * 100),
            "totalBytes": downloadInfo.totalBytes,
            "downloadedBytes": downloadInfo.downloadedBytes,
            "speed": downloadInfo.speed,
            "remainingTime": downloadInfo.remainingTime,
            "quality": downloadInfo.quality ?? "",
            "hasSubtitles": downloadInfo.hasSubtitles,
            "hasDRM": downloadInfo.hasDRM
        ]
    }
}
extension DownloadsModule2: AVAssetDownloadDelegate {
    
    // MARK: - Progress Tracking
    
    /// Called periodically to report download progress for aggregate tasks
    func urlSession(_ session: URLSession, aggregateAssetDownloadTask: AVAggregateAssetDownloadTask,
                    didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loadedTimeRanges: [NSValue],
                    timeRangeExpectedToLoad: CMTimeRange, for mediaSelection: AVMediaSelection) {
        
        guard let downloadId = findDownloadId(for: aggregateAssetDownloadTask) else {
            print("📥 [DownloadsModule2] Progress update - could not find downloadId for task")
            return
        }
        
        // DEBUG: Log raw values to diagnose 0% progress issue
        let expectedDurationTotal = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
        let loadedRangeCount = loadedTimeRanges.count
        print("📥 [DownloadsModule2] Progress DEBUG for \(downloadId): loadedRanges=\(loadedRangeCount), expectedDuration=\(expectedDurationTotal)s")
        
        // Calculate progress percentage
        var percentComplete: Double = 0.0
        for value in loadedTimeRanges {
            let loadedTimeRange: CMTimeRange = value.timeRangeValue
            let loadedDuration = CMTimeGetSeconds(loadedTimeRange.duration)
            let expectedDuration = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
            if expectedDuration > 0 {
                percentComplete += loadedDuration / expectedDuration
            }
            // DEBUG: Log each loaded range
            print("📥 [DownloadsModule2] Loaded range: \(loadedDuration)s / \(expectedDuration)s = \(expectedDuration > 0 ? loadedDuration/expectedDuration : 0)")
        }
        
        // Clamp to 0-1 range
        percentComplete = min(max(percentComplete, 0.0), 1.0)
        
        // Update download info
        guard var downloadInfo = activeDownloads[downloadId] else { return }
        
        let previousProgress = downloadInfo.progress
        downloadInfo.progress = Float(percentComplete)
        downloadInfo.state = .downloading
        
        // Calculate speed based on time difference
        let now = Date()
        var speed: Double = 0.0
        var remainingTime: Int = 0
        
        // Estimate bytes based on progress (we don't have exact byte counts from HLS)
        // Use a rough estimate: assume 1GB for a full download as baseline
        let estimatedTotalBytes: Int64 = downloadInfo.totalBytes > 0 ? downloadInfo.totalBytes : 500_000_000 // 500MB default
        let estimatedDownloadedBytes = Int64(Double(estimatedTotalBytes) * percentComplete)
        
        if let lastUpdate = lastProgressUpdate[downloadId] {
            let timeDiff = now.timeIntervalSince(lastUpdate.time)
            if timeDiff > 0 {
                let bytesDiff = estimatedDownloadedBytes - lastUpdate.bytes
                speed = Double(bytesDiff) / timeDiff // bytes per second
                
                // Calculate remaining time
                if speed > 0 {
                    let remainingBytes = estimatedTotalBytes - estimatedDownloadedBytes
                    remainingTime = Int(Double(remainingBytes) / speed)
                }
            }
        }
        
        downloadInfo.downloadedBytes = estimatedDownloadedBytes
        downloadInfo.totalBytes = estimatedTotalBytes
        downloadInfo.speed = speed
        downloadInfo.remainingTime = remainingTime
        
        activeDownloads[downloadId] = downloadInfo
        lastProgressUpdate[downloadId] = (bytes: estimatedDownloadedBytes, time: now)
        
        // Only emit progress event if percentage changed (1% increments like Android)
        let currentPercent = Int(percentComplete * 100)
        let lastPercent = lastReportedProgress[downloadId] ?? -1
        
        if currentPercent != lastPercent {
            lastReportedProgress[downloadId] = currentPercent
            print("📥 [DownloadsModule2] Progress: \(downloadId) - \(currentPercent)%")
            
            sendEvent(withName: "overonDownloadProgress", body: [
                "id": downloadId,
                "progress": currentPercent,
                "downloadedBytes": NSNumber(value: estimatedDownloadedBytes),
                "totalBytes": NSNumber(value: estimatedTotalBytes),
                "speed": speed,
                "remainingTime": remainingTime
            ])
        }
    }
    
    // MARK: - Completion Handling
    
    /// Called when the aggregate download task determines the location for the downloaded asset
    func urlSession(_ session: URLSession, aggregateAssetDownloadTask: AVAggregateAssetDownloadTask,
                    willDownloadTo location: URL) {
        guard let downloadId = findDownloadId(for: aggregateAssetDownloadTask) else { return }
        
        RCTLog("[DownloadsModule2] Aggregate task will download to: \(location.path)")
        
        // Store the location - this is where the .movpkg will be saved
        pendingLocations[downloadId] = location
    }
    
    /// Called when a child download task completes for each media selection (subtitles, audio tracks)
    func urlSession(_ session: URLSession, aggregateAssetDownloadTask: AVAggregateAssetDownloadTask,
                    didCompleteFor mediaSelection: AVMediaSelection) {
        guard let downloadId = findDownloadId(for: aggregateAssetDownloadTask) else { return }
        
        // Log which media selection completed (for debugging)
        if let asset = mediaSelection.asset {
            var selectionInfo = ""
            for characteristic in asset.availableMediaCharacteristicsWithMediaSelectionOptions {
                if let group = asset.mediaSelectionGroup(forMediaCharacteristic: characteristic),
                   let option = mediaSelection.selectedMediaOption(in: group) {
                    selectionInfo += "\(option.displayName) "
                }
            }
            RCTLog("[DownloadsModule2] Media selection completed for \(downloadId): \(selectionInfo)")
        }
    }
    
    // Legacy method for AVAssetDownloadTask (kept for compatibility)
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
        // This is called for non-aggregate tasks - we now use aggregate tasks
        // but keep this for backwards compatibility
        RCTLog("[DownloadsModule2] Legacy didFinishDownloadingTo called - this should not happen with aggregate tasks")
    }
    
    // Legacy progress method for AVAssetDownloadTask (kept for compatibility)
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask,
                    didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loadedTimeRanges: [NSValue],
                    timeRangeExpectedToLoad: CMTimeRange) {
        // This is called for non-aggregate tasks - we now use aggregate tasks
        RCTLog("[DownloadsModule2] Legacy progress callback called - this should not happen with aggregate tasks")
    }
    
    // Completion handler for all URLSession tasks
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // Try to find download ID - handle both aggregate and regular tasks
        var downloadId: String?
        
        if let aggregateTask = task as? AVAggregateAssetDownloadTask {
            downloadId = findDownloadId(for: aggregateTask)
        }
        
        guard let downloadId = downloadId else { return }
        
        if let error = error {
            let nsError = error as NSError
            
            // Check if we have enough progress to consider it successful despite the error
            // HLS manifests may reference chunks that don't exist (especially at lower qualities)
            // or the CDN may return 404 for some chunks near the end
            // NOTE: Using 98% threshold to ensure almost complete downloads
            // Lower thresholds (70%) caused playback issues with incomplete .movpkg files
            let downloadInfo = activeDownloads[downloadId]
            let currentProgress = downloadInfo?.progress ?? 0.0
            let progressThreshold: Float = 0.98 // 98% threshold - must be almost complete
            
            // Check if this is a 404 error or similar recoverable error
            let is404Error = nsError.domain == NSURLErrorDomain && 
                (nsError.code == NSURLErrorFileDoesNotExist || 
                 nsError.code == NSURLErrorResourceUnavailable ||
                 nsError.code == -1100) // NSURLErrorFileDoesNotExist
            
            let isHTTP404 = (nsError.userInfo[NSUnderlyingErrorKey] as? NSError)?.code == 404 ||
                            error.localizedDescription.contains("404") ||
                            error.localizedDescription.contains("not found")
            
            let isRecoverableError = is404Error || isHTTP404
            
            // Check for "No space left on device" error (POSIX error 28 or CoreMedia error 28)
            let isNoSpaceError = nsError.code == 28 || // POSIX/CoreMedia error code for ENOSPC
                (nsError.domain == "CoreMediaErrorDomain" && nsError.code == 28) ||
                (nsError.domain == NSPOSIXErrorDomain && nsError.code == 28) ||
                error.localizedDescription.lowercased().contains("no space") ||
                error.localizedDescription.lowercased().contains("no queda espacio")
            
            print("📥 [DownloadsModule2] Download error for \(downloadId): \(error.localizedDescription)")
            print("📥 [DownloadsModule2] Progress: \(Int(currentProgress * 100))%, isRecoverable: \(isRecoverableError), isNoSpace: \(isNoSpaceError)")
            print("📥 [DownloadsModule2] Error domain: \(nsError.domain), code: \(nsError.code)")
            
            // Handle "No space left on device" error immediately - this is critical
            if isNoSpaceError {
                print("📥 [DownloadsModule2] ❌ NO SPACE LEFT ON DEVICE - Emitting error immediately")
                
                // Clean up any pending state
                pendingLocations.removeValue(forKey: downloadId)
                completedWithoutError.remove(downloadId)
                
                if var downloadInfo = activeDownloads[downloadId] {
                    downloadInfo.state = .failed
                    downloadInfo.error = error
                    activeDownloads[downloadId] = downloadInfo
                    
                    // Don't try to persist - we have no space!
                    invalidateDownloadSpaceCache()
                    
                    sendEvent(withName: "overonDownloadError", body: [
                        "id": downloadId,
                        "progress": Int(currentProgress * 100),
                        "error": [
                            "code": "NO_SPACE_LEFT",
                            "message": "No hay espacio disponible en el dispositivo",
                            "domain": nsError.domain,
                            "errorCode": nsError.code
                        ]
                    ])
                }
                return
            }
            
            // If progress >= 98% and it's a recoverable error (like 404), treat as success
            if currentProgress >= progressThreshold && isRecoverableError {
                print("📥 [DownloadsModule2] Progress >= 98% with recoverable error - treating as successful download")
                
                // Check if we have a pending location from didFinishDownloadingTo
                if let location = pendingLocations.removeValue(forKey: downloadId) {
                    // Use relaxed validation for high-progress downloads with recoverable errors
                    // The strict track validation can fail for partial downloads that are still playable
                    finalizeDownload(downloadId: downloadId, location: location, skipStrictValidation: true)
                } else {
                    // Mark as completed without error, wait for didFinishDownloadingTo
                    completedWithoutError.insert(downloadId)
                    
                    // Also emit a warning event so the app knows it was partial
                    sendEvent(withName: "overonDownloadCompleted", body: [
                        "id": downloadId,
                        "partial": true,
                        "progress": Int(currentProgress * 100),
                        "warning": "Download completed with \(Int(currentProgress * 100))% - some chunks were unavailable"
                    ])
                }
                return
            }
            
            // Clean up any pending state for actual failures
            pendingLocations.removeValue(forKey: downloadId)
            completedWithoutError.remove(downloadId)
            
            if var downloadInfo = activeDownloads[downloadId] {
                downloadInfo.state = .failed
                downloadInfo.error = error
                activeDownloads[downloadId] = downloadInfo
                
                persistDownloadState()
                invalidateDownloadSpaceCache()
                stopProgressTimerIfNotNeeded()
                
                sendEvent(withName: "overonDownloadError", body: [
                    "id": downloadId,
                    "progress": Int(currentProgress * 100),
                    "error": [
                        "code": "DOWNLOAD_FAILED",
                        "message": error.localizedDescription,
                        "domain": nsError.domain,
                        "errorCode": nsError.code
                    ]
                ])
            }
        } else {
            // Check if didFinishDownloadingTo already provided the location
            if let location = pendingLocations.removeValue(forKey: downloadId) {
                finalizeDownload(downloadId: downloadId, location: location)
            } else {
                // Store success state and wait for didFinishDownloadingTo
                completedWithoutError.insert(downloadId)
            }
        }
    }
    
    private func finalizeDownload(downloadId: String, location: URL, skipStrictValidation: Bool = false) {
        // Validate asset integrity before marking as completed
        // For high-progress downloads (>=98%) that had recoverable errors, use relaxed validation
        let (isValid, validationError) = skipStrictValidation 
            ? validateAssetIntegrityRelaxed(at: location)
            : validateAssetIntegrity(at: location)
        
        if !isValid {
            print("📥 [DownloadsModule2] ❌ Asset validation failed for \(downloadId): \(validationError ?? "unknown")")
            
            // Mark as failed instead of completed
            if var downloadInfo = activeDownloads[downloadId] {
                downloadInfo.state = .failed
                downloadInfo.error = NSError(
                    domain: "DownloadsModule2",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: validationError ?? "Asset validation failed"]
                )
                activeDownloads[downloadId] = downloadInfo
                
                persistDownloadState()
                
                sendEvent(withName: "overonDownloadError", body: [
                    "id": downloadId,
                    "error": [
                        "code": "ASSET_VALIDATION_FAILED",
                        "message": validationError ?? "Asset validation failed"
                    ]
                ])
            }
            return
        }
        
        let actualSize = calculateAssetSize(at: location)
        
        guard var downloadInfo = activeDownloads[downloadId] else { return }
        
        downloadInfo.state = .completed
        downloadInfo.completionTime = Date()
        downloadInfo.totalBytes = actualSize
        downloadInfo.downloadedBytes = actualSize
        downloadInfo.progress = 1.0
        downloadInfo.assetPath = location.path
        activeDownloads[downloadId] = downloadInfo
        
        // Persist - save both path and bookmark
        // Bookmark survives sandbox UUID changes (important for development/recompiles)
        saveAssetPath(location.path, forDownloadId: downloadId)
        saveAssetBookmark(for: location, downloadId: downloadId)
        persistDownloadState()
        invalidateDownloadSpaceCache()
        stopProgressTimerIfNotNeeded()
        
        let duration: TimeInterval = downloadInfo.startTime.map { Date().timeIntervalSince($0) } ?? 0
        sendEvent(withName: "overonDownloadCompleted", body: [
            "id": downloadId,
            "path": location.path,
            "totalBytes": NSNumber(value: actualSize),
            "duration": NSNumber(value: duration)
        ])
        
    }
    
    /// Validates the basic integrity of a downloaded asset (.movpkg)
    /// - Parameter location: URL of the .movpkg directory
    /// - Returns: Tuple with (isValid, errorMessage)
    private func validateAssetIntegrity(at location: URL) -> (isValid: Bool, error: String?) {
        let fileManager = FileManager.default
        
        // Handle /.nofollow prefix if present
        var pathToCheck = location.path
        if !fileManager.fileExists(atPath: pathToCheck) && pathToCheck.hasPrefix("/.nofollow") {
            pathToCheck = String(pathToCheck.dropFirst("/.nofollow".count))
        }
        
        // 1. Verify that the directory exists
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: pathToCheck, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            return (false, "Asset directory does not exist")
        }
        
        let workingURL = URL(fileURLWithPath: pathToCheck)
        
        // 2. Verify that it has content
        guard let contents = try? fileManager.contentsOfDirectory(atPath: pathToCheck),
              !contents.isEmpty else {
            return (false, "Asset directory is empty")
        }
        
        // 3. Verify minimum size (at least 1MB for a valid video)
        let size = calculateAssetSize(at: workingURL)
        if size < 1_000_000 { // 1MB minimum
            return (false, "Asset size too small: \(size) bytes")
        }
        
        // 4. Try to verify the asset is playable using AVURLAsset
        let asset = AVURLAsset(url: workingURL)
        
        // Check for video or audio tracks (synchronous check for basic validation)
        let videoTracks = asset.tracks(withMediaType: .video)
        let audioTracks = asset.tracks(withMediaType: .audio)
        
        if videoTracks.isEmpty && audioTracks.isEmpty {
            // Try checking if asset reports as playable
            // Note: This is a basic check, full validation would require async loading
            return (false, "No playable tracks found in asset")
        }
        
        print("📥 [DownloadsModule2] ✅ Asset validation passed: size=\(size) bytes, video=\(videoTracks.count), audio=\(audioTracks.count)")
        return (true, nil)
    }
    
    /// Relaxed validation for high-progress downloads (>=98%) with recoverable errors
    /// Only checks directory existence and minimum size, skips track validation
    /// This is needed because AVURLAsset.tracks() can fail for partial downloads that are still playable
    private func validateAssetIntegrityRelaxed(at location: URL) -> (isValid: Bool, error: String?) {
        let fileManager = FileManager.default
        
        // Handle /.nofollow prefix if present
        var pathToCheck = location.path
        if !fileManager.fileExists(atPath: pathToCheck) && pathToCheck.hasPrefix("/.nofollow") {
            pathToCheck = String(pathToCheck.dropFirst("/.nofollow".count))
        }
        
        // 1. Verify that the directory exists
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: pathToCheck, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            return (false, "Asset directory does not exist")
        }
        
        let workingURL = URL(fileURLWithPath: pathToCheck)
        
        // 2. Verify that it has content
        guard let contents = try? fileManager.contentsOfDirectory(atPath: pathToCheck),
              !contents.isEmpty else {
            return (false, "Asset directory is empty")
        }
        
        // 3. Verify minimum size (at least 1MB for a valid video)
        let size = calculateAssetSize(at: workingURL)
        if size < 1_000_000 { // 1MB minimum
            return (false, "Asset size too small: \(size) bytes")
        }
        
        // Skip track validation for relaxed mode - partial downloads may not report tracks correctly
        // but can still be playable
        print("📥 [DownloadsModule2] ✅ Relaxed asset validation passed: size=\(size) bytes (track validation skipped)")
        return (true, nil)
    }
    
    private func findDownloadId(for task: AVAggregateAssetDownloadTask) -> String? {
        return downloadTasks.first { $0.value == task }?.key
    }
    
    private func calculateAssetSize(at url: URL) -> Int64 {
        let fileManager = FileManager.default
        var totalSize: Int64 = 0
        
        do {
            // Intentar con el path original primero
            var pathToUse = url.path
            var isDirectory: ObjCBool = false
            
            // Verificar si el archivo existe con el path original
            if fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) {
                pathToUse = url.path
            } else if url.path.hasPrefix("/.nofollow") {
                // Si no existe y tiene prefijo /.nofollow, intentar sin él
                let cleanPath = String(url.path.dropFirst("/.nofollow".count))
                if fileManager.fileExists(atPath: cleanPath, isDirectory: &isDirectory) {
                    pathToUse = cleanPath
                } else {
                    return 0
                }
            } else {
                return 0
            }
            
            let workingURL = URL(fileURLWithPath: pathToUse)
            
            // Check if path is a directory or file
            if fileManager.fileExists(atPath: pathToUse, isDirectory: &isDirectory) {
                if isDirectory.boolValue {
                    // Calculate size of all files in directory recursively
                    // NO usar .skipsHiddenFiles para paquetes .movpkg - pueden tener archivos ocultos importantes
                    if let enumerator = fileManager.enumerator(at: workingURL, includingPropertiesForKeys: [.fileSizeKey, .isDirectoryKey]) {
                        var fileCount = 0
                        for case let fileURL as URL in enumerator {
                            do {
                                let resourceValues = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey])
                                
                                // Solo sumar archivos, no directorios
                                if let isDir = resourceValues.isDirectory, !isDir {
                                    if let fileSize = resourceValues.fileSize {
                                        totalSize += Int64(fileSize)
                                        fileCount += 1
                                    }
                                }
                            } catch {
                                // Skip files that can't be read
                            }
                        }
                    }
                } else {
                    // Single file
                    let resourceValues = try workingURL.resourceValues(forKeys: [.fileSizeKey])
                    if let fileSize = resourceValues.fileSize {
                        totalSize = Int64(fileSize)
                    }
                }
            }
        } catch {
            // Error calculating size
        }
        
        return totalSize
    }
    
    private func calculateTotalDownloadsSize() -> Int64 {
        // Check cache
        if let cacheTime = downloadSpaceCacheTime {
            let age = Date().timeIntervalSince(cacheTime)
            if age < DOWNLOAD_SPACE_CACHE_TTL {
                return cachedDownloadSpace
            }
        }
        
        var totalSize: Int64 = 0
        var activeDownloadsSize: Int64 = 0
        let fileManager = FileManager.default

        // Calculate size from activeDownloads
        for (downloadId, downloadInfo) in activeDownloads {
            if downloadInfo.state == .completed, let assetPath = downloadInfo.assetPath {
                var actualPath = assetPath
                
                if !fileManager.fileExists(atPath: assetPath) {
                    if assetPath.hasPrefix("/.nofollow") {
                        let cleanPath = String(assetPath.dropFirst("/.nofollow".count))
                        if fileManager.fileExists(atPath: cleanPath) {
                            actualPath = cleanPath
                        }
                    }
                    
                    if !fileManager.fileExists(atPath: actualPath) {
                        if let resolvedURL = resolveAssetBookmark(forDownloadId: downloadId) {
                            if fileManager.fileExists(atPath: resolvedURL.path) {
                                actualPath = resolvedURL.path
                                var updatedInfo = downloadInfo
                                updatedInfo.assetPath = actualPath
                                activeDownloads[downloadId] = updatedInfo
                            }
                        }
                    }
                }
                
                let assetURL = URL(fileURLWithPath: actualPath)
                let size = calculateAssetSize(at: assetURL)
                activeDownloadsSize += size
                
                // Migrate to savedPaths if not already there
                let currentSavedPaths = loadAssetPaths()
                if currentSavedPaths[downloadId] == nil {
                    saveAssetPath(actualPath, forDownloadId: downloadId)
                }
            } else if downloadInfo.state == .downloading || downloadInfo.state == .paused {
                activeDownloadsSize += downloadInfo.downloadedBytes
            }
        }
        
        // Calculate size from persisted assets
        var persistedAssetsSize: Int64 = 0
        let savedPaths = loadAssetPaths()
        
        for (downloadId, assetPath) in savedPaths {
            var pathToCheck = assetPath
            var fileExists = fileManager.fileExists(atPath: assetPath)
            
            if !fileExists && assetPath.hasPrefix("/.nofollow") {
                let cleanPath = String(assetPath.dropFirst("/.nofollow".count))
                fileExists = fileManager.fileExists(atPath: cleanPath)
                if fileExists {
                    pathToCheck = cleanPath
                }
            }
            
            if !fileExists {
                if let resolvedURL = resolveAssetBookmark(forDownloadId: downloadId) {
                    fileExists = fileManager.fileExists(atPath: resolvedURL.path)
                    if fileExists {
                        pathToCheck = resolvedURL.path
                    }
                }
            }
            
            if fileExists {
                let assetURL = URL(fileURLWithPath: pathToCheck)
                let size = calculateAssetSize(at: assetURL)
                persistedAssetsSize += size
            }
        }
        
        // Use the larger value (more conservative)
        totalSize = max(activeDownloadsSize, persistedAssetsSize)
        
        // Update cache
        cachedDownloadSpace = totalSize
        downloadSpaceCacheTime = Date()
        
        return totalSize
    }
    
    // Helper para calcular tamaño de directorio recursivamente
    private func calculateDirectorySize(at url: URL) -> Int64 {
        let fileManager = FileManager.default
        var totalSize: Int64 = 0
        
        guard let enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey, .isDirectoryKey]) else {
            return 0
        }
        
        for case let fileURL as URL in enumerator {
            do {
                let resourceValues = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey])
                if let isDirectory = resourceValues.isDirectory, !isDirectory {
                    if let fileSize = resourceValues.fileSize {
                        totalSize += Int64(fileSize)
                    }
                }
            } catch {
                // Skip files that can't be read
            }
        }
        
        return totalSize
    }
    
    // Invalidar cache cuando cambia el estado de las descargas
    private func invalidateDownloadSpaceCache() {
        downloadSpaceCacheTime = nil
    }
    
    // MARK: - Download State Persistence (SOLUCIÓN 3)
    
    /// Persistir estado de descargas activas para recuperarlas después de restart
    private func persistDownloadState() {
        var downloadStates: [[String: Any]] = []
        
        for (id, info) in activeDownloads {
            let state: [String: Any] = [
                "id": id,
                "uri": info.uri,
                "title": info.title,
                "state": info.state.stringValue,
                "progress": info.progress,
                "downloadedBytes": info.downloadedBytes,
                "totalBytes": info.totalBytes,
                "quality": info.quality ?? "",
                "assetPath": info.assetPath ?? "",
                "hasSubtitles": info.hasSubtitles,
                "hasDRM": info.hasDRM
            ]
            downloadStates.append(state)
        }
        
        UserDefaults.standard.set(downloadStates, forKey: ACTIVE_DOWNLOADS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    /// Restaurar estado de descargas desde UserDefaults
    private func restoreDownloadStates() {
        guard let savedStates = UserDefaults.standard.array(forKey: ACTIVE_DOWNLOADS_KEY) as? [[String: Any]] else {
            return
        }
        
        for state in savedStates {
            guard let id = state["id"] as? String,
                  let uri = state["uri"] as? String,
                  let title = state["title"] as? String,
                  let stateString = state["state"] as? String else {
                continue
            }
            
            // Convertir string a DownloadState
            let downloadState = DownloadState.allCases.first { $0.stringValue == stateString } ?? .paused
            
            let downloadInfo = DownloadInfo(
                id: id,
                uri: uri,
                title: title,
                state: downloadState,
                progress: state["progress"] as? Float ?? 0.0,
                totalBytes: state["totalBytes"] as? Int64 ?? 0,
                downloadedBytes: state["downloadedBytes"] as? Int64 ?? 0,
                speed: 0.0,
                remainingTime: 0,
                quality: state["quality"] as? String,
                hasSubtitles: state["hasSubtitles"] as? Bool ?? false,
                hasDRM: state["hasDRM"] as? Bool ?? false,
                error: nil,
                startTime: Date(),
                assetPath: state["assetPath"] as? String
            )
            
            activeDownloads[id] = downloadInfo
        }
    }
    
    /// Recuperar una tarea pendiente de iOS y reconectarla con activeDownloads
    /// Now handles both AVAggregateAssetDownloadTask (new) and AVAssetDownloadTask (legacy)
    private func recoverPendingTask(_ task: URLSessionTask) {
        // Handle aggregate tasks (new implementation)
        if let aggregateTask = task as? AVAggregateAssetDownloadTask {
            let urlAsset = aggregateTask.urlAsset
            let taskURL = urlAsset.url.absoluteString
            
            for (downloadId, downloadInfo) in activeDownloads {
                if downloadInfo.uri == taskURL {
                    downloadTasks[downloadId] = aggregateTask
                    
                    if task.state == .suspended {
                        var info = downloadInfo
                        info.state = .paused
                        activeDownloads[downloadId] = info
                    } else if task.state == .running {
                        var info = downloadInfo
                        info.state = .downloading
                        activeDownloads[downloadId] = info
                    }
                    return
                }
            }
        }
        // Legacy: Handle non-aggregate tasks (for backwards compatibility with existing downloads)
        else if let assetTask = task as? AVAssetDownloadTask {
            let urlAsset = assetTask.urlAsset
            let taskURL = urlAsset.url.absoluteString
            
            for (downloadId, downloadInfo) in activeDownloads {
                if downloadInfo.uri == taskURL {
                    // Legacy task - cannot add to new downloadTasks dictionary
                    // Just update state, the task will continue but won't be tracked
                    RCTLog("[DownloadsModule2] Found legacy AVAssetDownloadTask for \(downloadId) - will complete but not tracked")
                    
                    if task.state == .suspended {
                        var info = downloadInfo
                        info.state = .paused
                        activeDownloads[downloadId] = info
                    } else if task.state == .running {
                        var info = downloadInfo
                        info.state = .downloading
                        activeDownloads[downloadId] = info
                    }
                    return
                }
            }
        }
    }
    
    // MARK: - Asset Path Persistence Helpers
    
    /// Guardar asset path en UserDefaults para recuperarlo después de restart
    private func saveAssetPath(_ path: String, forDownloadId downloadId: String) {
        var paths = loadAssetPaths()
        paths[downloadId] = path
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    /// Cargar todos los asset paths guardados
    private func loadAssetPaths() -> [String: String] {
        return UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String] ?? [:]
    }
    
    /// Eliminar asset path de un download específico
    private func removeAssetPath(forDownloadId downloadId: String) {
        var paths = loadAssetPaths()
        paths.removeValue(forKey: downloadId)
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    /// Limpiar todos los asset paths (útil para debugging o reset completo)
    private func clearAllAssetPaths() {
        UserDefaults.standard.removeObject(forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    // MARK: - Bookmark Data Persistence (survives sandbox UUID changes)
    
    /// Save bookmark data for a downloaded asset URL
    private func saveAssetBookmark(for url: URL, downloadId: String) {
        do {
            let bookmarkData = try url.bookmarkData()
            var bookmarks = loadAssetBookmarks()
            bookmarks[downloadId] = bookmarkData
            UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
            UserDefaults.standard.synchronize()
        } catch {
            // Failed to create bookmark
        }
    }
    
    /// Load all saved bookmarks
    private func loadAssetBookmarks() -> [String: Data] {
        return UserDefaults.standard.dictionary(forKey: ASSET_BOOKMARKS_KEY) as? [String: Data] ?? [:]
    }
    
    /// Resolve a bookmark to get the current URL (handles sandbox UUID changes)
    func resolveAssetBookmark(forDownloadId downloadId: String) -> URL? {
        let bookmarks = loadAssetBookmarks()
        guard let bookmarkData = bookmarks[downloadId] else {
            return nil
        }
        
        var bookmarkDataIsStale = false
        do {
            let url = try URL(resolvingBookmarkData: bookmarkData, bookmarkDataIsStale: &bookmarkDataIsStale)
            
            if bookmarkDataIsStale {
                // Update stale bookmark
                saveAssetBookmark(for: url, downloadId: downloadId)
            }
            return url
        } catch {
            // Remove invalid bookmark
            removeAssetBookmark(forDownloadId: downloadId)
            return nil
        }
    }
    
    /// Remove bookmark for a specific download
    private func removeAssetBookmark(forDownloadId downloadId: String) {
        var bookmarks = loadAssetBookmarks()
        bookmarks.removeValue(forKey: downloadId)
        UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    // MARK: - Subtitle Bookmark Data Persistence (survives sandbox UUID changes)
    
    /// Save bookmark data for a downloaded subtitle file
    /// Key format: "downloadId:language" to support multiple subtitles per download
    func saveSubtitleBookmark(for url: URL, downloadId: String, language: String) {
        do {
            let bookmarkData = try url.bookmarkData()
            var bookmarks = loadSubtitleBookmarks()
            let key = "\(downloadId):\(language)"
            bookmarks[key] = bookmarkData
            UserDefaults.standard.set(bookmarks, forKey: SUBTITLE_BOOKMARKS_KEY)
            UserDefaults.standard.synchronize()
            RCTLog("[Native Downloads] (DownloadsModule2) Saved subtitle bookmark for \(key)")
        } catch {
            RCTLog("[Native Downloads] (DownloadsModule2) Failed to create subtitle bookmark for \(downloadId):\(language): \(error)")
        }
    }
    
    /// Load all saved subtitle bookmarks
    private func loadSubtitleBookmarks() -> [String: Data] {
        return UserDefaults.standard.dictionary(forKey: SUBTITLE_BOOKMARKS_KEY) as? [String: Data] ?? [:]
    }
    
    /// Resolve a subtitle bookmark to get the current URL (handles sandbox UUID changes)
    func resolveSubtitleBookmark(forDownloadId downloadId: String, language: String) -> URL? {
        let bookmarks = loadSubtitleBookmarks()
        let key = "\(downloadId):\(language)"
        guard let bookmarkData = bookmarks[key] else {
            RCTLog("[Native Downloads] (DownloadsModule2) No subtitle bookmark found for \(key)")
            return nil
        }
        
        var bookmarkDataIsStale = false
        do {
            let url = try URL(resolvingBookmarkData: bookmarkData, bookmarkDataIsStale: &bookmarkDataIsStale)
            
            if bookmarkDataIsStale {
                // Update stale bookmark
                saveSubtitleBookmark(for: url, downloadId: downloadId, language: language)
                RCTLog("[Native Downloads] (DownloadsModule2) Updated stale subtitle bookmark for \(key)")
            }
            
            // Verify file exists
            if FileManager.default.fileExists(atPath: url.path) {
                RCTLog("[Native Downloads] (DownloadsModule2) Resolved subtitle bookmark for \(key): \(url.path)")
                return url
            } else {
                RCTLog("[Native Downloads] (DownloadsModule2) Subtitle file not found at resolved path: \(url.path)")
                return nil
            }
        } catch {
            RCTLog("[Native Downloads] (DownloadsModule2) Failed to resolve subtitle bookmark for \(key): \(error)")
            // Remove invalid bookmark
            removeSubtitleBookmark(forDownloadId: downloadId, language: language)
            return nil
        }
    }
    
    /// Remove bookmark for a specific subtitle
    func removeSubtitleBookmark(forDownloadId downloadId: String, language: String) {
        var bookmarks = loadSubtitleBookmarks()
        let key = "\(downloadId):\(language)"
        bookmarks.removeValue(forKey: key)
        UserDefaults.standard.set(bookmarks, forKey: SUBTITLE_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    /// Remove all subtitle bookmarks for a download
    func removeAllSubtitleBookmarks(forDownloadId downloadId: String) {
        var bookmarks = loadSubtitleBookmarks()
        let prefix = "\(downloadId):"
        let keysToRemove = bookmarks.keys.filter { $0.hasPrefix(prefix) }
        for key in keysToRemove {
            bookmarks.removeValue(forKey: key)
        }
        UserDefaults.standard.set(bookmarks, forKey: SUBTITLE_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()
    }
    
    // MARK: - URLSessionTaskDelegate
    
    /// Called when a task is waiting for network connectivity
    /// This helps diagnose issues where downloads stay at 0% due to network policy
    func urlSession(_ session: URLSession, taskIsWaitingForConnectivity task: URLSessionTask) {
        var downloadId: String?
        
        if let aggregateTask = task as? AVAggregateAssetDownloadTask {
            downloadId = findDownloadId(for: aggregateTask)
        }
        
        let taskId = downloadId ?? "unknown"
        print("📥 [DownloadsModule2] ⚠️ Task \(taskId) is WAITING FOR CONNECTIVITY")
        print("📥 [DownloadsModule2] This usually means:")
        print("📥 [DownloadsModule2]   - Device is on cellular but allowsCellularAccess=false")
        print("📥 [DownloadsModule2]   - No network connection available")
        print("📥 [DownloadsModule2]   - Network policy is blocking the download")
        
        // Update state to waiting for network
        if let downloadId = downloadId, var downloadInfo = activeDownloads[downloadId] {
            downloadInfo.state = .waitingForNetwork
            activeDownloads[downloadId] = downloadInfo
            
            sendEvent(withName: "overonDownloadStateChanged", body: [
                "id": downloadId,
                "state": downloadInfo.state.stringValue,
                "reason": "waiting_for_connectivity"
            ])
        }
    }
}

// MARK: - AVContentKeySessionDelegate
extension DownloadsModule2: AVContentKeySessionDelegate {
    
    func contentKeySession(_ session: AVContentKeySession, didProvide keyRequest: AVContentKeyRequest) {
        // Handle content key requests for FairPlay DRM
        handleContentKeyRequest(keyRequest)
    }
    
    func contentKeySession(_ session: AVContentKeySession, didProvideRenewingContentKeyRequest keyRequest: AVContentKeyRequest) {
        // Handle renewing content key requests
        handleContentKeyRequest(keyRequest)
    }
    
    private func handleContentKeyRequest(_ keyRequest: AVContentKeyRequest) {
        // Implementation for handling content key requests
        // This involves communication with FairPlay licensing server
    }
}
