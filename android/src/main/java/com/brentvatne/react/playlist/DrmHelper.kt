package com.brentvatne.react.playlist

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.drm.DefaultDrmSessionManager
import androidx.media3.exoplayer.drm.DrmSessionManager
import androidx.media3.exoplayer.drm.FrameworkMediaDrm
import androidx.media3.exoplayer.drm.HttpMediaDrmCallback
import java.util.UUID

/**
 * Helper class for DRM configuration
 * Shared between ReactExoplayerView (coordinated mode) and PlaylistControlModule (standalone mode)
 */
object DrmHelper {
    private const val TAG = "DrmHelper"
    
    /**
     * DRM scheme UUIDs
     */
    private val WIDEVINE_UUID = C.WIDEVINE_UUID
    private val PLAYREADY_UUID = C.PLAYREADY_UUID
    private val CLEARKEY_UUID = C.CLEARKEY_UUID
    
    /**
     * Parse DRM type string to UUID
     */
    fun getDrmUUID(drmType: String?): UUID? {
        return when (drmType?.lowercase()) {
            "widevine" -> WIDEVINE_UUID
            "playready" -> PLAYREADY_UUID
            "clearkey" -> CLEARKEY_UUID
            else -> null
        }
    }
    
    /**
     * Build DRM session manager from PlaylistDrm configuration
     */
    fun buildDrmSessionManager(
        context: Context,
        drm: PlaylistDrm
    ): DrmSessionManager {
        val drmUUID = getDrmUUID(drm.type)
        
        if (drmUUID == null) {
            Log.e(TAG, "Unsupported DRM type: ${drm.type}")
            return DrmSessionManager.DRM_UNSUPPORTED
        }
        
        val licenseUrl = drm.licenseServer
        if (licenseUrl == null) {
            Log.e(TAG, "DRM license server URL is required")
            return DrmSessionManager.DRM_UNSUPPORTED
        }
        
        try {
            // Build HTTP data source factory for license requests
            val httpDataSourceFactory = DefaultHttpDataSource.Factory()
                .setUserAgent("ExoPlayer")
                .setAllowCrossProtocolRedirects(true)
            
            // Build DRM callback
            val drmCallback = HttpMediaDrmCallback(licenseUrl, httpDataSourceFactory)
            
            // Add DRM headers if present
            drm.headers?.forEach { (key, value) ->
                drmCallback.setKeyRequestProperty(key, value)
            }
            
            // Build DRM session manager
            val drmSessionManager = DefaultDrmSessionManager.Builder()
                .setUuidAndExoMediaDrmProvider(drmUUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
                .setMultiSession(drm.multiSession)
                .build(drmCallback)
            
            Log.d(TAG, "DRM session manager created successfully for type: ${drm.type}")
            return drmSessionManager
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build DRM session manager", e)
            return DrmSessionManager.DRM_UNSUPPORTED
        }
    }
    
    /**
     * Build MediaItem with DRM configuration
     */
    fun buildMediaItemWithDrm(
        uri: String,
        drm: PlaylistDrm?
    ): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(Uri.parse(uri))
        
        if (drm != null) {
            val drmUUID = getDrmUUID(drm.type)
            if (drmUUID != null && drm.licenseServer != null) {
                val drmConfigBuilder = MediaItem.DrmConfiguration.Builder(drmUUID)
                    .setLicenseUri(drm.licenseServer)
                    .setMultiSession(drm.multiSession)
                
                // Add DRM headers
                drm.headers?.let { headers ->
                    drmConfigBuilder.setLicenseRequestHeaders(headers)
                }
                
                builder.setDrmConfiguration(drmConfigBuilder.build())
                Log.d(TAG, "MediaItem built with DRM configuration: ${drm.type}")
            } else {
                Log.w(TAG, "Invalid DRM configuration, building MediaItem without DRM")
            }
        }
        
        return builder.build()
    }
    
    /**
     * Check if DRM is supported on this device
     */
    fun isDrmSupported(drmType: String): Boolean {
        val uuid = getDrmUUID(drmType) ?: return false
        
        return try {
            FrameworkMediaDrm.newInstance(uuid) != null
        } catch (e: Exception) {
            Log.w(TAG, "DRM type $drmType not supported on this device", e)
            false
        }
    }
}
