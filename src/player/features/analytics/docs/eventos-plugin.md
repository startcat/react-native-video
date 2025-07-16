# Referencia de Eventos de Plugin

## Introducción

Este documento lista todos los eventos disponibles en la interfaz `PlayerAnalyticsPlugin` que pueden implementar los plugins de analytics. Cada evento incluye sus parámetros opcionales y su propósito.

## Propiedades Básicas

| Propiedad | Tipo | Descripción | Requerido |
|-----------|------|-------------|-----------|
| `name` | `string` | Nombre identificativo del plugin | ✅ |
| `version` | `string` | Versión del plugin | ✅ |

---

## Gestión de Sesión y Lifecycle

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onSourceChange` | Ninguno | Se ejecuta cuando cambia la fuente del contenido |
| `onCreatePlaybackSession` | Ninguno | Se ejecuta al crear una nueva sesión de reproducción |
| `onMetadataLoaded` | [`MetadataParams`](#metadataparams) | Se ejecuta cuando se cargan los metadatos del contenido |
| `onMetadataUpdate` | [`MetadataParams`](#metadataparams) | Se ejecuta cuando se actualizan los metadatos |
| `onDurationChange` | [`DurationChangeParams`](#durationchangeparams) | Se ejecuta cuando cambia la duración del contenido |

---

## Control de Reproducción

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onPlay` | Ninguno | Se ejecuta cuando inicia la reproducción |
| `onPause` | Ninguno | Se ejecuta cuando se pausa la reproducción |
| `onEnd` | Ninguno | Se ejecuta cuando termina la reproducción |
| `onStop` | [`StopParams`](#stopparams) | Se ejecuta cuando se detiene la reproducción |

---

## Buffering

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onBufferStart` | Ninguno | Se ejecuta cuando inicia el buffering |
| `onBufferStop` | Ninguno | Se ejecuta cuando termina el buffering |

---

## Navegación y Posición

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onSeekStart` | Ninguno | Se ejecuta cuando inicia una búsqueda (seek) |
| `onSeekEnd` | [`SeekEndParams`](#seekendparams) | Se ejecuta cuando termina una búsqueda |
| `onPositionChange` | [`PositionChangeParams`](#positionchangeparams) | Se ejecuta cuando cambia la posición de reproducción |
| `onPositionUpdate` | [`PositionUpdateParams`](#positionupdateparams) | Se ejecuta en actualizaciones de posición |
| `onProgress` | [`ProgressParams`](#progressparams) | Se ejecuta periódicamente durante la reproducción |
| `onPlaybackRateChange` | [`PlaybackRateChangeParams`](#playbackratechangeparams) | Se ejecuta cuando cambia la velocidad de reproducción |

---

## Publicidad

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onAdBegin` | [`AdBeginParams`](#adbeginparams) | Se ejecuta cuando inicia un anuncio |
| `onAdEnd` | [`AdEndParams`](#adendparams) | Se ejecuta cuando termina un anuncio |
| `onAdPause` | [`AdPauseParams`](#adpauseparams) | Se ejecuta cuando se pausa un anuncio |
| `onAdResume` | [`AdResumeParams`](#adresumeparams) | Se ejecuta cuando se reanuda un anuncio |
| `onAdSkip` | [`AdSkipParams`](#adskipparams) | Se ejecuta cuando se salta un anuncio |
| `onAdBreakBegin` | [`AdBreakBeginParams`](#adbreakbeginparams) | Se ejecuta cuando inicia un bloque de anuncios |
| `onAdBreakEnd` | [`AdBreakEndParams`](#adbreakendparams) | Se ejecuta cuando termina un bloque de anuncios |
| `onContentResume` | Ninguno | Se ejecuta cuando se reanuda el contenido después de anuncios |

---

## Gestión de Errores

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onError` | [`ErrorParams`](#errorparams) | Se ejecuta cuando ocurre un error general |
| `onContentProtectionError` | [`ContentProtectionErrorParams`](#contentprotectionerrorparams) | Se ejecuta cuando hay error de DRM/protección |
| `onNetworkError` | [`NetworkErrorParams`](#networkerrorparams) | Se ejecuta cuando hay error de red |
| `onStreamError` | [`StreamErrorParams`](#streamerrorparams) | Se ejecuta cuando hay error en el stream |

---

## Audio y Subtítulos

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onAudioTrackChange` | [`AudioTrackChangeParams`](#audiotrackchangeparams) | Se ejecuta cuando cambia la pista de audio |
| `onVolumeChange` | [`VolumeChangeParams`](#volumechangeparams) | Se ejecuta cuando cambia el volumen |
| `onMuteChange` | [`MuteChangeParams`](#mutechangeparams) | Se ejecuta cuando se silencia/dessilencia |
| `onSubtitleTrackChange` | [`SubtitleTrackChangeParams`](#subtitletrackchangeparams) | Se ejecuta cuando cambia la pista de subtítulos |
| `onSubtitleShow` | [`SubtitleShowParams`](#subtitleshowparams) | Se ejecuta cuando se muestran subtítulos |
| `onSubtitleHide` | Ninguno | Se ejecuta cuando se ocultan las subtítulos |

---

## Calidad y Rendimiento

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onQualityChange` | [`QualityChangeParams`](#qualitychangeparams) | Se ejecuta cuando cambia la calidad del video |
| `onBitrateChange` | [`BitrateChangeParams`](#bitratechangeparams) | Se ejecuta cuando cambia el bitrate |
| `onResolutionChange` | [`ResolutionChangeParams`](#resolutionchangeparams) | Se ejecuta cuando cambia la resolución |

---

## Estado de Aplicación

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `onApplicationForeground` | Ninguno | Se ejecuta cuando la app pasa a primer plano |
| `onApplicationBackground` | Ninguno | Se ejecuta cuando la app pasa a segundo plano |
| `onApplicationActive` | Ninguno | Se ejecuta cuando la app se activa |
| `onApplicationInactive` | Ninguno | Se ejecuta cuando la app se desactiva |

---

## Limpieza

| Evento | Parámetros | Descripción |
|--------|------------|-------------|
| `destroy` | Ninguno | **REQUERIDO** - Se ejecuta para limpiar recursos del plugin |

---

# Definición de Parámetros

## MetadataParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `metadata` | `any` | Metadatos del contenido | ✅ |

## DurationChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `duration` | `number` | Nueva duración en milisegundos | ✅ |
| `previousDuration` | `number` | Duración anterior | ❌ |

## StopParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `reason` | `'user' \| 'error' \| 'completion' \| 'navigation'` | Razón de la parada | ❌ |

## SeekEndParams

Extiende [`PositionParams`](#positionparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `position` | `number` | Posición actual en milisegundos | ✅ |
| `duration` | `number` | Duración total en milisegundos | ❌ |
| `fromPosition` | `number` | Posición desde donde se buscó | ❌ |

## PositionChangeParams

Extiende [`PositionParams`](#positionparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `position` | `number` | Posición actual en milisegundos | ✅ |
| `duration` | `number` | Duración total en milisegundos | ❌ |
| `playbackRate` | `number` | Velocidad de reproducción actual | ❌ |

## PositionUpdateParams

Extiende [`PositionParams`](#positionparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `position` | `number` | Posición actual en milisegundos | ✅ |
| `duration` | `number` | Duración total en milisegundos | ❌ |
| `bufferedPosition` | `number` | Posición buffeada | ❌ |

## ProgressParams

Extiende [`PositionParams`](#positionparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `position` | `number` | Posición actual en milisegundos | ✅ |
| `duration` | `number` | Duración total en milisegundos | ❌ |
| `percentageWatched` | `number` | Porcentaje visto (calculado) | ❌ |

## PositionParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `position` | `number` | Posición en milisegundos | ✅ |
| `duration` | `number` | Duración total en milisegundos | ❌ |

## PlaybackRateChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `rate` | `number` | Nueva velocidad de reproducción | ✅ |
| `previousRate` | `number` | Velocidad anterior | ❌ |

## AdBeginParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adId` | `string` | ID del anuncio | ❌ |
| `adDuration` | `number` | Duración del anuncio en milisegundos | ❌ |
| `adPosition` | `number` | Posición del anuncio en el contenido | ❌ |
| `adType` | `'preroll' \| 'midroll' \| 'postroll'` | Tipo de anuncio | ❌ |

## AdEndParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adId` | `string` | ID del anuncio | ❌ |
| `completed` | `boolean` | Si el anuncio se completó o se saltó | ❌ |

## AdPauseParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adId` | `string` | ID del anuncio | ❌ |

## AdResumeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adId` | `string` | ID del anuncio | ❌ |

## AdSkipParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adId` | `string` | ID del anuncio | ❌ |
| `skipPosition` | `number` | Posición donde se saltó en milisegundos | ❌ |

## AdBreakBeginParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adBreakId` | `string` | ID del bloque de anuncios | ❌ |
| `adCount` | `number` | Número de anuncios en el bloque | ❌ |
| `adBreakPosition` | `number` | Posición del bloque en el contenido | ❌ |

## AdBreakEndParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `adBreakId` | `string` | ID del bloque de anuncios | ❌ |

## ErrorParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `errorCode` | `string \| number` | Código de error | ❌ |
| `errorMessage` | `string` | Mensaje de error | ❌ |
| `errorType` | `'playback' \| 'network' \| 'drm' \| 'other'` | Tipo de error | ❌ |
| `isFatal` | `boolean` | Si el error es fatal | ❌ |

## ContentProtectionErrorParams

Extiende [`ErrorParams`](#errorparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `drmType` | `string` | Tipo de DRM | ❌ |

## NetworkErrorParams

Extiende [`ErrorParams`](#errorparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `statusCode` | `number` | Código de estado HTTP | ❌ |
| `url` | `string` | URL que causó el error | ❌ |

## StreamErrorParams

Extiende [`ErrorParams`](#errorparams)

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `streamUrl` | `string` | URL del stream | ❌ |
| `bitrate` | `number` | Bitrate del stream | ❌ |

## AudioTrackChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `trackIndex` | `number` | Índice de la pista de audio | ✅ |
| `trackLabel` | `string` | Etiqueta de la pista | ❌ |
| `language` | `string` | Idioma de la pista (código ISO) | ❌ |

## VolumeChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `volume` | `number` | Nivel de volumen 0.0 - 1.0 | ✅ |
| `previousVolume` | `number` | Volumen anterior | ❌ |

## MuteChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `muted` | `boolean` | Estado de silencio | ✅ |

## SubtitleTrackChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `trackIndex` | `number` | Índice de la pista de subtítulos | ✅ |
| `trackLabel` | `string` | Etiqueta de la pista | ❌ |
| `language` | `string` | Idioma de la pista (código ISO) | ❌ |

## SubtitleShowParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `trackIndex` | `number` | Índice de la pista mostrada | ❌ |

## QualityChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `quality` | `string` | Etiqueta de calidad | ✅ |
| `height` | `number` | Altura en píxeles | ❌ |
| `width` | `number` | Ancho en píxeles | ❌ |
| `bitrate` | `number` | Bitrate en bps | ❌ |

## BitrateChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `bitrate` | `number` | Nuevo bitrate en bps | ✅ |
| `previousBitrate` | `number` | Bitrate anterior | ❌ |
| `adaptive` | `boolean` | Si es adaptativo | ❌ |

## ResolutionChangeParams

| Campo | Tipo | Descripción | Requerido |
|-------|------|-------------|-----------|
| `width` | `number` | Ancho en píxeles | ✅ |
| `height` | `number` | Alto en píxeles | ✅ |
| `previousWidth` | `number` | Ancho anterior | ❌ |
| `previousHeight` | `number` | Alto anterior | ❌ |
