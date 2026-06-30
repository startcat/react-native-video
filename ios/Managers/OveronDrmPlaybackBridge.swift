//
//  OveronDrmPlaybackBridge.swift
//  react-native-video
//
//  PLAYER-352 (Phase 2): routes offline FairPlay PLAYBACK through the @overon DRM module's
//  AVContentKeySession. RNV no longer owns a ContentKeyManager — the module serves the persisted
//  FairPlayKeys/<contentId>.key. The module is reached REFLECTIVELY via the RN bridge (no podspec
//  dependency on OveronPlayerDrm): matches the Android OveronOfflineDrmBridge / now-playing pattern,
//  avoids pinning a drm version inside this team-released fork, and degrades gracefully (returns
//  false) if the module is absent.
//
//  Module seams used (native-only @objc on OveronPlayerDrmModule, no JS bridge):
//    - registerOfflinePlaybackContext: (selector "registerOfflinePlaybackContext:")
//    - addContentKeyRecipient:        (selector "addContentKeyRecipient:")
//

import AVFoundation
import React

enum OveronDrmPlaybackBridge {

    /// Registers an offline-playback context on the @overon DRM module and attaches `asset` to its
    /// FairPlay session, so the module serves the persisted key for offline playback (no network).
    /// Returns true if the module was reached and both seams were dispatched.
    @discardableResult
    static func routeOfflinePlayback(asset: AVURLAsset, contentId: String) -> Bool {
        guard let bridge = RCTBridge.current() else {
            ckmDebugLog("[OveronDrmPlaybackBridge] no RCTBridge.current() — cannot route offline FairPlay contentId=\(contentId)")
            return false
        }
        guard let drm = bridge.module(forName: "OveronPlayerDrm", lazilyLoadIfNecessary: true) as? NSObject else {
            ckmDebugLog("[OveronDrmPlaybackBridge] OveronPlayerDrm module not found — cannot route offline FairPlay contentId=\(contentId)")
            return false
        }
        let registerSel = NSSelectorFromString("registerOfflinePlaybackContext:")
        let addSel = NSSelectorFromString("addContentKeyRecipient:")
        guard drm.responds(to: registerSel), drm.responds(to: addSel) else {
            ckmDebugLog("[OveronDrmPlaybackBridge] OveronPlayerDrm missing seams register=\(drm.responds(to: registerSel)) add=\(drm.responds(to: addSel)) contentId=\(contentId)")
            return false
        }
        // Order matters: register the serve context BEFORE attaching the asset, so the key request the
        // attached asset triggers binds (FIFO) to this offline-playback context.
        _ = drm.perform(registerSel, with: contentId)
        _ = drm.perform(addSel, with: asset)
        ckmDebugLog("[OveronDrmPlaybackBridge] routed offline FairPlay to @overon DRM module contentId=\(contentId)")
        return true
    }

    /// PLAYER-352 (Phase 3): registers the ONLINE streaming DRM context on the @overon DRM module and
    /// attaches the streaming `asset` to its FairPlay session, so the module does SPC/CKC over the
    /// network and responds streaming (no persist). Replaces RNV's resource-loader DRM. Returns true
    /// if the module was reached and both seams were dispatched.
    @discardableResult
    static func routeOnlinePlayback(asset: AVURLAsset, drm: DRMParams) -> Bool {
        guard let bridge = RCTBridge.current() else {
            ckmDebugLog("[OveronDrmPlaybackBridge] no RCTBridge.current() — cannot route online FairPlay")
            return false
        }
        guard let drmModule = bridge.module(forName: "OveronPlayerDrm", lazilyLoadIfNecessary: true) as? NSObject else {
            ckmDebugLog("[OveronDrmPlaybackBridge] OveronPlayerDrm module not found — cannot route online FairPlay")
            return false
        }
        let registerSel = NSSelectorFromString("registerOnlineLicenseContext:")
        let addSel = NSSelectorFromString("addContentKeyRecipient:")
        guard drmModule.responds(to: registerSel), drmModule.responds(to: addSel) else {
            ckmDebugLog("[OveronDrmPlaybackBridge] OveronPlayerDrm missing online seams register=\(drmModule.responds(to: registerSel)) add=\(drmModule.responds(to: addSel))")
            return false
        }
        // Build the config matching the EITB/Axinom online contract preserved from RCTVideoDRM:
        // raw SPC body + empty `X-AxDRM-Message` header (the module sends the headers it is given).
        var headers: [String: String] = [:]
        if let raw = drm.headers {
            for (k, v) in raw { if let s = v as? String { headers[k] = s } }
        }
        headers["X-AxDRM-Message"] = ""
        var config: [String: Any] = ["headers": headers]
        if let contentId = drm.contentId { config["contentId"] = contentId }
        if let certificateUrl = drm.certificateUrl { config["certificateUrl"] = certificateUrl }
        if let licenseServer = drm.licenseServer { config["licenseServerUrl"] = licenseServer }
        _ = drmModule.perform(registerSel, with: config)
        _ = drmModule.perform(addSel, with: asset)
        ckmDebugLog("[OveronDrmPlaybackBridge] routed ONLINE FairPlay to @overon DRM module contentId=\(drm.contentId ?? "<skd>")")
        return true
    }
}
