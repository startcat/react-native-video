package com.brentvatne.common.api

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

/**
 * Class representing a list of sideLoaded text track from application
 * Do you use player import in this class
 */

class SideLoadedTextTrackList {
    var tracks = ArrayList<SideLoadedTextTrack>()

    companion object {
        fun parse(src: ReadableArray?): SideLoadedTextTrackList? {
            if (src == null) {
                return null
            }
            var sideLoadedTextTrackList = SideLoadedTextTrackList()
            for (i in 0 until src.size()) {
                // Cambio Propuesto por Juan - Versiones de Kotlin nuevas
                // val textTrack: ReadableMap = src.getMap(i)
                // sideLoadedTextTrackList.tracks.add(SideLoadedTextTrack.parse(textTrack))

                val textTrack = src.getMap(i) ?: continue        // ← ① ignora entradas nulas
                sideLoadedTextTrackList.tracks.add(
                    SideLoadedTextTrack.parse(textTrack)
                )
            }
            return sideLoadedTextTrackList
        }
    }
}
