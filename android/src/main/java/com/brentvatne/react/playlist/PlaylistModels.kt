package com.brentvatne.react.playlist

import android.util.Log
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

/**
 * Playlist item types
 */
enum class PlaylistItemType(val value: String) {
    VIDEO("VIDEO"),
    AUDIO("AUDIO"),
    TUDUM("TUDUM");

    companion object {
        fun fromString(value: String?): PlaylistItemType {
            return when (value?.uppercase()) {
                "AUDIO" -> AUDIO
                "TUDUM" -> TUDUM
                else -> VIDEO
            }
        }
    }
}

/**
 * Playlist item status
 */
enum class PlaylistItemStatus(val value: String) {
    PENDING("PENDING"),
    PLAYING("PLAYING"),
    COMPLETED("COMPLETED"),
    ERROR("ERROR"),
    SKIPPED("SKIPPED");
}

/**
 * Playlist repeat mode
 */
enum class PlaylistRepeatMode(val value: String) {
    OFF("OFF"),
    ALL("ALL"),
    ONE("ONE");

    companion object {
        fun fromString(value: String?): PlaylistRepeatMode {
            return when (value?.uppercase()) {
                "ALL" -> ALL
                "ONE" -> ONE
                else -> OFF
            }
        }
    }
}

/**
 * Source data for a playlist item
 */
data class PlaylistSource(
    val uri: String,
    val type: String? = null,
    val headers: Map<String, String>? = null
) {
    companion object {
        /**
         * Parse source from new resolvedSources structure or legacy source structure
         */
        fun fromMap(map: ReadableMap?): PlaylistSource? {
            if (map == null) return null
            
            // Try new structure: resolvedSources.local
            if (map.hasKey("resolvedSources")) {
                val resolvedSources = map.getMap("resolvedSources")
                
                // Priority: local > cast > download
                val localSource = resolvedSources?.getMap("local")
                if (localSource != null && localSource.hasKey("uri")) {
                    return parseSourceObject(localSource)
                }
                
                val castSource = resolvedSources?.getMap("cast")
                if (castSource != null && castSource.hasKey("uri")) {
                    return parseSourceObject(castSource)
                }
                
                val downloadSource = resolvedSources?.getMap("download")
                if (downloadSource != null && downloadSource.hasKey("uri")) {
                    return parseSourceObject(downloadSource)
                }
                
                Log.w("PlaylistSource", "resolvedSources present but no valid source found")
                return null
            }
            
            // Legacy structure: direct source object
            if (map.hasKey("uri")) {
                return parseSourceObject(map)
            }
            
            Log.w("PlaylistSource", "No valid source structure found")
            return null
        }
        
        private fun parseSourceObject(map: ReadableMap): PlaylistSource? {
            val uri = map.getString("uri") ?: return null
            val headers = map.getMap("headers")?.toHashMap()?.mapValues { it.value.toString() }
            val type = map.getString("type")
            
            return PlaylistSource(
                uri = uri,
                type = type,
                headers = headers
            )
        }
    }

    fun toMap(): WritableMap {
        return Arguments.createMap().apply {
            putString("uri", uri)
            type?.let { putString("type", it) }
            headers?.let { h ->
                putMap("headers", Arguments.createMap().apply {
                    h.forEach { (key, value) -> putString(key, value) }
                })
            }
        }
    }
}

/**
 * Metadata for a playlist item
 */
data class PlaylistMetadata(
    val title: String? = null,
    val subtitle: String? = null,
    val description: String? = null,
    val imageUri: String? = null,
    val artist: String? = null,
    val album: String? = null
) {
    companion object {
        fun fromMap(map: ReadableMap?): PlaylistMetadata {
            if (map == null) return PlaylistMetadata()
            
            return PlaylistMetadata(
                title = map.getString("title"),
                subtitle = map.getString("subtitle"),
                description = map.getString("description"),
                // Support both 'poster' (new) and 'imageUri' (legacy)
                imageUri = map.getString("poster") ?: map.getString("imageUri"),
                artist = map.getString("artist"),
                album = map.getString("album")
            )
        }
    }

    fun toMap(): WritableMap {
        return Arguments.createMap().apply {
            title?.let { putString("title", it) }
            subtitle?.let { putString("subtitle", it) }
            description?.let { putString("description", it) }
            imageUri?.let { putString("imageUri", it) }
            artist?.let { putString("artist", it) }
            album?.let { putString("album", it) }
        }
    }
}

