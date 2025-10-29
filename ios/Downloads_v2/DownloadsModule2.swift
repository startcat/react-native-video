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
    
    // Cache para downloadSpace (evitar cálculos costosos)
    private var cachedDownloadSpace: Int64 = 0
    private var downloadSpaceCacheTime: Date?
    private let DOWNLOAD_SPACE_CACHE_TTL: TimeInterval = 5.0 // 5 segundos
    private let progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in }
    
    // Persistencia de asset paths para recuperar después de restart
    private let ASSET_PATHS_KEY = "com.downloads.assetPaths"
    private let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates" // NUEVO: Persistir descargas en progreso
    
    // Speed tracking
    private var lastProgressUpdate: [String: (bytes: Int64, time: Date)] = [:]
    
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
                print("📥 [DownloadsModule2] Step 1: Validating config")
                guard self.validateDownloadConfig(config) else {
                    print("❌ [DownloadsModule2] Config validation failed")
                    DispatchQueue.main.async {
                        reject("INVALID_CONFIG", "Invalid download configuration", nil)
                    }
                    return
                }
                
                let id = config["id"] as! String
                let uri = config["uri"] as! String
                let title = config["title"] as! String
                print("📥 [DownloadsModule2] Step 2: Config validated - ID: \(id), URI: \(uri)")
                
                // Check if download already exists (puede haber sido restaurado)
                if let existingDownload = self.activeDownloads[id] {
                    print("ℹ️ [DownloadsModule2] Download already exists: \(id) - State: \(existingDownload.state.stringValue)")
                    
                    // Si la descarga está pausada, intentar reanudarla
                    if existingDownload.state == .paused {
                        print("▶️ [DownloadsModule2] Resuming paused download: \(id)")
                        
                        // Si hay una tarea asociada, reanudarla
                        if let downloadTask = self.downloadTasks[id] {
                            downloadTask.resume()
                            var downloadInfo = existingDownload
                            downloadInfo.state = .downloading
                            self.activeDownloads[id] = downloadInfo
                            self.persistDownloadState()
                            
                            self.sendEvent(withName: "overonDownloadStateChanged", body: [
                                "id": id,
                                "state": downloadInfo.state.stringValue
                            ])
                            
                            print("✅ [DownloadsModule2] Resumed existing download: \(id)")
                            DispatchQueue.main.async {
                                resolve(nil)
                            }
                            return
                        } else {
                            print("⚠️ [DownloadsModule2] No task found for paused download, will recreate")
                            print("⚠️ [DownloadsModule2] WARNING: HLS downloads cannot resume partial progress - will restart from 0%")
                            
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
                        print("✅ [DownloadsModule2] Download already \(existingDownload.state.stringValue): \(id)")
                        DispatchQueue.main.async {
                            resolve(nil)
                        }
                        return
                    }
                    // Si está en otro estado (failed, etc), permitir recrear
                    else {
                        print("🔄 [DownloadsModule2] Download in state \(existingDownload.state.stringValue), will recreate")
                        // Limpiar descarga existente
                        self.activeDownloads.removeValue(forKey: id)
                        self.downloadTasks.removeValue(forKey: id)
                    }
                }
                print("📥 [DownloadsModule2] Step 3: Creating new download")
                
                // Create download info
                print("📥 [DownloadsModule2] Step 4: Creating download info")
                
                // Verificar si había una descarga previa restaurada (para preservar progreso)
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
                
                if restoredDownload != nil {
                    print("🔄 [DownloadsModule2] Preserving progress from restored download: \(Int(downloadInfo.progress * 100))% (\(downloadInfo.downloadedBytes) bytes)")
                }
                
                self.activeDownloads[id] = downloadInfo
                print("📥 [DownloadsModule2] Active downloads: \(self.activeDownloads.count)")
                
                // Create AVURLAsset
                print("📥 [DownloadsModule2] Step 5: Creating AVURLAsset")
                guard let url = URL(string: uri) else {
                    print("❌ [DownloadsModule2] Invalid URI: \(uri)")
                    DispatchQueue.main.async {
                        reject("INVALID_URI", "Invalid download URI", nil)
                    }
                    return
                }
                
                // Configurar opciones del asset con headers HTTP si están presentes
                var assetOptions: [String: Any] = [:]
                
                // Agregar headers HTTP si están configurados
                if let headers = config["headers"] as? [String: String], !headers.isEmpty {
                    assetOptions["AVURLAssetHTTPHeaderFieldsKey"] = headers
                    print("📥 [DownloadsModule2] Adding HTTP headers: \(headers.keys.joined(separator: ", "))")
                }
                
                // Agregar cookies HTTP
                if let cookies = HTTPCookieStorage.shared.cookies {
                    assetOptions[AVURLAssetHTTPCookiesKey] = cookies
                    print("📥 [DownloadsModule2] Adding \(cookies.count) HTTP cookies")
                }
                
                let asset = AVURLAsset(url: url, options: assetOptions)
                print("📥 [DownloadsModule2] AVURLAsset created successfully with options")
                
                // Handle DRM if present
                if let drmConfig = config["drm"] as? NSDictionary {
                    print("📥 [DownloadsModule2] Step 6: Processing DRM configuration")
                    try self.setupDRMForAsset(asset, config: drmConfig, contentId: id)
                } else {
                    print("📥 [DownloadsModule2] Step 6: No DRM, skipping")
                }
                
                // Create download task
                print("📥 [DownloadsModule2] Step 7: Creating download task for ID: \(id)")
                print("📥 [DownloadsModule2] Active tasks before: \(self.downloadTasks.count)")
                
                // Clean up any existing task for this ID (safety check)
                if let existingTask = self.downloadTasks[id] {
                    print("⚠️ [DownloadsModule2] Found existing task for ID: \(id), cancelling it")
                    existingTask.cancel()
                    self.downloadTasks.removeValue(forKey: id)
                }
                
                let downloadTask = try self.createDownloadTask(for: asset, with: downloadInfo)
                self.downloadTasks[id] = downloadTask
                print("📥 [DownloadsModule2] Step 8: Download task created and stored")
                print("📥 [DownloadsModule2] Active tasks after: \(self.downloadTasks.count)")
                
                // Update state and start download
                downloadInfo.state = .queued
                self.activeDownloads[id] = downloadInfo
                
                // Persistir estado
                self.persistDownloadState()
                
                print("📥 [DownloadsModule2] Step 9: Starting download if possible")
                self.startDownloadIfPossible(id)
                
                print("📥 [DownloadsModule2] Step 10: Download added successfully, resolving promise")
                DispatchQueue.main.async {
                    resolve(nil)
                }
                
            } catch {
                print("❌ [DownloadsModule2] Error adding download: \(error.localizedDescription)")
                print("❌ [DownloadsModule2] Error details: \(error)")
                DispatchQueue.main.async {
                    reject("ADD_DOWNLOAD_FAILED", "Failed to add download: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc func removeDownload(_ downloadId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        downloadQueue.async { [weak self] in
            guard let self = self else { return }
            
            print("📥 [DownloadsModule2] Removing download: \(downloadId)")
            do {
                // Cancel download task if active
                if let downloadTask = self.downloadTasks[downloadId] {
                    print("📥 [DownloadsModule2] Cancelling download task for: \(downloadId)")
                    downloadTask.cancel()
                    self.downloadTasks.removeValue(forKey: downloadId)
                    print("📥 [DownloadsModule2] Task removed. Remaining tasks: \(self.downloadTasks.count)")
                } else {
                    print("⚠️ [DownloadsModule2] No active task found for: \(downloadId)")
                }
                
                // Remove download info
                self.activeDownloads.removeValue(forKey: downloadId)
                self.lastProgressUpdate.removeValue(forKey: downloadId)
                print("📥 [DownloadsModule2] Download info removed. Remaining downloads: \(self.activeDownloads.count)")
                
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
                
                print("✅ [DownloadsModule2] Download removed successfully: \(downloadId)")
                DispatchQueue.main.async {
                    resolve(nil)
                }
                
            } catch {
                print("❌ [DownloadsModule2] Error removing download \(downloadId): \(error.localizedDescription)")
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
        
        // SOLUCIÓN 2: Recuperar tareas pendientes del sistema
        print("🔄 [DownloadsModule2] Checking for pending download tasks from iOS...")
        downloadsSession?.getAllTasks { [weak self] tasks in
            guard let self = self else { return }
            
            print("📥 [DownloadsModule2] Found \(tasks.count) pending tasks in URLSession")
            
            for task in tasks {
                if let assetTask = task as? AVAssetDownloadTask {
                    print("   📦 Pending task: \(assetTask.taskIdentifier), state: \(assetTask.state.rawValue)")
                    
                    // Intentar recuperar del estado persistido
                    self.recoverPendingTask(assetTask)
                }
            }
            
            if tasks.isEmpty {
                print("⚠️ [DownloadsModule2] No pending tasks found - downloads may have been cancelled by iOS")
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
            print("❌ [DownloadsModule2] Download session not initialized")
            throw NSError(domain: "DownloadsModule2", code: -1, userInfo: [NSLocalizedDescriptionKey: "Download session not initialized"])
        }
        
        // Determine bitrate based on quality setting
        let minBitrate: Int
        switch downloadInfo.quality {
        case "low":
            minBitrate = 1_500_000 // 1.5 Mbps - SD quality
            print("📥 [DownloadsModule2] Using LOW quality: \(minBitrate) bps")
        case "medium":
            minBitrate = 2_500_000 // 2.5 Mbps - HD ready
            print("📥 [DownloadsModule2] Using MEDIUM quality: \(minBitrate) bps")
        case "high":
            minBitrate = 5_000_000 // 5 Mbps - Full HD
            print("📥 [DownloadsModule2] Using HIGH quality: \(minBitrate) bps")
        default:
            minBitrate = 2_000_000 // 2 Mbps - Default to medium-low
            print("📥 [DownloadsModule2] Using DEFAULT quality: \(minBitrate) bps")
        }
        
        print("📥 [DownloadsModule2] Creating download task for: \(downloadInfo.title)")
        
        // No especificar bitrate mínimo para permitir cualquier variante disponible
        // Esto evita errores HTTP 500 cuando el manifest no tiene la calidad solicitada
        let downloadTask = session.makeAssetDownloadTask(
            asset: asset,
            assetTitle: downloadInfo.title,
            assetArtworkData: nil,
            options: nil  // Dejar que iOS elija la mejor variante disponible
        )
        
        print("📥 [DownloadsModule2] Download task created without bitrate restriction (iOS will auto-select)")
        
        // Safe unwrap instead of force unwrap to prevent crashes
        guard let task = downloadTask else {
            print("❌ [DownloadsModule2] Failed to create download task for asset")
            throw NSError(
                domain: "DownloadsModule2",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create download task for asset: \(downloadInfo.title)"]
            )
        }
        
        print("✅ [DownloadsModule2] Download task created successfully")
        return task
    }
    
    private func startDownloadIfPossible(_ downloadId: String) {
        let activeCount = activeDownloads.values.filter { $0.state == .downloading }.count
        print("📥 [DownloadsModule2] Checking if can start download \(downloadId) (active: \(activeCount)/\(maxConcurrentDownloads))")
        
        if activeCount < maxConcurrentDownloads {
            if let downloadTask = downloadTasks[downloadId] {
                print("📥 [DownloadsModule2] Starting download task: \(downloadId)")
                print("📥 [DownloadsModule2] Task state before resume: \(downloadTask.state.rawValue)")
                
                downloadTask.resume()
                
                print("📥 [DownloadsModule2] Task state after resume: \(downloadTask.state.rawValue)")
                print("📥 [DownloadsModule2] Task description: \(downloadTask.taskDescription ?? "nil")")
                print("📥 [DownloadsModule2] Task identifier: \(downloadTask.taskIdentifier)")
                
                if var downloadInfo = activeDownloads[downloadId] {
                    downloadInfo.state = .downloading
                    activeDownloads[downloadId] = downloadInfo
                    
                    // Persistir estado al iniciar
                    persistDownloadState()
                    
                    sendEvent(withName: "overonDownloadStateChanged", body: [
                        "id": downloadId,
                        "state": downloadInfo.state.stringValue
                    ])
                    print("✅ [DownloadsModule2] Download started: \(downloadId)")
                }
            } else {
                print("⚠️ [DownloadsModule2] No task found for download: \(downloadId)")
            }
        } else {
            print("⚠️ [DownloadsModule2] Max concurrent downloads reached (\(maxConcurrentDownloads)), queuing: \(downloadId)")
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
        let fileManager = FileManager.default
        
        guard let downloadInfo = activeDownloads[downloadId] else {
            print("⚠️ [DownloadsModule2] No download info found for: \(downloadId)")
            return
        }
        
        // If asset path exists, delete the downloaded asset
        if let assetPath = downloadInfo.assetPath {
            let assetURL = URL(fileURLWithPath: assetPath)
            
            if fileManager.fileExists(atPath: assetPath) {
                do {
                    try fileManager.removeItem(at: assetURL)
                    print("✅ [DownloadsModule2] Deleted asset at: \(assetPath)")
                } catch {
                    print("❌ [DownloadsModule2] Error deleting asset: \(error.localizedDescription)")
                    throw error
                }
            } else {
                print("⚠️ [DownloadsModule2] Asset file not found at: \(assetPath)")
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
                // Check if the name contains the downloadId
                if itemName.contains(downloadId) {
                    try fileManager.removeItem(at: item)
                    print("✅ [DownloadsModule2] Deleted download file/folder: \(itemName)")
                }
            }
        } catch {
            print("⚠️ [DownloadsModule2] Error cleaning download directory: \(error.localizedDescription)")
            // Don't throw - partial cleanup is acceptable
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
            print("❌ [DownloadsModule2] Error getting storage info: \(error.localizedDescription)")
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

// MARK: - AVAssetDownloadDelegate
extension DownloadsModule2: AVAssetDownloadDelegate {
    
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
        // Handle download completion
        print("📥 [DownloadsModule2] Download finished, finding ID...")
        if let downloadId = findDownloadId(for: assetDownloadTask) {
            print("✅ [DownloadsModule2] Download completed: \(downloadId)")
            print("📥 [DownloadsModule2] Location: \(location.path)")
            
            // Calculate actual file size of the downloaded asset
            let actualSize = calculateAssetSize(at: location)
            print("📥 [DownloadsModule2] Actual file size: \(actualSize) bytes (\(Double(actualSize) / 1024.0 / 1024.0) MB)")
            
            var downloadInfo = activeDownloads[downloadId]!
            downloadInfo.state = .completed
            downloadInfo.completionTime = Date()
            downloadInfo.totalBytes = actualSize
            downloadInfo.downloadedBytes = actualSize
            downloadInfo.progress = 1.0
            downloadInfo.assetPath = location.path
            activeDownloads[downloadId] = downloadInfo
            
            // Persistir asset path para recuperarlo después de restart
            saveAssetPath(location.path, forDownloadId: downloadId)
            
            // Persistir estado completo
            persistDownloadState()
            
            // Invalidar cache de downloadSpace
            invalidateDownloadSpaceCache()
            
            sendEvent(withName: "overonDownloadCompleted", body: [
                "id": downloadId,
                "path": location.path,
                "totalBytes": actualSize,
                "duration": Date().timeIntervalSince(downloadInfo.startTime!)
            ])
        } else {
            print("⚠️ [DownloadsModule2] Could not find download ID for completed task")
        }
    }
    
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loadedTimeRanges: [NSValue], timeRangeExpectedToLoad: CMTimeRange) {
        // Handle progress updates
        print("📥 [DownloadsModule2] Progress delegate called")
        
        if let downloadId = findDownloadId(for: assetDownloadTask) {
            print("📥 [DownloadsModule2] Progress for download: \(downloadId)")
            
            let totalDuration = CMTimeGetSeconds(timeRangeExpectedToLoad.duration)
            let loadedDuration = loadedTimeRanges.reduce(0.0) { total, value in
                let timeRange = value.timeRangeValue
                return total + CMTimeGetSeconds(timeRange.duration)
            }
            
            let progress = Float(loadedDuration / totalDuration)
            print("📥 [DownloadsModule2] Progress: \(progress * 100)% (\(loadedDuration)/\(totalDuration))")
            
            if var downloadInfo = activeDownloads[downloadId] {
                // Estimate bytes based on duration and bitrate
                // For HLS with quality "low", estimate ~1.5 Mbps (1,500,000 bits/sec = 187,500 bytes/sec)
                // For other qualities, use higher estimate
                let estimatedBitrate: Double
                switch downloadInfo.quality {
                case "low":
                    estimatedBitrate = 187_500 // ~1.5 Mbps in bytes/sec
                case "medium":
                    estimatedBitrate = 312_500 // ~2.5 Mbps in bytes/sec
                case "high":
                    estimatedBitrate = 625_000 // ~5 Mbps in bytes/sec
                default:
                    estimatedBitrate = 300_000 // ~2.4 Mbps default
                }
                
                let totalBytes = Int64(totalDuration * estimatedBitrate)
                let downloadedBytes = Int64(loadedDuration * estimatedBitrate)
                
                // Calculate speed based on previous progress update
                let now = Date()
                var speed: Double = 0
                var remainingTime: Int = 0
                
                if let lastUpdate = lastProgressUpdate[downloadId] {
                    let timeDiff = now.timeIntervalSince(lastUpdate.time)
                    if timeDiff > 0 {
                        let bytesDiff = downloadedBytes - lastUpdate.bytes
                        speed = Double(bytesDiff) / timeDiff // bytes per second
                        
                        // Calculate remaining time
                        let remainingBytes = totalBytes - downloadedBytes
                        if speed > 0 {
                            remainingTime = Int(Double(remainingBytes) / speed)
                        }
                    }
                }
                
                // Update last progress tracking
                lastProgressUpdate[downloadId] = (bytes: downloadedBytes, time: now)
                
                // Update downloadInfo
                downloadInfo.progress = progress
                downloadInfo.totalBytes = totalBytes
                downloadInfo.downloadedBytes = downloadedBytes
                downloadInfo.speed = speed
                downloadInfo.remainingTime = remainingTime
                activeDownloads[downloadId] = downloadInfo
                
                // Persistir estado cada 10% de progreso
                let currentProgressInt = Int(progress * 100)
                let previousProgressInt = Int((downloadInfo.progress - 0.1) * 100)
                if currentProgressInt % 10 == 0 && currentProgressInt != previousProgressInt {
                    persistDownloadState()
                }
                
                print("📥 [DownloadsModule2] Sending progress event: \(Int(progress * 100))%, \(downloadedBytes) / \(totalBytes) bytes, \(Int(speed)) bytes/s")
                sendEvent(withName: "overonDownloadProgress", body: [
                    "id": downloadId,
                    "progress": Int(progress * 100),
                    "bytesDownloaded": downloadedBytes,
                    "totalBytes": totalBytes,
                    "speed": speed,
                    "remainingTime": remainingTime
                ])
            } else {
                print("⚠️ [DownloadsModule2] Download info not found for: \(downloadId)")
            }
        } else {
            print("⚠️ [DownloadsModule2] Could not find download ID for progress update")
            print("⚠️ [DownloadsModule2] Active tasks: \(downloadTasks.keys)")
        }
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        print("📥 [DownloadsModule2] Task completed delegate called")
        
        if let error = error {
            print("❌ [DownloadsModule2] Download task completed with error: \(error.localizedDescription)")
            print("❌ [DownloadsModule2] Error domain: \((error as NSError).domain), code: \((error as NSError).code)")
            
            if let downloadId = findDownloadId(for: task as! AVAssetDownloadTask) {
                print("❌ [DownloadsModule2] Download failed: \(downloadId)")
                var downloadInfo = activeDownloads[downloadId]!
                downloadInfo.state = .failed
                downloadInfo.error = error
                activeDownloads[downloadId] = downloadInfo
                
                // Persistir estado de fallo
                persistDownloadState()
                
                // Invalidar cache de downloadSpace
                invalidateDownloadSpaceCache()
                
                sendEvent(withName: "overonDownloadError", body: [
                    "id": downloadId,
                    "error": [
                        "code": "DOWNLOAD_FAILED",
                        "message": error.localizedDescription
                    ]
                ])
            } else {
                print("⚠️ [DownloadsModule2] Could not find download ID for failed task")
            }
        } else {
            print("✅ [DownloadsModule2] Task completed successfully without error")
        }
    }
    
    private func findDownloadId(for task: AVAssetDownloadTask) -> String? {
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
                print("✅ [DownloadsModule2] File exists at original path: \(url.path)")
                pathToUse = url.path
            } 
            // Si no existe y tiene prefijo /.nofollow, intentar sin él
            else if url.path.hasPrefix("/.nofollow") {
                let cleanPath = String(url.path.dropFirst("/.nofollow".count))
                if fileManager.fileExists(atPath: cleanPath, isDirectory: &isDirectory) {
                    print("✅ [DownloadsModule2] File exists at cleaned path: \(cleanPath)")
                    pathToUse = cleanPath
                } else {
                    print("❌ [DownloadsModule2] File not found at original path: \(url.path)")
                    print("❌ [DownloadsModule2] File not found at cleaned path: \(cleanPath)")
                    print("⚠️ [DownloadsModule2] Path does not exist in either location")
                    return 0
                }
            } else {
                print("⚠️ [DownloadsModule2] Path does not exist: \(url.path)")
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
                                print("⚠️ [DownloadsModule2] Error getting file size for: \(fileURL.path) - \(error.localizedDescription)")
                            }
                        }
                        
                        if fileCount > 0 {
                            print("📊 [DownloadsModule2] Calculated size for directory \(workingURL.lastPathComponent): \(totalSize) bytes from \(fileCount) files")
                        } else {
                            print("⚠️ [DownloadsModule2] No files found in directory: \(pathToUse)")
                        }
                    } else {
                        print("⚠️ [DownloadsModule2] Could not create enumerator for: \(pathToUse)")
                    }
                } else {
                    // Single file
                    let resourceValues = try workingURL.resourceValues(forKeys: [.fileSizeKey])
                    if let fileSize = resourceValues.fileSize {
                        totalSize = Int64(fileSize)
                        print("📊 [DownloadsModule2] Calculated size for file \(workingURL.lastPathComponent): \(totalSize) bytes")
                    }
                }
            }
        } catch {
            print("❌ [DownloadsModule2] Error calculating asset size: \(error.localizedDescription)")
        }
        
        return totalSize
    }
    
    private func calculateTotalDownloadsSize() -> Int64 {
        // Verificar cache
        if let cacheTime = downloadSpaceCacheTime {
            let age = Date().timeIntervalSince(cacheTime)
            if age < DOWNLOAD_SPACE_CACHE_TTL {
                print("✅ [DownloadsModule2] Using cached download space (age: \(String(format: "%.1f", age))s)")
                return cachedDownloadSpace
            }
        }
        
		print("🔄 [DownloadsModule2] Calculating download space (cache miss or expired)")
		print("📊 [DownloadsModule2] Total activeDownloads count: \(activeDownloads.count)")
		print("🔍 [DownloadsModule2] DEBUG: activeDownloads keys: \(Array(activeDownloads.keys))")
		var totalSize: Int64 = 0
        
        // OPCIÓN 1: Calcular tamaño de activeDownloads (descargas activas en memoria)
		var activeDownloadsSize: Int64 = 0
		var completedCount = 0
		var downloadingCount = 0
		var pausedCount = 0

		for (downloadId, downloadInfo) in activeDownloads {
			print("   📦 Download '\(downloadId)': state=\(downloadInfo.state.stringValue), hasPath=\(downloadInfo.assetPath != nil), bytes=\(downloadInfo.downloadedBytes)")
			
			if downloadInfo.state == .completed, let assetPath = downloadInfo.assetPath {
				completedCount += 1
				let assetURL = URL(fileURLWithPath: assetPath)
				let size = calculateAssetSize(at: assetURL)
				activeDownloadsSize += size
				print("   ✅ Completed download: \(Double(size) / 1024.0 / 1024.0) MB at \(assetPath)")
				
				// MIGRACIÓN: Si esta descarga completada no está en savedPaths, guardarla ahora
				var currentSavedPaths = loadAssetPaths()
				if currentSavedPaths[downloadId] == nil {
					print("   🔄 Migrating asset path to UserDefaults for \(downloadId)")
					saveAssetPath(assetPath, forDownloadId: downloadId)
				}
			} else if downloadInfo.state == .downloading || downloadInfo.state == .paused {
				if downloadInfo.state == .downloading { downloadingCount += 1 }
				if downloadInfo.state == .paused { pausedCount += 1 }
				activeDownloadsSize += downloadInfo.downloadedBytes
				print("   ⏳ In-progress download: \(Double(downloadInfo.downloadedBytes) / 1024.0 / 1024.0) MB downloaded")
			}
		}
		
		print("📊 [DownloadsModule2] Active downloads summary: completed=\(completedCount), downloading=\(downloadingCount), paused=\(pausedCount)")
		
        // OPCIÓN 2: Calcular tamaño REAL de los assets persistidos
        // iOS AVAssetDownloadTask guarda assets en ubicación del sistema, no en /Documents
        // Usamos los paths persistidos que guardamos al completar cada descarga
        var persistedAssetsSize: Int64 = 0
        let savedPaths = loadAssetPaths()
        
        print("📂 [DownloadsModule2] Found \(savedPaths.count) persisted asset paths in UserDefaults")

		if savedPaths.isEmpty {
			print("⚠️ [DownloadsModule2] No persisted asset paths found - this is normal for fresh install or if downloads haven't completed yet")
		}
        
		for (downloadId, assetPath) in savedPaths {
			let assetURL = URL(fileURLWithPath: assetPath)
			let fileManager = FileManager.default
			
			print("   🔍 Checking persisted asset '\(downloadId)' at: \(assetPath)")
			
			if fileManager.fileExists(atPath: assetPath) {
				let size = calculateAssetSize(at: assetURL)
				persistedAssetsSize += size
				print("   ✅ Asset exists: \(Double(size) / 1024.0 / 1024.0) MB")
			} else {
				print("   ❌ Asset file not found (may have been deleted by iOS or user)")
				// Limpiar path que ya no existe
				removeAssetPath(forDownloadId: downloadId)
			}
		}
        
		print("📁 [DownloadsModule2] Persisted assets total: \(persistedAssetsSize) bytes (\(Double(persistedAssetsSize) / 1024.0 / 1024.0) MB)")
		
		// Usar el MAYOR de los dos valores (más conservador y preciso)
		totalSize = max(activeDownloadsSize, persistedAssetsSize)
		
		print("📥 [DownloadsModule2] Active downloads: \(activeDownloadsSize) bytes (\(Double(activeDownloadsSize) / 1024.0 / 1024.0) MB)")
		print("📥 [DownloadsModule2] Persisted assets: \(persistedAssetsSize) bytes (\(Double(persistedAssetsSize) / 1024.0 / 1024.0) MB)")
		print("📥 [DownloadsModule2] Total (max): \(totalSize) bytes (\(Double(totalSize) / 1024.0 / 1024.0) MB)")
		
		if totalSize == 0 {
			print("⚠️ [DownloadsModule2] WARNING: Total download size is 0!")
			print("   Possible reasons:")
			print("   1. No downloads have completed yet (activeDownloads.count: \(activeDownloads.count))")
			print("   2. Completed downloads have no assetPath saved")
			print("   3. UserDefaults has no persisted paths (savedPaths.count: \(savedPaths.count))")
			print("   4. Asset files were deleted by iOS or user")
		}
		
		// Actualizar cache
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
                print("⚠️ [DownloadsModule2] Error getting file size: \(error.localizedDescription)")
            }
        }
        
        return totalSize
    }
    
    // Invalidar cache cuando cambia el estado de las descargas
    private func invalidateDownloadSpaceCache() {
        downloadSpaceCacheTime = nil
        print("🗑️ [DownloadsModule2] Download space cache invalidated")
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
        print("💾 [DownloadsModule2] Persisted \(downloadStates.count) download states")
    }
    
    /// Restaurar estado de descargas desde UserDefaults
    private func restoreDownloadStates() {
        guard let savedStates = UserDefaults.standard.array(forKey: ACTIVE_DOWNLOADS_KEY) as? [[String: Any]] else {
            print("ℹ️ [DownloadsModule2] No saved download states found")
            return
        }
        
        print("🔄 [DownloadsModule2] Restoring \(savedStates.count) download states...")
        
        for state in savedStates {
            guard let id = state["id"] as? String,
                  let uri = state["uri"] as? String,
                  let title = state["title"] as? String,
                  let stateString = state["state"] as? String else {
                print("⚠️ [DownloadsModule2] Invalid state data, skipping")
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
            print("✅ [DownloadsModule2] Restored download: \(id) - \(title) (\(downloadState.stringValue))")
        }
        
        print("✅ [DownloadsModule2] Restored \(activeDownloads.count) downloads")
    }
    
    /// Recuperar una tarea pendiente de iOS y reconectarla con activeDownloads
    private func recoverPendingTask(_ task: AVAssetDownloadTask) {
        // Buscar en activeDownloads si tenemos información de esta descarga
        // Como no tenemos un mapeo directo de taskIdentifier a downloadId,
        // intentamos emparejar por URL del asset
        
        let urlAsset = task.urlAsset
        let taskURL = urlAsset.url.absoluteString
        
        // Buscar download que coincida con esta URL
        for (downloadId, downloadInfo) in activeDownloads {
            if downloadInfo.uri == taskURL {
                print("✅ [DownloadsModule2] Matched pending task to download: \(downloadId)")
                
                // Reconectar task con downloadId
                downloadTasks[downloadId] = task
                
                // Si la tarea está en estado suspendido, mantener el estado pausado
                if task.state == .suspended {
                    var info = downloadInfo
                    info.state = .paused
                    activeDownloads[downloadId] = info
                } else if task.state == .running {
                    var info = downloadInfo
                    info.state = .downloading
                    activeDownloads[downloadId] = info
                }
                
                print("🔗 [DownloadsModule2] Reconnected task \(task.taskIdentifier) to download \(downloadId)")
                return
            }
        }
        
        print("⚠️ [DownloadsModule2] Could not match pending task to any saved download")
    }
    
    // MARK: - Asset Path Persistence Helpers
    
    /// Guardar asset path en UserDefaults para recuperarlo después de restart
    private func saveAssetPath(_ path: String, forDownloadId downloadId: String) {
        var paths = loadAssetPaths()
        paths[downloadId] = path
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()
        print("💾 [DownloadsModule2] Saved asset path for \(downloadId): \(path)")
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
        print("🗑️ [DownloadsModule2] Removed asset path for \(downloadId)")
    }
    
    /// Limpiar todos los asset paths (útil para debugging o reset completo)
    private func clearAllAssetPaths() {
        UserDefaults.standard.removeObject(forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()
        print("🗑️ [DownloadsModule2] Cleared all asset paths")
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
