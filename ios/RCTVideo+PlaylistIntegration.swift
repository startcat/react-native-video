/*
 * RCTVideo+PlaylistIntegration.swift
 *
 * Extensión de RCTVideo para integración con PlaylistControlModule
 * Define las notificaciones utilizadas para comunicación nativa
 *
 * NOTA: Los métodos y propiedades de playlist están implementados directamente en RCTVideo.swift
 */

import Foundation

// MARK: - Notification Names Extension

extension Notification.Name {
    static let RCTVideoItemDidFinish = Notification.Name("RCTVideoItemDidFinish")
    static let PlaylistLoadNextSource = Notification.Name("PlaylistLoadNextSource")
}
