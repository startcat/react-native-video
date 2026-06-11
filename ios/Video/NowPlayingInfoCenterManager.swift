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
    // PLAYER-268: skip-to-next/previous transport command targets.
    private var nextTrackTarget: Any?
    private var previousTrackTarget: Any?

    private let remoteCommandCenter = MPRemoteCommandCenter.shared()

    /// PLAYER-299: estado de reproducción previo a una interrupción del sistema
    /// (Siri, llamada, aviso de navegación) para decidir si reanudamos al terminar.
    private var wasPlayingBeforeInterruption = false
    private var interruptionObserver: NSObjectProtocol?

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

    private init() {
        // PLAYER-299: sin observer de interrupciones, una interrupción del sistema
        // (Siri, llamada de teléfono, aviso del navegador del coche) pausa el AVPlayer
        // y NADIE lo reanuda al terminar: "la reproducción se corta sola".
        // RNTP hacía este trabajo antes de la migración; ahora es responsabilidad nuestra.
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleAudioSessionInterruption(notification)
        }
    }

    deinit {
        cleanup()
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
    }

    /// PLAYER-299: manejar interrupciones de la sesión de audio (patrón estándar de AVAudioSession).
    private func handleAudioSessionInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            wasPlayingBeforeInterruption = (currentPlayer?.rate ?? 0) > 0
            debugPrint("[NowPlayingInfoCenter] 🔇 Interruption began (wasPlaying: \(wasPlayingBeforeInterruption))")
            // Reflejar el estado real (pausado por el sistema) en CarPlay / lock screen.
            updateNowPlayingInfo()
        case .ended:
            let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            debugPrint("[NowPlayingInfoCenter] 🔈 Interruption ended (shouldResume: \(options.contains(.shouldResume)), wasPlaying: \(wasPlayingBeforeInterruption))")
            if options.contains(.shouldResume), wasPlayingBeforeInterruption, let player = currentPlayer {
                try? AVAudioSession.sharedInstance().setActive(true)
                player.play()
            }
            wasPlayingBeforeInterruption = false
            updateNowPlayingInfo()
        @unknown default:
            break
        }
    }

    func registerPlayer(player: AVPlayer) {
        if players.contains(player) {
            // PLAYER-298: re-registro del mismo player (p.ej. tras handlePlaybackFailed()
            // + nuevo setSrc). Si nos quedamos sin currentPlayer, re-adoptarlo para que
            // los command targets y el Now Playing vuelvan a estar vivos.
            if currentPlayer == nil {
                setCurrentPlayer(player: player)
            }
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
            // PLAYER-298: si queda otro player activo, adoptarlo (re-registra los
            // command targets); si no, el update inferior es un no-op transitorio
            // y cleanup() hará el teardown real cuando no queden players.
            findNewCurrentPlayer()
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
    
    /**
     * Pausa el player actual desde código nativo
     * Útil para pausar desde background (ej: Sleep Timer)
     */
    func pauseCurrentPlayer() {
        guard let player = currentPlayer else {
            debugPrint("[NowPlayingInfoCenter] ⚠️ pauseCurrentPlayer called but no current player")
            return
        }
        
        debugPrint("[NowPlayingInfoCenter] ⏸️ Pausing current player (rate: \(player.rate))")
        if player.rate != 0 {
            player.pause()
            debugPrint("[NowPlayingInfoCenter] ✓ Player paused successfully")
        } else {
            debugPrint("[NowPlayingInfoCenter] ℹ️ Player already paused")
        }
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
            player.seek(to: newTime) { [weak self] _ in
                // PLAYER-298: re-publicar elapsed tras el seek para que la barra salte ya.
                self?.updateNowPlayingInfo()
            }
            return .success
        }

        skipForwardTarget = remoteCommandCenter.skipForwardCommand.addTarget { [weak self] _ in
            guard let self, let player = self.currentPlayer else {
                return .commandFailed
            }

            let newTime = player.currentTime() + CMTime(seconds: self.SEEK_INTERVAL_SECONDS, preferredTimescale: .max)
            player.seek(to: newTime) { [weak self] _ in
                // PLAYER-298: re-publicar elapsed tras el seek para que la barra salte ya.
                self?.updateNowPlayingInfo()
            }
            return .success
        }

        playbackPositionTarget = remoteCommandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let player = self.currentPlayer else {
                return .commandFailed
            }
            if let event = event as? MPChangePlaybackPositionCommandEvent {
                player.seek(to: CMTime(seconds: event.positionTime, preferredTimescale: .max)) { [weak self] _ in
                    // PLAYER-298: re-publicar elapsed tras el seek (barra de CarPlay).
                    self?.updateNowPlayingInfo()
                }
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

        // PLAYER-268: register skip-to-next/previous transport commands.
        // Routes to the active PlaylistControlModule's coordinated next/previous (emit-to-JS path).
        // NowPlayingInfoCenterManager is the single command-center owner for the coordinated <Video>
        // player — mirroring how it owns play/pause/seek above.
        nextTrackTarget = remoteCommandCenter.nextTrackCommand.addTarget { _ in
            debugPrint("[NowPlayingInfoCenter] ⏭️ NEXT TRACK command received")
            guard let module = PlaylistControlModule.activeInstance else {
                debugPrint("[NowPlayingInfoCenter] ❌ NEXT TRACK failed - no active PlaylistControlModule")
                return .commandFailed
            }
            module.handleRemoteNextCommand()
            return .success
        }

        previousTrackTarget = remoteCommandCenter.previousTrackCommand.addTarget { _ in
            debugPrint("[NowPlayingInfoCenter] ⏮️ PREVIOUS TRACK command received")
            guard let module = PlaylistControlModule.activeInstance else {
                debugPrint("[NowPlayingInfoCenter] ❌ PREVIOUS TRACK failed - no active PlaylistControlModule")
                return .commandFailed
            }
            module.handleRemotePreviousCommand()
            return .success
        }

        ensureRemoteCommandsEnabled()
    }

    /// PLAYER-298: re-afirmar el estado `isEnabled` de los remote commands que poseemos.
    /// react-native-carplay (`setupRemoteCommandCenter`) deshabilita
    /// `changePlaybackPositionCommand` al crear su NowPlayingTemplate, lo que mata la
    /// seek bar de CarPlay aunque tengamos handler registrado. NO tocamos
    /// skipForward/skipBackward a propósito: su estado decide qué botones muestra
    /// CarPlay (skip-intervals vs next/previous) y GUAU quiere next/previous.
    public func ensureRemoteCommandsEnabled(allowSeek: Bool = true) {
        remoteCommandCenter.playCommand.isEnabled = true
        remoteCommandCenter.pauseCommand.isEnabled = true
        remoteCommandCenter.togglePlayPauseCommand.isEnabled = true
        remoteCommandCenter.nextTrackCommand.isEnabled = true
        remoteCommandCenter.previousTrackCommand.isEnabled = true
        remoteCommandCenter.changePlaybackPositionCommand.isEnabled = allowSeek
    }

    private func invalidateCommandTargets() {
        remoteCommandCenter.playCommand.removeTarget(playTarget)
        remoteCommandCenter.pauseCommand.removeTarget(pauseTarget)
        remoteCommandCenter.skipForwardCommand.removeTarget(skipForwardTarget)
        remoteCommandCenter.skipBackwardCommand.removeTarget(skipBackwardTarget)
        remoteCommandCenter.changePlaybackPositionCommand.removeTarget(playbackPositionTarget)
        remoteCommandCenter.togglePlayPauseCommand.removeTarget(togglePlayPauseTarget)
        // PLAYER-268: remove skip transport targets.
        remoteCommandCenter.nextTrackCommand.removeTarget(nextTrackTarget)
        remoteCommandCenter.previousTrackCommand.removeTarget(previousTrackTarget)
    }

    public func updateNowPlayingInfo() {
        debugPrint("[NowPlayingInfoCenter] 🔄 updateNowPlayingInfo called")
        guard let player = currentPlayer, let currentItem = player.currentItem else {
            // PLAYER-298: NO invalidar los command targets ni vaciar nowPlayingInfo aquí.
            // Este estado puede ser transitorio (p.ej. replaceCurrentItem(with: nil)
            // durante un cambio de source). Invalidar aquí mataba seek/play/pause de
            // CarPlay para siempre, porque registerCommandTargets() solo se re-ejecuta
            // al cambiar de player. El teardown real lo hace cleanup() cuando no
            // quedan players registrados.
            debugPrint("[NowPlayingInfoCenter] ⚠️ No player or currentItem - skipping update (transient)")
            return
        }

        // PLAYER-298: distinguir "no listo" (duration invalid) de "directo" (duration
        // indefinite). El guard anterior descartaba también los directos, así que para
        // radio en vivo nunca se publicaba metadata desde aquí.
        let isLiveStream = CMTIME_IS_INDEFINITE(currentItem.duration)
        let durationSeconds = currentItem.duration.seconds
        if !isLiveStream, durationSeconds.isNaN || durationSeconds <= 0 {
            debugPrint("[NowPlayingInfoCenter] ⚠️ Player not ready (duration: \(durationSeconds)) - skipping update")
            return
        }

        debugPrint("[NowPlayingInfoCenter] Player rate: \(player.rate), duration: \(durationSeconds), live: \(isLiveStream)")

        // Use only externalMetadata to avoid blocking on commonMetadata load
        // externalMetadata is set by RCTVideo and is immediately available
        let metadata = currentItem.externalMetadata

        let titleItem = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierTitle).first?.stringValue ?? ""

        let artistItem = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierArtist).first?.stringValue ?? ""

        // PLAYER-272: only build MPMediaItemArtwork when there is real, decodable artwork.
        // The previous workaround fed an empty UIImage() (zero boundsSize) into
        // MPMediaItemArtwork — the documented crash-when-artwork-unset hazard on this hot
        // metadata path. When absent we omit the key entirely and drop any stale artwork
        // from the previous item after the merge below.
        let imgData = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .commonIdentifierArtwork).first?.dataValue
        let artworkImage = imgData.flatMap { UIImage(data: $0) }

        // PLAYER-298: publicar el rate REAL distinguiendo pausa de buffering vía
        // timeControlStatus. El antiguo "rate 0 → 1.0" hacía imposible reflejar la
        // pausa en CarPlay/lock screen, y un rate falso descoloca la barra de progreso
        // (el sistema extrapola elapsed con el rate publicado).
        let playbackRate: Double
        switch player.timeControlStatus {
        case .paused:
            playbackRate = 0.0
            debugPrint("[NowPlayingInfoCenter] ⏸️ timeControlStatus .paused → rate 0")
        case .waitingToPlayAtSpecifiedRate:
            // Buffering con intención de reproducir: publicar 1.0 evita que el sistema
            // muestre "pausado" durante stalls breves (intención original del workaround).
            playbackRate = 1.0
            debugPrint("[NowPlayingInfoCenter] ⏳ timeControlStatus .waiting → rate 1.0")
        case .playing:
            playbackRate = Double(player.rate)
            debugPrint("[NowPlayingInfoCenter] ✅ timeControlStatus .playing → rate \(player.rate)")
        @unknown default:
            playbackRate = Double(player.rate)
        }

        var newNowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: titleItem,
            MPMediaItemPropertyArtist: artistItem,
            MPNowPlayingInfoPropertyPlaybackRate: playbackRate,
            MPNowPlayingInfoPropertyIsLiveStream: isLiveStream,
        ]
        if !isLiveStream {
            newNowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = durationSeconds
            newNowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentItem.currentTime().seconds.rounded()
        }
        if let artworkImage = artworkImage, artworkImage.size.width > 0, artworkImage.size.height > 0 {
            newNowPlayingInfo[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: artworkImage.size) { _ in artworkImage }
        }
        let currentNowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]

        debugPrint("[NowPlayingInfoCenter] 📤 Updating Now Playing - rate: \(player.rate), title: \(titleItem)")
        var mergedNowPlayingInfo = currentNowPlayingInfo.merging(newNowPlayingInfo) { _, new in new }
        if newNowPlayingInfo[MPMediaItemPropertyArtwork] == nil {
            // No artwork on this item: drop any stale artwork carried over from the merge.
            mergedNowPlayingInfo.removeValue(forKey: MPMediaItemPropertyArtwork)
        }
        if isLiveStream {
            // Directo: retirar claves VOD heredadas del item anterior tras el merge.
            mergedNowPlayingInfo.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
            mergedNowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyElapsedPlaybackTime)
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = mergedNowPlayingInfo

        // PLAYER-298: re-afirmar comandos en cada update; react-native-carplay los
        // deshabilita al crear el NowPlayingTemplate (ver ensureRemoteCommandsEnabled).
        // En directo la seek bar no aplica.
        ensureRemoteCommandsEnabled(allowSeek: !isLiveStream)
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

            // PLAYER-298: propagar los cambios de rate (play/pausa/velocidad) del player
            // actual a MPNowPlayingInfoCenter. Sin esto el estado de reproducción y la
            // barra de progreso de CarPlay/lock screen se quedan congelados: nadie
            // publicaba rate/elapsed al pausar o reanudar.
            if self.currentPlayer == player {
                self.updateNowPlayingInfo()
            }
        }
    }
}
