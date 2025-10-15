import Foundation
import MediaPlayer

class NowPlayingInfoCenterManager {
    static let shared = NowPlayingInfoCenterManager()

    private let SEEK_INTERVAL_SECONDS: Double = 10

    private weak var currentPlayer: AVPlayer?
    private var players = NSHashTable<AVPlayer>.weakObjects()

    private var observers: [Int: NSKeyValueObservation] = [:]
    private var playbackObserver: Any?

    private var playTarget: Any?
    private var pauseTarget: Any?
    private var skipForwardTarget: Any?
    private var skipBackwardTarget: Any?
    private var playbackPositionTarget: Any?
    private var seekTarget: Any?
    private var togglePlayPauseTarget: Any?

    private let remoteCommandCenter = MPRemoteCommandCenter.shared()

    private var receivingRemoveControlEvents = false {
        didSet {
            if receivingRemoveControlEvents {
                try? AVAudioSession.sharedInstance().setCategory(.playback)
                try? AVAudioSession.sharedInstance().setActive(true)
                UIApplication.shared.beginReceivingRemoteControlEvents()
            } else {
                UIApplication.shared.endReceivingRemoteControlEvents()
            }
        }
    }

    deinit {
        cleanup()
    }

    func registerPlayer(player: AVPlayer) {
        if players.contains(player) {
            return
        }

        if receivingRemoveControlEvents == false {
            receivingRemoveControlEvents = true
        }

        if let oldObserver = observers[player.hashValue] {
            oldObserver.invalidate()
        }

        observers[player.hashValue] = observePlayers(player: player)
        players.add(player)

        if currentPlayer == nil {
            setCurrentPlayer(player: player)
        }
    }

    func removePlayer(player: AVPlayer) {
        if !players.contains(player) {
            return
        }

        if let observer = observers[player.hashValue] {
            observer.invalidate()
        }

        observers.removeValue(forKey: player.hashValue)
        players.remove(player)

        if currentPlayer == player {
            currentPlayer = nil
            updateNowPlayingInfo()
        }

        if players.allObjects.isEmpty {
            cleanup()
        }
    }

    public func cleanup() {
        observers.removeAll()
        players.removeAllObjects()

        if let playbackObserver {
            currentPlayer?.removeTimeObserver(playbackObserver)
        }

        invalidateCommandTargets()

        MPNowPlayingInfoCenter.default().nowPlayingInfo = [:]
        receivingRemoveControlEvents = false
    }

    private func setCurrentPlayer(player: AVPlayer) {
        if player == currentPlayer {
            return
        }

        if let playbackObserver {
            currentPlayer?.removeTimeObserver(playbackObserver)
        }

        currentPlayer = player
        registerCommandTargets()

        // NOTE: We don't set up periodic updates here because RCTVideo handles
        // Now Playing Info updates via updateNowPlayingElapsedTime()
        // Setting up periodic updates here can cause conflicts and pause the player
        // when the rate is temporarily 0 during buffering
        debugPrint("[NowPlayingInfoCenter] 🎯 Current player set - NOT setting up periodic observer (handled by RCTVideo)")
        updateNowPlayingInfo()
        
        // DISABLED: Periodic observer causes issues with background playback
        // playbackObserver = player.addPeriodicTimeObserver(
        //     forInterval: CMTime(value: 1, timescale: 4),
        //     queue: .global(),
        //     using: { [weak self] _ in
        //         self?.updateNowPlayingInfo()
        //     }
        // )
    }

