package com.brentvatne.common.api

import android.graphics.Color
import com.brentvatne.common.toolbox.ReactBridgeUtils
import com.facebook.react.bridge.ReadableMap

/**
 * Helper file to parse SubtitleStyle prop and build a dedicated class
 */
class SubtitleStyle private constructor() {
    var fontSize = -1
        private set
    var paddingLeft = 0
        private set
    var paddingRight = 0
        private set
    var paddingTop = 0
        private set
    var paddingBottom = 0
        private set
    var opacity = 1f
        private set
    private var _backgroundColor: Int? = null
    private var _verticalAlignment: String? = null
    
    // Public getters for Java interop
    fun getBackgroundColor(): Int? = _backgroundColor
    fun getVerticalAlignment(): String? = _verticalAlignment

    companion object {
        private const val PROP_FONT_SIZE_TRACK = "fontSize"
        private const val PROP_PADDING_BOTTOM = "paddingBottom"
        private const val PROP_PADDING_TOP = "paddingTop"
        private const val PROP_PADDING_LEFT = "paddingLeft"
        private const val PROP_PADDING_RIGHT = "paddingRight"
        private const val PROP_OPACITY = "opacity"
        private const val PROP_BACKGROUND_COLOR = "backgroundColor"
        private const val PROP_VERTICAL_ALIGNMENT = "verticalAlignment"

        @JvmStatic
        fun parse(src: ReadableMap?): SubtitleStyle {
            val subtitleStyle = SubtitleStyle()
            subtitleStyle.fontSize = ReactBridgeUtils.safeGetInt(src, PROP_FONT_SIZE_TRACK, -1)
            subtitleStyle.paddingBottom = ReactBridgeUtils.safeGetInt(src, PROP_PADDING_BOTTOM, 0)
            subtitleStyle.paddingTop = ReactBridgeUtils.safeGetInt(src, PROP_PADDING_TOP, 0)
            subtitleStyle.paddingLeft = ReactBridgeUtils.safeGetInt(src, PROP_PADDING_LEFT, 0)
            subtitleStyle.paddingRight = ReactBridgeUtils.safeGetInt(src, PROP_PADDING_RIGHT, 0)
            subtitleStyle.opacity = ReactBridgeUtils.safeGetFloat(src, PROP_OPACITY, 1f)
            
            // Parse backgroundColor from string (e.g., "#FF0000" or "red")
            val backgroundColorStr = ReactBridgeUtils.safeGetString(src, PROP_BACKGROUND_COLOR, null)
            if (backgroundColorStr != null) {
                try {
                    // Handle "transparent" specially as Color.parseColor doesn't recognize it
                    subtitleStyle._backgroundColor = if (backgroundColorStr.trim().equals("transparent", ignoreCase = true)) {
                        Color.TRANSPARENT
                    } else {
                        Color.parseColor(backgroundColorStr)
                    }
                } catch (e: IllegalArgumentException) {
                    subtitleStyle._backgroundColor = null
                }
            }
            
            // Parse verticalAlignment: "top", "middle", "bottom"
            subtitleStyle._verticalAlignment = ReactBridgeUtils.safeGetString(src, PROP_VERTICAL_ALIGNMENT, null)
            
            return subtitleStyle
        }
    }
}
