import Foundation
import UIKit

/*
 * Puente entre RCTVideoComponentView (Fabric, ObjC++) y RCTVideo (Swift).
 *
 * El ComponentView no puede hablar con RCTVideo directamente: la clase Swift
 * no expone nombre ObjC estable. Este shim concentra las tres piezas:
 *   - aplicación de props por nombre (mismo contrato que Paper),
 *   - cableado de los bloques de evento hacia el event emitter de Fabric,
 *   - registro tag → vista para los métodos por reactTag de RCTVideoManager.
 *
 * Compila también en old-arch (no importa nada de Fabric); allí simplemente
 * nadie lo invoca, salvo el registro, que queda vacío.
 */
@objc(RNVideoFabricShim)
public class RNVideoFabricShim: NSObject {
    // Registro tag → RCTVideo (valores débiles; la vida la gobierna el ComponentView).
    private static let registry = NSMapTable<NSNumber, RCTVideo>.strongToWeakObjects()

    // MARK: - Ciclo de vida

    @objc public static func makeVideoView() -> UIView {
        return RCTVideo(eventDispatcher: nil)
    }

    @objc(tearDownVideoView:)
    public static func tearDownVideoView(_ view: UIView) {
        // removeFromSuperview de RCTVideo ejecuta el teardown completo
        // (player, AVPlayerViewController como child VC, observers).
        (view as? RCTVideo)?.removeFromSuperview()
    }

    // MARK: - Registro por reactTag

    @objc(registerVideoView:forTag:)
    public static func registerVideoView(_ view: UIView, forTag tag: Int) {
        guard let video = view as? RCTVideo else { return }
        registry.setObject(video, forKey: NSNumber(value: tag))
    }

    @objc(unregisterTag:)
    public static func unregisterTag(_ tag: Int) {
        registry.removeObject(forKey: NSNumber(value: tag))
    }

    static func videoView(forTag tag: NSNumber) -> RCTVideo? {
        return registry.object(forKey: tag)
    }

    // MARK: - Eventos

    @objc(wireEvents:handler:)
    public static func wireEvents(_ view: UIView, handler: @escaping (String, NSDictionary?) -> Void) {
        guard let video = view as? RCTVideo else { return }

        video.onVideoLoadStart = { handler("videoLoadStart", $0 as NSDictionary?) }
        video.onVideoLoad = { handler("videoLoad", $0 as NSDictionary?) }
        video.onVideoBuffer = { handler("videoBuffer", $0 as NSDictionary?) }
        video.onVideoError = { handler("videoError", $0 as NSDictionary?) }
        video.onVideoProgress = { handler("videoProgress", $0 as NSDictionary?) }
        video.onVideoBandwidthUpdate = { handler("videoBandwidthUpdate", $0 as NSDictionary?) }
        video.onVideoPlaybackMetrics = { handler("videoPlaybackMetrics", $0 as NSDictionary?) }
        video.onVideoSeek = { handler("videoSeek", $0 as NSDictionary?) }
        video.onVideoEnd = { handler("videoEnd", $0 as NSDictionary?) }
        video.onTimedMetadata = { handler("timedMetadata", $0 as NSDictionary?) }
        video.onVideoAudioBecomingNoisy = { handler("videoAudioBecomingNoisy", $0 as NSDictionary?) }
        video.onVideoFullscreenPlayerWillPresent = { handler("videoFullscreenPlayerWillPresent", $0 as NSDictionary?) }
        video.onVideoFullscreenPlayerDidPresent = { handler("videoFullscreenPlayerDidPresent", $0 as NSDictionary?) }
        video.onVideoFullscreenPlayerWillDismiss = { handler("videoFullscreenPlayerWillDismiss", $0 as NSDictionary?) }
        video.onVideoFullscreenPlayerDidDismiss = { handler("videoFullscreenPlayerDidDismiss", $0 as NSDictionary?) }
        video.onReadyForDisplay = { handler("readyForDisplay", $0 as NSDictionary?) }
        video.onPlaybackStalled = { handler("playbackStalled", $0 as NSDictionary?) }
        video.onPlaybackResume = { handler("playbackResume", $0 as NSDictionary?) }
        video.onPlaybackRateChange = { handler("playbackRateChange", $0 as NSDictionary?) }
        video.onVolumeChange = { handler("volumeChange", $0 as NSDictionary?) }
        video.onVideoPlaybackStateChanged = { handler("videoPlaybackStateChanged", $0 as NSDictionary?) }
        video.onVideoExternalPlaybackChange = { handler("videoExternalPlaybackChange", $0 as NSDictionary?) }
        video.onPictureInPictureStatusChanged = { handler("pictureInPictureStatusChanged", $0 as NSDictionary?) }
        video.onRestoreUserInterfaceForPictureInPictureStop = {
            handler("restoreUserInterfaceForPictureInPictureStop", $0 as NSDictionary?)
        }
        video.onReceiveAdEvent = { handler("receiveAdEvent", $0 as NSDictionary?) }
        video.onTextTracks = { handler("textTracks", $0 as NSDictionary?) }
        video.onAudioTracks = { handler("audioTracks", $0 as NSDictionary?) }
        video.onTextTrackDataChanged = { handler("textTrackDataChanged", $0 as NSDictionary?) }
    }

