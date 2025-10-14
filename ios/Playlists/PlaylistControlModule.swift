/*
 * PlaylistControlModule
 *
 * Módulo nativo iOS para gestión de playlists de reproducción.
 * Permite reproducción en background, auto-next, y controles del widget multimedia.
 *
 * MODO COORDINADO:
 * Este módulo puede trabajar en dos modos:
 * 1. Standalone: Gestiona su propio AVPlayer (para audio background)
 * 2. Coordinado: Escucha eventos de RCTVideo y gestiona solo la cola
 */

import AVFoundation
import Foundation
import MediaPlayer
import React

// MARK: - Notification Names
// Note: RCTVideoItemDidFinish and PlaylistLoadNextSource are defined in RCTVideo+PlaylistIntegration.swift

extension Notification.Name {
    /// Emitido por PlaylistControlModule cuando cambia el item actual
    static let PlaylistItemDidChange = Notification.Name("PlaylistItemDidChange")
}

@objc(PlaylistControlModule)
class PlaylistControlModule: RCTEventEmitter {
    
    // MARK: - Singleton
    
    @objc static let shared = PlaylistControlModule()
    
    // Track if an instance has already been initialized to prevent multiple players
    private static var hasInitializedInstance = false
    private static let instanceLock = NSLock()
    
    // Track if this is the active instance
    private var isActiveInstance: Bool = false
    
    // MARK: - Properties
    
    private var playlist: [PlaylistItem] = []
    private var currentIndex: Int = 0
    private var config: PlaylistConfiguration = PlaylistConfiguration()
    
    // Operation mode
    private enum OperationMode {
        case coordinated  // RCTVideo handles playback (like Android)
        case standalone   // Module has its own AVPlayer (legacy)
    }
    private var operationMode: OperationMode = .coordinated
    
    /// Modo standalone: usa su propio AVPlayer (DEPRECATED - use coordinated mode)
    private var player: AVPlayer?
    private var playerObserver: Any?
    private var timeObserver: Any?
    
    private var isPlaybackActive: Bool = false
    private var hasSetupRemoteCommands: Bool = false
    
    private var currentItemId: String?
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        
        // Only allow one active instance to avoid multiple players
        Self.instanceLock.lock()
        defer { Self.instanceLock.unlock() }
        
