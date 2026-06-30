//
//  RNVDrmDebugLog.swift
//  react-native-video
//
//  PLAYER-361/370/352 device observability. Appends to the SAME Documents/drm-debug.log the @overon
//  DRM module writes, so one container extract shows the module's write-side (download) AND read-side
//  (offline-playback serve) plus RNV's offline source resolution (Method 3). DEBUG + physical device
//  only. Relocated here from the now-deleted ContentKeyManager.swift (PLAYER-352 Phase 2).
//

import Foundation

func ckmDebugLog(_ message: String) {
    #if DEBUG && !targetEnvironment(simulator)
    guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let logURL = documents.appendingPathComponent("drm-debug.log")
    let line = "[\(ISO8601DateFormatter().string(from: Date()))] [RNV-ContentKeyManager] \(message)\n"
    guard let data = line.data(using: .utf8) else { return }
    if let h = try? FileHandle(forWritingTo: logURL) { defer { try? h.close() }; h.seekToEndOfFile(); h.write(data) }
    else { try? data.write(to: logURL, options: .atomic) }
    #endif
}