    private func registerCommandTargets() {
        invalidateCommandTargets()

        playTarget = remoteCommandCenter.playCommand.addTarget { [weak self] _ in
            debugPrint("[NowPlayingInfoCenter] ▶️ PLAY command received")
            guard let self, let player = self.currentPlayer else {
                debugPrint("[NowPlayingInfoCenter] ❌ PLAY command failed - no player")
                return .commandFailed
            }

            debugPrint("[NowPlayingInfoCenter] Player rate before PLAY: \(player.rate)")
            if player.rate == 0 {
                player.play()
                debugPrint("[NowPlayingInfoCenter] ✓ Player.play() called - new rate: \(player.rate)")
            } else {
                debugPrint("[NowPlayingInfoCenter] ℹ️ Player already playing")
            }

            return .success
        }

        pauseTarget = remoteCommandCenter.pauseCommand.addTarget { [weak self] _ in
            debugPrint("[NowPlayingInfoCenter] ⏸️ PAUSE command received")
            guard let self, let player = self.currentPlayer else {
                debugPrint("[NowPlayingInfoCenter] ❌ PAUSE command failed - no player")
                return .commandFailed
            }

            debugPrint("[NowPlayingInfoCenter] Player rate before PAUSE: \(player.rate)")
            if player.rate != 0 {
                player.pause()
                debugPrint("[NowPlayingInfoCenter] ✓ Player.pause() called - new rate: \(player.rate)")
            } else {
                debugPrint("[NowPlayingInfoCenter] ℹ️ Player already paused")
            }

            return .success
        }

        skipBackwardTarget = remoteCommandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self, let player = self.currentPlayer else {
                return .commandFailed
            }
            let newTime = player.currentTime() - CMTime(seconds: self.SEEK_INTERVAL_SECONDS, preferredTimescale: .max)
            player.seek(to: newTime)
            return .success
        }

        skipForwardTarget = remoteCommandCenter.skipForwardCommand.addTarget { [weak self] _ in
            guard let self, let player = self.currentPlayer else {
                return .commandFailed
            }

            let newTime = player.currentTime() + CMTime(seconds: self.SEEK_INTERVAL_SECONDS, preferredTimescale: .max)
            player.seek(to: newTime)
            return .success
        }