    // MARK: - Props

    // Orden de aplicación: el resto de props antes que drm/src (configurar antes
    // de cargar) y paused al final (decidir reproducción con todo aplicado).
    private static let deferredKeys = ["drm", "src", "paused"]

    @objc(applyProps:to:)
    public static func applyProps(_ props: NSDictionary, to view: UIView) {
        guard let video = view as? RCTVideo else { return }

        var deferred: [(String, Any)] = []
        for case let (key as String, value) in props {
            if deferredKeys.contains(key) {
                deferred.append((key, value))
                continue
            }
            apply(key, value, to: video)
        }
        for key in deferredKeys {
            if let entry = deferred.first(where: { $0.0 == key }) {
                apply(entry.0, entry.1, to: video)
            }
        }
    }

    // NSNull (prop retirada) se ignora: dejamos el estado actual de la vista,
    // igual de indeterminado que era en Paper y sin resets a mitad de reproducción.
    private static func apply(_ key: String, _ value: Any, to video: RCTVideo) {
        if value is NSNull { return }

        switch key {
        case "src":
            if let dict = value as? NSDictionary { video.setSrc(dict) }
        case "drm":
            if let dict = value as? NSDictionary { video.setDrm(dict) }
        case "playOffline":
            video.setPlayOffline(boolValue(value))
        case "adTagUrl":
            if let str = value as? String { video.setAdTagUrl(str) }
        case "adLanguage":
            if let str = value as? String { video.setAdLanguage(str) }
        case "maxBitRate":
            video.setMaxBitRate(floatValue(value))
        case "resizeMode":
            if let str = value as? String { video.setResizeMode(str) }
        case "repeat":
            video.setRepeat(boolValue(value))
        case "automaticallyWaitsToMinimizeStalling":
            video.setAutomaticallyWaitsToMinimizeStalling(boolValue(value))
        case "allowsExternalPlayback":
            video.setAllowsExternalPlayback(boolValue(value))
        case "textTracks":
            video.setTextTracks(value as? [NSDictionary])
        case "selectedTextTrack":
            video.setSelectedTextTrack(value as? NSDictionary)
        case "selectedAudioTrack":
            video.setSelectedAudioTrack(value as? NSDictionary)
        case "chapters":
            video.setChapters(value as? [NSDictionary])
        case "paused":
            video.setPaused(boolValue(value))
        case "muted":
            video.setMuted(boolValue(value))
        case "controls":
            video.setControls(boolValue(value))
        case "audioOutput":
            if let str = value as? String { video.setAudioOutput(str) }
        case "volume":
            video.setVolume(floatValue(value))
        case "playInBackground":
            video.setPlayInBackground(boolValue(value))
        case "preventsDisplaySleepDuringVideoPlayback":
            video.setPreventsDisplaySleepDuringVideoPlayback(boolValue(value))
        case "preferredForwardBufferDuration":
            video.setPreferredForwardBufferDuration(floatValue(value))
        case "playWhenInactive":
            video.setPlayWhenInactive(boolValue(value))
        case "pictureInPicture":
            video.setPictureInPicture(boolValue(value))
        case "enterPictureInPictureOnLeave":
            video.setEnterPictureInPictureOnLeave(boolValue(value))
        case "ignoreSilentSwitch":
            video.setIgnoreSilentSwitch(value as? String)
        case "mixWithOthers":
            video.setMixWithOthers(value as? String)
        case "rate":
            video.setRate(floatValue(value))
        case "fullscreen":
            video.setFullscreen(boolValue(value))
        case "fullscreenAutorotate":
            video.setFullscreenAutorotate(boolValue(value))
        case "fullscreenOrientation":
            video.setFullscreenOrientation(value as? String)
        case "filter":
            if let str = value as? String { video.setFilter(str) }
        case "filterEnabled":
            video.setFilterEnabled(boolValue(value))
        case "progressUpdateInterval":
            video.setProgressUpdateInterval(floatValue(value))
        case "restoreUserInterfaceForPIPStopCompletionHandler":
            video.setRestoreUserInterfaceForPIPStopCompletionHandler(boolValue(value))
        case "localSourceEncryptionKeyScheme":
            if let str = value as? String { video.setLocalSourceEncryptionKeyScheme(str) }
        case "subtitleStyle":
            if let dict = value as? [String: Any] { video.setSubtitleStyle(dict) }
        case "showNotificationControls":
            video.setShowNotificationControls(boolValue(value))
        default:
            // Props estándar de vista (las gestiona RCTViewComponentView) o
            // props solo-Android: nada que hacer aquí.
            break
        }
    }

    private static func boolValue(_ value: Any) -> Bool {
        return (value as? NSNumber)?.boolValue ?? false
    }

    private static func floatValue(_ value: Any) -> Float {
        return (value as? NSNumber)?.floatValue ?? 0
    }
}
