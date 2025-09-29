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
}

// MARK: - Main Downloads Module Class
@objc(DownloadsModule2)
class DownloadsModule2: RCTEventEmitter {
    
    // MARK: - Properties
    private var downloadsSession: AVAssetDownloadURLSession?
    private var activeDownloads: [String: DownloadInfo] = [:]
    private var downloadTasks: [String: AVAssetDownloadTask] = [:]
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
    private let progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }
    
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
            
            DispatchQueue.main.async {
                resolve(self.getSystemInfoDict())
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
                
                // Check if download already exists
                if self.activeDownloads[id] != nil {
                    DispatchQueue.main.async {
                        reject("DOWNLOAD_EXISTS", "Download with this ID already exists", nil)
                    }
                    return
                }
                
                // Create download info
                var downloadInfo = DownloadInfo(
                    id: id,
                    uri: uri,
                    title: title,
                    state: .preparing,
                    progress: 0.0,
                    totalBytes: 0,
                    downloadedBytes: 0,
                    speed: 0.0,
                    remainingTime: 0,
                    quality: config["quality"] as? String,
                    hasSubtitles: (config["subtitles"] as? NSArray)?.count ?? 0 > 0,
                    hasDRM: config["drm"] != nil,
                    error: nil,
                    startTime: Date()
                )
                
                self.activeDownloads[id] = downloadInfo
                
                // Create AVURLAsset
                guard let url = URL(string: uri) else {
                    DispatchQueue.main.async {
                        reject("INVALID_URI", "Invalid download URI", nil)
                    }
                    return
                }
                
                let asset = AVURLAsset(url: url)
                
                // Handle DRM if present
                if let drmConfig = config["drm"] as? NSDictionary {
                    try self.setupDRMForAsset(asset, config: drmConfig, contentId: id)
                }
                
                // Create download task
                let downloadTask = try self.createDownloadTask(for: asset, with: downloadInfo)
                self.downloadTasks[id] = downloadTask
                
                // Update state and start download
                downloadInfo.state = .queued
                self.activeDownloads[id] = downloadInfo
                
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
                
                // Remove downloaded files
                try self.removeDownloadedFiles(for: downloadId)
                
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
        let config = URLSessionConfiguration.background(withIdentifier: "com.downloads.background")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        
        downloadsSession = AVAssetDownloadURLSession(
            configuration: config,
            assetDownloadDelegate: self,
            delegateQueue: OperationQueue()
        )
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
        contentKeySession = AVContentKeySession(keySystem: .fairPlayStreaming)
        contentKeySession?.setDelegate(self, queue: downloadQueue)
    }
    
    private func setupNetworkMonitoring() {
        // Implementation for network monitoring
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
    
    private func createDownloadTask(for asset: AVURLAsset, with downloadInfo: DownloadInfo) throws -> AVAssetDownloadTask {
        guard let session = downloadsSession else {
            throw NSError(domain: "DownloadsModule2", code: -1, userInfo: [NSLocalizedDescriptionKey: "Download session not initialized"])
        }
        
        let downloadTask = session.makeAssetDownloadTask(
            asset: asset,
            assetTitle: downloadInfo.title,
            assetArtworkData: nil,
            options: [AVAssetDownloadTaskMinimumRequiredMediaBitrateKey: 265_000]
        )
        
        return downloadTask!
    }
    
    private func startDownloadIfPossible(_ downloadId: String) {
        let activeCount = activeDownloads.values.filter { $0.state == .downloading }.count
        
        if activeCount < maxConcurrentDownloads {
            if let downloadTask = downloadTasks[downloadId] {
                downloadTask.resume()
                if var downloadInfo = activeDownloads[downloadId] {
                    downloadInfo.state = .downloading
                    activeDownloads[downloadId] = downloadInfo
                    
                    sendEvent(withName: "overonDownloadStateChanged", body: [
                        "id": downloadId,
                        "state": downloadInfo.state.stringValue
                    ])
                }
            }
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
        // Implementation for DRM setup
        contentKeySession?.addContentKeyRecipient(asset)
    }
    
    private func removeDownloadedFiles(for downloadId: String) throws {
        // Implementation for removing downloaded files
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
        
        // Get storage information
        do {
            let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
            let resourceValues = try documentsURL.resourceValues(forKeys: [.volumeAvailableCapacityKey, .volumeTotalCapacityKey])
            
            let availableSpace = resourceValues.volumeAvailableCapacity ?? 0
            let totalSpace = resourceValues.volumeTotalCapacity ?? 0
            
            return [
                "totalSpace": totalSpace,
                "availableSpace": availableSpace,
                "downloadSpace": 0, // Calculate actual download space
                "isConnected": true, // Get from network monitoring
                "isWifiConnected": true, // Get from network monitoring
                "isCellularConnected": false // Get from network monitoring
            ]
        } catch {
            return [:]
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

// MARK: - AVAssetDownloadDelegate
extension DownloadsModule2: AVAssetDownloadDelegate {
    
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
        // Handle download completion
        if let downloadId = findDownloadId(for: assetDownloadTask) {
            var downloadInfo = activeDownloads[downloadId]!
            downloadInfo.state = .completed
            downloadInfo.completionTime = Date()
            activeDownloads[downloadId] = downloadInfo
            
            sendEvent(withName: "overonDownloadCompleted", body: [
                "id": downloadId,
                "path": location.path,
                "duration": Date().timeIntervalSince(downloadInfo.startTime!)
            ])
        }
    }
    
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange) {
        // Handle progress updates
        if let downloadId = findDownloadId(for: assetDownloadTask) {
            let totalDuration = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
            let loadedDuration = loadedTimeRanges.reduce(0.0) { total, value in
                let timeRange = value.timeRangeValue
                return total + CMTimeGetSeconds(timeRange.duration)
            }
            
            let progress = Float(loadedDuration / totalDuration)
            
            if var downloadInfo = activeDownloads[downloadId] {
                downloadInfo.progress = progress
                activeDownloads[downloadId] = downloadInfo
                
                sendEvent(withName: "overonDownloadProgress", body: [
                    "id": downloadId,
                    "progress": Int(progress * 100),
                    "speed": downloadInfo.speed,
                    "remainingTime": downloadInfo.remainingTime
                ])
            }
        }
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            if let downloadId = findDownloadId(for: task as! AVAssetDownloadTask) {
                var downloadInfo = activeDownloads[downloadId]!
                downloadInfo.state = .failed
                downloadInfo.error = error
                activeDownloads[downloadId] = downloadInfo
                
                sendEvent(withName: "overonDownloadError", body: [
                    "id": downloadId,
                    "error": [
                        "code": "DOWNLOAD_FAILED",
                        "message": error.localizedDescription
                    ]
                ])
            }
        }
    }
    
    private func findDownloadId(for task: AVAssetDownloadTask) -> String? {
        return downloadTasks.first { $0.value == task }?.key
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
