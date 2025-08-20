# Cast Enums

Documentación de todos los enums utilizados en el sistema Cast del reproductor.

## Índice

1. [CastManagerState](#castmanagerstate) - Estados del Cast Manager
2. [CastContentType](#castcontenttype) - Tipos de contenido Cast
3. [CastEvent](#castevent) - Eventos del sistema Cast
4. [CastStreamType](#caststreamtype) - Tipos de stream Cast
5. [TrackType](#tracktype) - Tipos de pistas multimedia

---

## CastManagerState

Enum que define los diferentes estados posibles del Cast Manager.

### Valores

| Valor | Descripción |
|-------|-------------|
| `NOT_CONNECTED` | Cast no está conectado |
| `CONNECTING` | Cast está intentando conectar |
| `CONNECTED` | Cast conectado pero sin contenido |
| `LOADING` | Cargando contenido en Cast |
| `PLAYING` | Reproduciendo contenido |
| `PAUSED` | Contenido pausado |
| `BUFFERING` | Bufferizando contenido |
| `ERROR` | Error en Cast Manager |
| `IDLE` | Cast inactivo después de reproducción |

### Uso

```typescript
import { CastManagerState } from '@/features/cast/types';

// Con useCastManager
const castManager = useCastManager();
if (castManager.state === CastManagerState.PLAYING) {
    console.log('Cast está reproduciendo');
}

// Con useCastState
const castState = useCastState();
if (castState.connection.status === 'connected') {
    console.log('Cast conectado');
}
```

---

## CastContentType

Enum para especificar el tipo de contenido que se va a reproducir en Cast.

### Valores

| Valor | Descripción | MIME Type |
|-------|-------------|----------|
| `VIDEO_MP4` | Video MP4 | `video/mp4` |
| `VIDEO_WEBM` | Video WebM | `video/webm` |
| `VIDEO_MOV` | Video MOV | `video/quicktime` |
| `VIDEO_AVI` | Video AVI | `video/x-msvideo` |
| `AUDIO_MP3` | Audio MP3 | `audio/mpeg` |
| `AUDIO_AAC` | Audio AAC | `audio/aac` |
| `AUDIO_WAV` | Audio WAV | `audio/wav` |
| `AUDIO_OGG` | Audio OGG | `audio/ogg` |
| `STREAM_HLS` | Stream HLS | `application/x-mpegURL` |
| `STREAM_DASH` | Stream DASH | `application/dash+xml` |
| `STREAM_SMOOTH` | Smooth Streaming | `application/vnd.ms-sstr+xml` |

### Uso

```typescript
import { CastContentType } from '@/features/cast/types';

const castManager = useCastManager();

const contentInfo = {
    url: 'https://example.com/video.mp4',
    contentType: CastContentType.VIDEO_MP4,
    title: 'Mi Video'
};

await castManager.loadContent(contentInfo);
```

---

## CastEvent

Enum de eventos que puede emitir el sistema Cast.

### Valores

| Valor | Descripción |
|-------|-------------|
| `CONNECTION_CHANGED` | Cambió el estado de conexión |
| `SESSION_STARTED` | Sesión Cast iniciada |
| `SESSION_ENDED` | Sesión Cast terminada |
| `MEDIA_LOADED` | Contenido cargado exitosamente |
| `MEDIA_LOAD_FAILED` | Error al cargar contenido |
| `PLAYBACK_STARTED` | Reproducción iniciada |
| `PLAYBACK_PAUSED` | Reproducción pausada |
| `PLAYBACK_STOPPED` | Reproducción detenida |
| `PLAYBACK_ENDED` | Reproducción terminada |
| `POSITION_CHANGED` | Cambió la posición de reproducción |
| `VOLUME_CHANGED` | Cambió el volumen |
| `MUTE_CHANGED` | Cambió el estado de silencio |
| `SUBTITLE_CHANGED` | Cambió la pista de subtítulos |
| `AUDIO_TRACK_CHANGED` | Cambió la pista de audio |
| `BUFFERING_STARTED` | Inició buffering |
| `BUFFERING_ENDED` | Terminó buffering |
| `ERROR_OCCURRED` | Ocurrió un error |

### Uso con Callbacks

```typescript
import { CastEvent } from '@/features/cast/types';

const castManager = useCastManager({
    onPlaybackStarted: () => {
        console.log('Reproducción iniciada en Cast');
    },
    onError: (error) => {
        console.error('Error en Cast:', error);
    },
    onVolumeChanged: (volume) => {
        console.log('Volumen cambiado:', volume);
    }
});
```

---

## CastStreamType

Enum para los diferentes tipos de stream soportados.

### Valores

| Valor | Descripción |
|-------|-------------|
| `NONE` | Sin stream |
| `BUFFERED` | Stream con buffer |
| `LIVE` | Stream en vivo |
| `OTHER` | Otro tipo de stream |

### Uso

```typescript
import { CastStreamType } from '@/features/cast/types';

const castManager = useCastManager();

const mediaInfo = {
    url: 'https://example.com/live-stream.m3u8',
    streamType: CastStreamType.LIVE,
    title: 'Transmisión en Vivo'
};

await castManager.loadContent(mediaInfo);
```

---

## TrackType

Enum para los tipos de pistas multimedia disponibles.

### Valores

| Valor | Descripción |
|-------|-------------|
| `AUDIO` | Pista de audio |
| `TEXT` | Pista de subtítulos/texto |
| `VIDEO` | Pista de video |

### Uso

```typescript
import { TrackType } from '@/features/cast/types';

const castManager = useCastManager();
const castState = useCastState();

// Obtener pistas de audio disponibles
const audioTracks = castState.media.availableAudioTracks.filter(
    track => track.type === TrackType.AUDIO
);

// Cambiar pista de subtítulos
const textTracks = castState.media.availableTextTracks.filter(
    track => track.type === TrackType.TEXT
);

if (textTracks.length > 0) {
    await castManager.setActiveTrackIds([textTracks[0].id]);
}
```

---

### Notas de Implementación

#### Consistencia con Google Cast SDK

Los enums `CastStreamType` están diseñados para ser compatibles con el Google Cast SDK:

```typescript
// Mapeo directo con Google Cast SDK
const castStreamType = isLive ? CastStreamType.LIVE : CastStreamType.BUFFERED;
```

#### Uso en Interfaces

Estos enums se utilizan en las interfaces consolidadas:

```typescript
interface CastContentInfo {
    contentType: CastContentType;
    // ... otras propiedades
}

interface CastMediaInfo {
    streamType: CastStreamType;
    // ... otras propiedades
}
```

#### Type Safety

Los enums proporcionan type safety y autocompletado:

```typescript
// Correcto
const state = CastManagerState.CONNECTED;

// Error de TypeScript
const state = 'connected'; // No es type-safe
```

#### Debugging

Para debugging, puedes usar el modo debug en los hooks:

```typescript
const castManager = useCastManager(callbacks, { debugMode: true });
const castState = useCastState({ debugMode: true });

// Los logs mostrarán información detallada sobre:
// - Cambios de estado (CastManagerState)
// - Eventos de Cast (CastEvent)
// - Tipos de contenido cargado (CastContentType)
// - Cambios de pistas (TrackType)
