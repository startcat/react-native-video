package com.brentvatne.exoplayer.androidauto

import android.os.Bundle
import androidx.media.utils.MediaConstants

/**
 * PLAYER-267: bridge GUAU's content-style intent (carried in JS MediaItem.extras by the PLAYER-273
 * templatesToMediaLibrary mapper) into the androidx.media content-style bundle keys that media3's
 * MediaLibrarySession surfaces to Android Auto (via MediaUtils.convertToMediaDescriptionCompat, which
 * copies MediaMetadata.extras -> MediaDescriptionCompat.extras — verified media3 1.1.1).
 *
 * GUAU CONTENT_STYLE values: LIST = "1", GRID = "2"  (baseTemplate.utils.ts:96-99) — these map directly
 * onto MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM (1) / _GRID_ITEM (2).
 */
object ContentStyle {

    // GUAU extras keys (must match mediaLibrary.utils.ts:18-21).
    private const val KEY_CONTENT_STYLE = "contentStyle"
    private const val KEY_CHILDREN_BROWSABLE = "childrenBrowsableContentStyle"
    private const val KEY_CHILDREN_PLAYABLE = "childrenPlayableContentStyle"
    private const val KEY_GROUP_TITLE = "groupTitle"

    /** Map a GUAU style string ("1"/"2") to the media3 int hint, or null if unrecognised. */
    private fun toHint(value: String?): Int? = when (value) {
        "1" -> MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM // 1
        "2" -> MediaConstants.DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM // 2
        else -> null
    }

    /**
     * Build the media3 content-style Bundle from GUAU's extras map. Returns an empty Bundle when no
     * content-style keys are present (safe to setExtras unconditionally).
     */
    fun toBundle(extras: Map<String, String?>): Bundle {
        val b = Bundle()
        toHint(extras[KEY_CONTENT_STYLE])?.let {
            b.putInt(MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM, it)
        }
        toHint(extras[KEY_CHILDREN_BROWSABLE])?.let {
            b.putInt(MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE, it)
        }
        toHint(extras[KEY_CHILDREN_PLAYABLE])?.let {
            b.putInt(MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE, it)
        }
        extras[KEY_GROUP_TITLE]?.takeIf { it.isNotEmpty() }?.let {
            b.putString(MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE, it)
        }
        return b
    }

    /** True if the bundle carries no content-style key (used to decide whether to persist it). */
    fun isEmpty(b: Bundle): Boolean = b.isEmpty
}