        playbackPositionTarget = remoteCommandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let player = self.currentPlayer else {
                return .commandFailed
            }
            if let event = event as? MPChangePlaybackPositionCommandEvent {
                player.seek(to: CMTime(seconds: event.positionTime, preferredTimescale: .max))
                return .success
            }
            return .commandFailed
        }

        // Handler for togglePlayPauseCommand, sent by Apple's Earpods wired headphones
        togglePlayPauseTarget = remoteCommandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            debugPrint("[NowPlayingInfoCenter] 🔄 TOGGLE PLAY/PAUSE command received")
            guard let self, let player = self.currentPlayer else {
                debugPrint("[NowPlayingInfoCenter] ❌ TOGGLE command failed - no player")
                return .commandFailed
            }

            debugPrint("[NowPlayingInfoCenter] Player rate before TOGGLE: \(player.rate)")
            if player.rate == 0 {
                player.play()
                debugPrint("[NowPlayingInfoCenter] ✓ Toggled to PLAY - new rate: \(player.rate)")
            } else {
                player.pause()
                debugPrint("[NowPlayingInfoCenter] ✓ Toggled to PAUSE - new rate: \(player.rate)")
            }

            return .success
        }
    }

    private func invalidateCommandTargets() {
        remoteCommandCenter.playCommand.removeTarget(playTarget)
        remoteCommandCenter.pauseCommand.removeTarget(pauseTarget)
        remoteCommandCenter.skipForwardCommand.removeTarget(skipForwardTarget)
        remoteCommandCenter.skipBackwardCommand.removeTarget(skipBackwardTarget)
        remoteCommandCenter.changePlaybackPositionCommand.removeTarget(playbackPositionTarget)
        remoteCommandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseTarget)
    }

    public func updateNowPlayingInfo() {
        debugPrint("[NowPlayingInfoCenter] 🔄 updateNowPlayingInfo called")
        guard let player = currentPlayer, let currentItem = player.currentItem else {
            debugPrint("[NowPlayingInfoCenter] ⚠️ No player or currentItem - clearing Now Playing Info")
            invalidateCommandTargets()
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [:]
            return
        }
        
        // Don't update if player is not ready (duration is invalid)
        if currentItem.duration.seconds.isNaN || currentItem.duration.seconds <= 0 {
            debugPrint("[NowPlayingInfoCenter] ⚠️ Player not ready (duration: \(currentItem.duration.seconds)) - skipping update")
            return
        }
        
        debugPrint("[NowPlayingInfoCenter] Player rate: \(player.rate), duration: \(currentItem.duration.seconds)")

        // Use only externalMetadata to avoid blocking on commonMetadata load
        // externalMetadata is set by RCTVideo and is immediately available
        let metadata = currentItem.externalMetadata

        let titleItem = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierTitle).first?.stringValue ?? ""

        let artistItem = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierArtist).first?.stringValue ?? ""

        // I have some issue with this - setting artworkItem when it not set dont return nil but also is crashing application
        // this is very hacky workaround for it
        let imgData = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierArtwork).first?.dataValue
        let image = imgData.flatMap { UIImage(data: $0) } ?? UIImage()
        let artworkItem = MPMediaItemArtwork(boundsSize: image.size) { _ in image }

        // Determine playback rate - avoid setting to 0 during buffering as it can pause playback
        let playbackRate: Double
        if player.rate > 0 {
            playbackRate = Double(player.rate)
            debugPrint("[NowPlayingInfoCenter] ✅ Using actual player rate: \(player.rate)")
        } else {
            // Player rate is 0 - could be buffering or intentionally paused
            // Default to 1.0 to prevent system from pausing during buffering
            playbackRate = 1.0
            debugPrint("[NowPlayingInfoCenter] ⚠️ Player rate is 0 - using 1.0 to prevent system pause")
        }
        
        let newNowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: titleItem,
            MPMediaItemPropertyArtist: artistItem,
            MPMediaItemPropertyArtwork: artworkItem,
            MPMediaItemPropertyPlaybackDuration: currentItem.duration.seconds,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentItem.currentTime().seconds.rounded(),
            MPNowPlayingInfoPropertyPlaybackRate: playbackRate,
            MPNowPlayingInfoPropertyIsLiveStream: CMTIME_IS_INDEFINITE(currentItem.asset.duration),
        ]
        let currentNowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]

        debugPrint("[NowPlayingInfoCenter] 📤 Updating Now Playing - rate: \(player.rate), title: \(titleItem)")
        MPNowPlayingInfoCenter.default().nowPlayingInfo = currentNowPlayingInfo.merging(newNowPlayingInfo) { _, new in new }
        debugPrint("[NowPlayingInfoCenter] ✓ Now Playing Info updated")
    }

    private func findNewCurrentPlayer() {
        if let newPlayer = players.allObjects.first(where: {
            $0.rate != 0
        }) {
            setCurrentPlayer(player: newPlayer)
        }
    }

    // We will observe players rate to find last active player that info will be displayed
    private func observePlayers(player: AVPlayer) -> NSKeyValueObservation {
        return player.observe(\.rate) { [weak self] player, change in
            guard let self else { return }

            let rate = change.newValue
            debugPrint("[NowPlayingInfoCenter] 👀 Player rate changed to: \(rate ?? -1)")

            // case where there is new player that is not paused
            // In this case event is triggered by non currentPlayer
            if rate != 0 && self.currentPlayer != player {
                debugPrint("[NowPlayingInfoCenter] 🔄 New player started - switching current player")
                self.setCurrentPlayer(player: player)
                return
            }

            // case where currentPlayer was paused
            // In this case event is triggeret by currentPlayer
            if rate == 0 && self.currentPlayer == player {
                debugPrint("[NowPlayingInfoCenter] ⏸️ Current player paused - finding new current player")
                self.findNewCurrentPlayer()
            }
        }
    }
}