        if !Self.hasInitializedInstance {
            Self.hasInitializedInstance = true
            isActiveInstance = true
            setupNativeEventListeners()
            print("[PlaylistControlModule] ✅ Active instance initialized")
        } else {
            isActiveInstance = false
            print("[PlaylistControlModule] ⚠️ Additional instance created (will be ignored to prevent multiple players)")
        }
    }
    
    deinit {
        cleanup()
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - Native Event Listeners
    
    private func setupNativeEventListeners() {
        // Listen for RCTVideo item completion (for coordinated mode)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRCTVideoItemFinished(_:)),
            name: .RCTVideoItemDidFinish,
            object: nil
        )
    }
    
    @objc private func handleRCTVideoItemFinished(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            let itemId = notification.userInfo?["itemId"] as? String
            
            print("[PlaylistControlModule] 🎬 RCTVideo item finished: \(itemId ?? "unknown")")
            
            // Notify completion and advance
            self.handleItemCompletionInCoordinatedMode(itemId: itemId)
        }
    }
    
    private func handleItemCompletionInCoordinatedMode(itemId: String?) {
        guard let currentItem = getCurrentItem() else { return }
        
        // Verify item ID matches if provided
        if let itemId = itemId, currentItem.id != itemId {
            print("[PlaylistControlModule] ⚠️ Item ID mismatch: expected \(currentItem.id), got \(itemId)")
        }
        
        // Emit completion event to JavaScript
        sendEvent(
            withName: "onNativeItemCompleted",
            body: [
                "itemId": currentItem.id,
                "index": currentIndex,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
        )
        
        print("[PlaylistControlModule] 📊 Item completed: \(currentItem.id)")
        
        // Auto-advance if enabled
        if config.autoNext || currentItem.type.uppercased() == "TUDUM" {
            advanceToNextItem()
        }
    }
    
    private func advanceToNextItem() {
        let nextIndex = getNextIndex()
        
        if nextIndex == -1 {
            // Playlist ended
            print("[PlaylistControlModule] 🏁 Playlist ended")
            isPlaybackActive = false
            
            sendEvent(
                withName: "onNativePlaylistEnded",
                body: ["timestamp": Date().timeIntervalSince1970 * 1000]
            )
            return
        }
        
        let previousIndex = currentIndex
        currentIndex = nextIndex
        
        guard let nextItem = getCurrentItem() else { return }
        
        print("[PlaylistControlModule] ⏭️ Advancing to next item: \(nextItem.metadata.title ?? "Unknown")")
        
        // Emit item changed event
        sendEvent(
            withName: "onNativeItemChanged",
            body: [
                "itemId": nextItem.id,
                "index": currentIndex,
                "previousIndex": previousIndex,
                "item": nextItem.toDict()
            ]
        )
    }
    
    // MARK: - React Native Module Setup
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    // Force React Native to use the singleton instance
    override class func moduleName() -> String! {
        return "PlaylistControlModule"
    }
    
    override func supportedEvents() -> [String]! {
        return [
            "onNativeItemChanged",
            "onNativeItemStarted",
            "onNativeItemCompleted",
            "onNativeItemError",
            "onNativeProgressUpdate",
            "onNativePlaylistEnded"
        ]
    }
    
    // MARK: - Public API (JavaScript Interface)
    
    @objc func setPlaylist(_ items: [[String: Any]], config: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Only allow active instance to prevent multiple players
            guard self.isActiveInstance else {
                print("[PlaylistControlModule] ⚠️ setPlaylist called on inactive instance (ignored)")
                return
            }
            
            // Parse items
            let totalItems = items.count
            self.playlist = items.compactMap { PlaylistItem(dict: $0) }
            let successCount = self.playlist.count
            let failCount = totalItems - successCount
            
            print("[PlaylistControlModule] 📋 Playlist loaded: \(successCount) items parsed successfully, \(failCount) failed")
            
            // Validate we have at least one item
            guard !self.playlist.isEmpty else {
                print("[PlaylistControlModule] ❌ No valid items in playlist. All \(totalItems) items failed to parse.")
                return
            }
            
            // Parse config
            if let startAt = config["startAt"] as? Int {
                let requestedIndex = startAt
                self.currentIndex = max(0, min(startAt, self.playlist.count - 1))
                if requestedIndex != self.currentIndex {
                    print("[PlaylistControlModule] ⚠️ Requested startAt=\(requestedIndex) adjusted to \(self.currentIndex) (max=\(self.playlist.count - 1))")
                }
            } else {
                self.currentIndex = 0
            }
            
            if let configData = config["config"] as? [String: Any] {
                self.config = PlaylistConfiguration(dict: configData)
                print("[PlaylistControlModule] ⚙️ Config: autoNext=\(self.config.autoNext), repeatMode=\(self.config.repeatMode.rawValue)")
            }
            
            // Log operation mode
            let modeStr = self.operationMode == .coordinated ? "COORDINATED" : "STANDALONE"
            print("[PlaylistControlModule] 🎭 Operation mode: \(modeStr) (RCTVideo handles playback: \(self.operationMode == .coordinated))")
            
            // Setup remote commands if not already done
            // if !self.hasSetupRemoteCommands {
            //     self.setupRemoteCommands()
            //     self.hasSetupRemoteCommands = true
            // }
            
        }
    }
    
    @objc func goToIndex(_ index: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Only allow active instance
            guard self.isActiveInstance else { return }
            
            guard index >= 0 && index < self.playlist.count else {
                print("[PlaylistControlModule] ⚠️ Invalid index: \(index)")
                return
            }
            
            let previousIndex = self.currentIndex
            self.currentIndex = index
            
            guard let item = self.getCurrentItem() else { return }
            
            print("[PlaylistControlModule] 🎯 Going to index \(index): \(item.metadata.title ?? "Unknown")")
            
            // Emit event
            self.sendEvent(
                withName: "onNativeItemChanged",
                body: [
                    "itemId": item.id,
                    "index": index,
                    "previousIndex": previousIndex,
                    "item": item.toDict(),
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ]
            )
            
            // Load the new item only in standalone mode
            if self.operationMode == .standalone {
                print("[PlaylistControlModule] 🎬 Standalone mode: loading item in native player")
                self.loadCurrentItem()
            } else {
                print("[PlaylistControlModule] 🎬 Coordinated mode: RCTVideo will handle playback")
            }
        }
    }
    
    @objc func getCurrentPlaylistItem() -> NSDictionary? {
        guard currentIndex >= 0 && currentIndex < playlist.count else {
            return nil
        }
        return playlist[currentIndex].toDict() as NSDictionary
    }
    
    @objc func getNextPlaylistItem() -> NSDictionary? {
        let nextIndex = getNextIndex()
        guard nextIndex >= 0 && nextIndex < playlist.count else {
            return nil
        }
        return playlist[nextIndex].toDict() as NSDictionary
    }
    
    @objc func addItem(_ item: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let newItem = PlaylistItem(dict: item) else {
                return
            }
            self.playlist.append(newItem)
        }
    }
    
    @objc func removeItemAt(_ index: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  index >= 0 && index < self.playlist.count else {
                return
            }
            
            self.playlist.remove(at: index)
            
            // Adjust current index if necessary
            if index < self.currentIndex {
                self.currentIndex -= 1
            } else if index == self.currentIndex {
                // Current item was removed
                if self.playlist.isEmpty {
                    self.currentIndex = -1
                    self.cleanup()
                } else {
                    // Adjust to valid index
                    self.currentIndex = min(self.currentIndex, self.playlist.count - 1)
                    if self.isPlaybackActive {
                        self.loadCurrentItem()
                    }
                }
            }
        }
    }
    
    @objc func setRepeatMode(_ mode: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.config.repeatMode = PlaylistRepeatMode(rawValue: mode) ?? .off
        }
    }
    
    @objc func setShuffleMode(_ mode: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.config.shuffleMode = PlaylistShuffleMode(rawValue: mode) ?? .off
        }
    }
    
    @objc func setAutoNext(_ enabled: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.config.autoNext = enabled
        }
    }
    
    // MARK: - Private Methods
    
    private func setupAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
        } catch {
            print("[PlaylistControlModule] Failed to setup audio session: \(error)")
        }
    }
    
    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        // Play command
        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.handlePlayCommand()
            return .success
        }
        
        // Pause command
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.handlePauseCommand()
            return .success
        }
        
        // Next track command
        commandCenter.nextTrackCommand.isEnabled = true
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.handleNextTrack()
            return .success
        }
        
        // Previous track command
        commandCenter.previousTrackCommand.isEnabled = true
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.handlePreviousTrack()
            return .success
        }
        
        // Change playback position command
        commandCenter.changePlaybackPositionCommand.isEnabled = true
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self,
                  let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            
            self.player?.seek(to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 1))
            return .success
        }
    }
    
    private func loadCurrentItem() {
        guard currentIndex >= 0 && currentIndex < playlist.count else {
            return
        }
        
        let item = playlist[currentIndex]
        
        // Cleanup previous player
        removePlayerObservers()
        
        // Pause current player before replacing item to avoid double playback
        player?.pause()
        
        // Create new player item
        guard let url = URL(string: item.source.uri) else {
            emitItemError(item: item, error: "Invalid URL: \(item.source.uri)")
            handleAutoNext()
            return
        }
        
        let asset = AVURLAsset(url: url)
        let playerItem = AVPlayerItem(asset: asset)
        
        // Create or reuse player
        if player == nil {
            player = AVPlayer(playerItem: playerItem)
        } else {
            player?.replaceCurrentItem(with: playerItem)
        }
        
        // Setup observers
        setupPlayerObservers(for: playerItem)
        
        // Update Now Playing Info
        updateNowPlayingInfo(for: item)
        
        // Emit started event
        sendEvent(
            withName: "onNativeItemStarted",
            body: [
                "itemId": item.id,
                "index": currentIndex,
                "startPosition": item.startPosition ?? 0,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
        )
        
        // Start playback
        player?.play()
        isPlaybackActive = true
    }
    
    private func setupPlayerObservers(for playerItem: AVPlayerItem) {
        // Observe item status
        playerObserver = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard let self = self else { return }
            
            switch item.status {
            case .failed:
                if let error = item.error {
                    self.handleItemError(error: error)
                }
            case .readyToPlay:
                break
            case .unknown:
                break
            @unknown default:
                break
            }
        }
        
        // Observe playback end
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemDidFinishPlaying(_:)),
            name: .AVPlayerItemDidPlayToEndTime,
            object: playerItem
        )
        
        // Observe playback stall
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemPlaybackStalled(_:)),
            name: .AVPlayerItemPlaybackStalled,
            object: playerItem
        )
        
        // Time observer for progress
        let interval = CMTime(seconds: 1.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.handleTimeUpdate(time: time)
        }
    }
    
    private func removePlayerObservers() {
        if let observer = playerObserver {
            (observer as AnyObject).invalidate()
            playerObserver = nil
        }
        
        if let timeObs = timeObserver {
            player?.removeTimeObserver(timeObs)
            timeObserver = nil
        }
        
        NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: nil)
        NotificationCenter.default.removeObserver(self, name: .AVPlayerItemPlaybackStalled, object: nil)
    }
    
    private func updateNowPlayingInfo(for item: PlaylistItem) {
        var nowPlayingInfo = [String: Any]()
        
        // Basic info
        nowPlayingInfo[MPMediaItemPropertyTitle] = item.metadata.title ?? "Unknown"
        nowPlayingInfo[MPMediaItemPropertyArtist] = item.metadata.artist ?? ""
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = item.metadata.album ?? ""
        
        // Duration
        if let duration = item.duration {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        }
        
        // Current time
        if let currentTime = player?.currentTime().seconds, !currentTime.isNaN {
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        }
        
        // Playback rate
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = player?.rate ?? 0
        
        // Artwork (if available)
        if let imageUri = item.metadata.imageUri {
            loadArtwork(from: imageUri) { image in
                if let image = image {
                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                }
            }
        }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
    
    private func loadArtwork(from urlString: String, completion: @escaping (UIImage?) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(nil)
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, _, _ in
            if let data = data, let image = UIImage(data: data) {
                DispatchQueue.main.async {
                    completion(image)
                }
            } else {
                DispatchQueue.main.async {
                    completion(nil)
                }
            }
        }.resume()
    }
    
    // MARK: - Player Notifications
    
    @objc private func playerItemDidFinishPlaying(_ notification: Notification) {
        guard let item = getCurrentItem() else { return }
        
        sendEvent(
            withName: "onNativeItemCompleted",
            body: [
                "itemId": item.id,
                "index": currentIndex,
                "duration": player?.currentItem?.duration.seconds ?? 0,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
        )
        
        handleAutoNext()
    }
    
    @objc private func playerItemPlaybackStalled(_ notification: Notification) {
        // Handle playback stall - could retry or skip
        print("[PlaylistControlModule] Playback stalled")
    }
    
    // MARK: - Remote Command Handlers
    
    private func handlePlayCommand() {
        guard isActiveInstance else {
            print("[PlaylistControlModule] ⚠️ handlePlayCommand called on inactive instance (ignored)")
            return
        }
        print("[PlaylistControlModule] ▶️ Remote play command")
        player?.play()
    }
    
    private func handlePauseCommand() {
        guard isActiveInstance else {
            print("[PlaylistControlModule] ⚠️ handlePauseCommand called on inactive instance (ignored)")
            return
        }
        print("[PlaylistControlModule] ⏸️ Remote pause command")
        player?.pause()
    }
    
    private func handleNextTrack() {
        guard isActiveInstance else { return }
        print("[PlaylistControlModule] ⏭️ Remote next command")
        goToNext()
    }
    
    private func handlePreviousTrack() {
        guard isActiveInstance else { return }
        print("[PlaylistControlModule] ⏮️ Remote previous command")
        goToPrevious()
    }
    
    // MARK: - Navigation
    
    private func goToNext() {
        let nextIndex = getNextIndex()
        
        if nextIndex == -1 {
            // Playlist ended
            isPlaybackActive = false
            sendEvent(
                withName: "onNativePlaylistEnded",
                body: ["timestamp": Date().timeIntervalSince1970 * 1000]
            )
            return
        }
        
        goToIndex(nextIndex)
    }
    
    private func goToPrevious() {
        let previousIndex = getPreviousIndex()
        
        if previousIndex == -1 {
            // No previous item
            return
        }
        
        goToIndex(previousIndex)
    }
    
    private func handleAutoNext() {
        if config.autoNext {
            goToNext()
        }
    }
    
    private func getNextIndex() -> Int {
        if playlist.isEmpty { return -1 }
        
        // Repeat ONE mode
        if config.repeatMode == .one {
            return currentIndex
        }
        
        let next = currentIndex + 1
        
        // Check if we're at the end
        if next >= playlist.count {
            // Repeat ALL mode
            return config.repeatMode == .all ? 0 : -1
        }
        
        return next
    }
    
    private func getPreviousIndex() -> Int {
        if playlist.isEmpty { return -1 }
        
        let previous = currentIndex - 1
        
        // Check if we're at the beginning
        if previous < 0 {
            // Repeat ALL mode - go to end
            return config.repeatMode == .all ? playlist.count - 1 : -1
        }
        
        return previous
    }
    
    // MARK: - Time Updates
    
    private func handleTimeUpdate(time: CMTime) {
        guard let duration = player?.currentItem?.duration.seconds,
              !duration.isNaN,
              !duration.isInfinite,
              duration > 0 else {
            return
        }
        
        let currentTime = time.seconds
        guard !currentTime.isNaN else { return }
        
        let percentage = (currentTime / duration) * 100.0
        
        sendEvent(
            withName: "onNativeProgressUpdate",
            body: [
                "progress": [
                    "itemId": getCurrentItem()?.id ?? "",
                    "position": currentTime,
                    "duration": duration,
                    "percentage": percentage,
                    "timestamp": Date().timeIntervalSince1970 * 1000
                ],
                "item": getCurrentItemDict(),
                "index": currentIndex
            ]
        )
        
        // Update Now Playing elapsed time
        if var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo {
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
    }
    
    // MARK: - Error Handling
    
    private func handleItemError(error: Error) {
        guard let item = getCurrentItem() else { return }
        emitItemError(item: item, error: error.localizedDescription)
        
        if config.skipOnError {
            handleAutoNext()
        }
    }
    
    private func emitItemError(item: PlaylistItem, error: String) {
        sendEvent(
            withName: "onNativeItemError",
            body: [
                "itemId": item.id,
                "index": currentIndex,
                "errorCode": "PLAYBACK_ERROR",
                "errorMessage": error,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
        )
    }
    
    // MARK: - Helper Methods
    
    private func getCurrentItem() -> PlaylistItem? {
        guard currentIndex >= 0 && currentIndex < playlist.count else {
            return nil
        }
        return playlist[currentIndex]
    }
    
    private func getCurrentItemDict() -> [String: Any] {
        guard let item = getCurrentItem() else {
            return [:]
        }
        return item.toDict()
    }
    
    private func cleanup() {
        removePlayerObservers()
        player?.pause()
        player = nil
        isPlaybackActive = false
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

// MARK: - Data Structures

private struct PlaylistItem {
    let id: String
    let source: PlaylistVideoSource
    let metadata: PlaylistVideoMetadata
    let type: String
    let startPosition: Double?
    let duration: Double?
    
    init?(dict: [String: Any]) {
        guard let id = dict["id"] as? String else {
            print("[PlaylistItem] ❌ Missing required field: id")
            return nil
        }
        
        // Parse source - support both new resolvedSources and legacy source
        var sourceDict: [String: Any]?
        
        // Try new structure: resolvedSources
        if let resolvedSources = dict["resolvedSources"] as? [String: Any] {
            // Priority: local > cast > download
            if let local = resolvedSources["local"] as? [String: Any], local["uri"] != nil {
                sourceDict = local
            } else if let cast = resolvedSources["cast"] as? [String: Any], cast["uri"] != nil {
                sourceDict = cast
            } else if let download = resolvedSources["download"] as? [String: Any], download["uri"] != nil {
                sourceDict = download
            }
            
            if sourceDict == nil {
                print("[PlaylistItem] ❌ resolvedSources present but no valid source found for item: \(id)")
                return nil
            }
        }
        // Legacy structure: direct source object
        else if let legacySource = dict["source"] as? [String: Any] {
            sourceDict = legacySource
        }
        
        guard let finalSourceDict = sourceDict else {
            print("[PlaylistItem] ❌ No valid source structure found for item: \(id)")
            return nil
        }
        
        guard let metadataDict = dict["metadata"] as? [String: Any] else {
            print("[PlaylistItem] ❌ Missing metadata for item: \(id)")
            return nil
        }
        
        self.id = id
        self.source = PlaylistVideoSource(finalSourceDict)
        self.metadata = PlaylistVideoMetadata(metadataDict)
        self.type = dict["type"] as? String ?? "VIDEO"
        
        // Parse initialState if present
        let initialState = dict["initialState"] as? [String: Any]
        self.startPosition = dict["startPosition"] as? Double ?? initialState?["startPosition"] as? Double
        self.duration = dict["duration"] as? Double ?? initialState?["duration"] as? Double
        
        print("[PlaylistItem] ✅ Successfully parsed item: \(id) (\(self.source.uri))")
    }
    
    func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "source": source.toDict(),
            "metadata": metadata.toDict(),
            "type": type
        ]
        
        if let startPosition = startPosition {
            dict["startPosition"] = startPosition
        }
        
        if let duration = duration {
            dict["duration"] = duration
        }
        
        return dict
    }
}

private struct PlaylistVideoSource {
    let uri: String
    let headers: [String: String]?
    
    init(_ dict: [String: Any]) {
        self.uri = dict["uri"] as? String ?? ""
        self.headers = dict["headers"] as? [String: String]
    }
    
    func toDict() -> [String: Any] {
        var dict: [String: Any] = ["uri": uri]
        if let headers = headers {
            dict["headers"] = headers
        }
        return dict
    }
}

private struct PlaylistVideoMetadata {
    let title: String?
    let artist: String?
    let album: String?
    let imageUri: String?
    let description: String?
    
    init(_ dict: [String: Any]) {
        self.title = dict["title"] as? String
        self.artist = dict["artist"] as? String
        self.album = dict["album"] as? String
        // Support both 'poster' (new) and 'imageUri' (legacy)
        self.imageUri = dict["poster"] as? String ?? dict["imageUri"] as? String
        self.description = dict["description"] as? String
    }
    
    func toDict() -> [String: Any] {
        var dict: [String: Any] = [:]
        if let title = title { dict["title"] = title }
        if let artist = artist { dict["artist"] = artist }
        if let album = album { dict["album"] = album }
        if let imageUri = imageUri { dict["imageUri"] = imageUri }
        if let description = description { dict["description"] = description }
        return dict
    }
}

private struct PlaylistConfiguration {
    var autoNext: Bool = true
    var repeatMode: PlaylistRepeatMode = .off
    var shuffleMode: PlaylistShuffleMode = .off
    var skipOnError: Bool = true
    
    init() {}
    
    init(dict: [String: Any]) {
        self.autoNext = dict["autoNext"] as? Bool ?? true
        self.skipOnError = dict["skipOnError"] as? Bool ?? true
        
        if let repeatModeStr = dict["repeatMode"] as? String {
            self.repeatMode = PlaylistRepeatMode(rawValue: repeatModeStr) ?? .off
        }
        
        if let shuffleModeStr = dict["shuffleMode"] as? String {
            self.shuffleMode = PlaylistShuffleMode(rawValue: shuffleModeStr) ?? .off
        }
    }
}

private enum PlaylistRepeatMode: String {
    case off = "OFF"
    case all = "ALL"
    case one = "ONE"
}

private enum PlaylistShuffleMode: String {
    case off = "OFF"
    case on = "ON"
}