/**
 * Complete playlist item
 */
data class PlaylistItem(
    val id: String,
    val type: PlaylistItemType,
    val source: PlaylistSource,
    val metadata: PlaylistMetadata,
    val duration: Double? = null,
    var status: PlaylistItemStatus = PlaylistItemStatus.PENDING,
    val addedAt: Long = System.currentTimeMillis()
) {
    companion object {
        fun fromMap(map: ReadableMap?): PlaylistItem? {
            if (map == null) {
                Log.w("PlaylistItem", "Received null map")
                return null
            }
            
            val id = map.getString("id")
            if (id == null) {
                Log.w("PlaylistItem", "Missing required field: id")
                return null
            }
            
            // Parse source (supports both new resolvedSources and legacy source)
            val source = PlaylistSource.fromMap(map)
            if (source == null) {
                Log.w("PlaylistItem", "Failed to parse source for item: $id")
                return null
            }
            
            val type = PlaylistItemType.fromString(map.getString("type"))
            val metadata = PlaylistMetadata.fromMap(map.getMap("metadata"))
            val duration = if (map.hasKey("duration")) map.getDouble("duration") else null
            
            Log.d("PlaylistItem", "Successfully parsed item: $id (${source.uri})")
            
            return PlaylistItem(
                id = id,
                type = type,
                source = source,
                metadata = metadata,
                duration = duration
            )
        }
    }

    fun toMap(): WritableMap {
        return Arguments.createMap().apply {
            putString("id", id)
            putString("type", type.value)
            putMap("source", source.toMap())
            putMap("metadata", metadata.toMap())
            duration?.let { putDouble("duration", it) }
            putString("status", status.value)
            putDouble("addedAt", addedAt.toDouble())
        }
    }
}

/**
 * Playlist configuration
 */
data class PlaylistConfiguration(
    val autoNext: Boolean = true,
    val repeatMode: PlaylistRepeatMode = PlaylistRepeatMode.OFF,
    val skipOnError: Boolean = true,
    val shuffleEnabled: Boolean = false
) {
    companion object {
        fun fromMap(map: ReadableMap?): PlaylistConfiguration {
            if (map == null) {
                return PlaylistConfiguration()
            }
            
            return try {
                PlaylistConfiguration(
                    autoNext = try {
                        if (map.hasKey("autoNext")) map.getBoolean("autoNext") else true
                    } catch (e: Exception) {
                        Log.w("PlaylistConfig", "Invalid autoNext value, using default: true", e)
                        true
                    },
                    repeatMode = try {
                        if (map.hasKey("repeatMode")) {
                            PlaylistRepeatMode.fromString(map.getString("repeatMode"))
                        } else {
                            PlaylistRepeatMode.OFF
                        }
                    } catch (e: Exception) {
                        Log.w("PlaylistConfig", "Invalid repeatMode value, using default: OFF", e)
                        PlaylistRepeatMode.OFF
                    },
                    skipOnError = try {
                        if (map.hasKey("skipOnError")) map.getBoolean("skipOnError") else true
                    } catch (e: Exception) {
                        Log.w("PlaylistConfig", "Invalid skipOnError value, using default: true", e)
                        true
                    },
                    shuffleEnabled = try {
                        if (map.hasKey("shuffleEnabled")) map.getBoolean("shuffleEnabled") else false
                    } catch (e: Exception) {
                        Log.w("PlaylistConfig", "Invalid shuffleEnabled value, using default: false", e)
                        false
                    }
                )
            } catch (e: Exception) {
                Log.e("PlaylistConfig", "Failed to parse playlist configuration, using defaults", e)
                PlaylistConfiguration()
            }
        }
    }
}
