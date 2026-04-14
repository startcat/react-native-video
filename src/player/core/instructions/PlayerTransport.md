# PlayerTransport - Abstracción de Capa de Transporte

## 📋 Propósito

El **PlayerTransport** es una abstracción que encapsula la comunicación con el reproductor real (nativo o remoto). Su objetivo es **aislar completamente** la lógica de negocio del player de la implementación específica del transporte, permitiendo que el mismo código funcione con Video nativo, Chromecast, AirPlay, o cualquier otro mecanismo de reproducción.

## 🎯 Responsabilidades

### ✅ Lo que DEBE hacer:
1. **Ejecutar comandos de reproducción** (play, pause, seek, setVolume, setRate)
2. **Cargar contenido** en el reproductor subyacente
3. **Emitir eventos** de cambios de estado del reproductor
4. **Traducir entre formatos** (ej: formato de source interno → formato Cast)
5. **Gestionar el ciclo de vida** del reproductor subyacente
6. **Proporcionar estado actual** del reproductor de forma síncrona

### ❌ Lo que NO debe hacer:
- ❌ Lógica de negocio (ej: decidir si pausar por ad)
- ❌ Gestión de progress tracking (VOD/DVR)
- ❌ Cooking de sources (DRM, headers, etc.)
- ❌ Gestión de playlists
- ❌ Analytics o logging de negocio
- ❌ Gestión de UI o estado React

## 🔌 Interface Principal

```typescript
interface IPlayerTransport {
  // === CONTROL DE REPRODUCCIÓN ===
  
  /**
   * Inicia la reproducción
   * @throws TransportError si el reproductor no está listo
   */
  play(): Promise<void>;
  
  /**
   * Pausa la reproducción
   */
  pause(): Promise<void>;
  
  /**
   * Salta a una posición específica
   * @param time Tiempo en segundos
   */
  seek(time: number): Promise<void>;
  
  /**
   * Ajusta el volumen
   * @param level Nivel de volumen (0.0 - 1.0)
   */
  setVolume(level: number): Promise<void>;
  
  /**
   * Ajusta la velocidad de reproducción
   * @param rate Velocidad (0.5, 1.0, 1.5, 2.0, etc.)
   */
  setRate(rate: number): Promise<void>;
  
  /**
   * Silencia/desilencia el audio
   * @param muted true para silenciar
   */
  setMuted(muted: boolean): Promise<void>;
  
  // === GESTIÓN DE CONTENIDO ===
  
  /**
   * Carga un nuevo contenido en el reproductor
   * @param source Source ya procesado (cooked)
   * @param metadata Metadatos del contenido
   */
  load(source: ProcessedSource, metadata: ContentMetadata): Promise<void>;
  
  /**
   * Detiene la reproducción y limpia el reproductor
   */
  stop(): Promise<void>;
  
  // === GESTIÓN DE TRACKS ===
  
  /**
   * Selecciona un track de audio
   * @param trackId ID del track o null para desactivar
   */
  selectAudioTrack(trackId: string | null): Promise<void>;
  
  /**
   * Selecciona un track de texto/subtítulos
   * @param trackId ID del track o null para desactivar
   */
  selectTextTrack(trackId: string | null): Promise<void>;
  
  // === ESTADO ACTUAL (SÍNCRONO) ===
  
  /**
   * Obtiene el estado actual del reproductor de forma síncrona
   * Útil para consultas rápidas sin esperar eventos
   */
  getState(): TransportState;
  
  // === EVENTOS (OBSERVABLES) ===
  
  /**
   * Stream de eventos de progreso de reproducción
   * Emite cada vez que cambia la posición, duración o buffering
   */
  readonly onProgress: Observable<ProgressEvent>;
  
  /**
   * Stream de cambios de estado de reproducción
   * Emite cuando cambia: playing, paused, buffering, ended, error
   */
  readonly onPlaybackStateChange: Observable<PlaybackStateEvent>;
  
  /**
   * Stream de eventos de carga de contenido
   * Emite cuando se carga metadata, tracks disponibles, etc.
   */
  readonly onContentLoad: Observable<ContentLoadEvent>;
  
  /**
   * Stream de errores del reproductor
   * Emite instancias de PlayerError del sistema de errores existente
   */
  readonly onError: Observable<PlayerError>;
  
  /**
   * Stream de eventos de buffering
   * Emite cuando el reproductor empieza o termina de buffering
   */
  readonly onBuffering: Observable<BufferingEvent>;
  
  /**
   * Stream de eventos de ads (si aplica)
   */
  readonly onAdEvent: Observable<AdEvent>;
  
  /**
   * Stream de cambios de volumen
   */
  readonly onVolumeChange: Observable<VolumeEvent>;
  
  // === CAPACIDADES ===
  
  /**
   * Indica las capacidades del transport
   * Útil para features condicionales (ej: Cast no soporta PiP)
   */
  readonly capabilities: TransportCapabilities;
  
  // === LIFECYCLE ===
  
  /**
   * Limpia recursos y desuscribe listeners
   */
  dispose(): void;
}
```

## 📦 Tipos de Datos

```typescript
// === ESTADO DEL TRANSPORT ===

interface TransportState {
  /** Estado de reproducción actual */
  playbackState: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
  
  /** Posición actual en segundos */
  currentTime: number;
  
  /** Duración total en segundos (0 si desconocida) */
  duration: number;
  
  /** Si está actualmente buffering (cargando datos) */
  isBuffering: boolean;
  
  /** Rangos buffereados en segundos (puede haber múltiples rangos discontinuos) */
  buffered: { start: number; end: number }[];
  
  /** Nivel de volumen (0.0 - 1.0) */
  volume: number;
  
  /** Si está silenciado */
  muted: boolean;
  
  /** Velocidad de reproducción */
  rate: number;
  
  /** Si es contenido en vivo */
  isLive: boolean;
  
  /** Ventana DVR en segundos (para live) */
  seekableRange?: { start: number; end: number };
}

// === EVENTOS ===

interface ProgressEvent {
  currentTime: number;
  duration: number;
  buffered: { start: number; end: number }[];
  seekableRange?: { start: number; end: number };
  playableDuration: number;
}

interface PlaybackStateEvent {
  state: TransportState['playbackState'];
  timestamp: number;
}

interface ContentLoadEvent {
  type: 'metadata' | 'tracks' | 'ready';
  data: {
    duration?: number;
    isLive?: boolean;
    audioTracks?: AudioTrack[];
    textTracks?: TextTrack[];
    videoTracks?: VideoTrack[];
    naturalSize?: { width: number; height: number };
  };
}

interface VolumeEvent {
  volume: number;
  muted: boolean;
}

interface BufferingEvent {
  /** Si está buffering o ha terminado */
  isBuffering: boolean;
  
  /** Timestamp del evento */
  timestamp: number;
  
  /** Rangos buffereados actualizados */
  buffered: { start: number; end: number }[];
}

interface AdEvent {
  type: 'start' | 'end' | 'progress' | 'skip' | 'error';
  data?: any;
}

// NOTA: Se usa PlayerError del sistema existente
// import { PlayerError } from '@/player/core/errors/PlayerError';

// === SOURCE PROCESADO ===

interface ProcessedSource {
  /** URI del contenido */
  uri: string;
  
  /** Tipo de contenido */
  type?: 'hls' | 'dash' | 'mp4' | 'other';
  
  /** Headers HTTP */
  headers?: Record<string, string>;
  
  /** Configuración DRM */
  drm?: DRMConfiguration;
  
  /** Metadata adicional */
  metadata?: Record<string, any>;
}

interface ContentMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  poster?: string;
  artist?: string;
  album?: string;
  genre?: string;
}

// === CAPACIDADES ===

interface TransportCapabilities {
  /** Soporta Picture-in-Picture */
  supportsPiP: boolean;
  
  /** Soporta AirPlay */
  supportsAirPlay: boolean;
  
  /** Soporta cambio de velocidad */
  supportsRateChange: boolean;
  
  /** Soporta ads */
  supportsAds: boolean;
  
  /** Soporta múltiples tracks de audio */
  supportsMultipleAudioTracks: boolean;
  
  /** Soporta subtítulos */
  supportsTextTracks: boolean;
  
  /** Es un reproductor remoto (Cast, AirPlay) */
  isRemote: boolean;
}
```

## 🏗️ Implementaciones

### 1. VideoTransport (Reproductor Nativo)

**Responsabilidad**: Wrapper del componente `<Video>` de react-native-video

**Características**:
- Controla el ref del Video component
- Traduce eventos nativos a eventos del transport
- Gestiona el ciclo de vida del componente Video
- Soporta todas las capacidades nativas (PiP, AirPlay, ads)

**Ejemplo de uso interno**:
```typescript
class VideoTransport implements IPlayerTransport {
  private videoRef: RefObject<VideoRef>;
  private progressSubject = new Subject<ProgressEvent>();
  private stateSubject = new Subject<PlaybackStateEvent>();
  
  constructor(videoRef: RefObject<VideoRef>) {
    this.videoRef = videoRef;
  }
  
  async play(): Promise<void> {
    // No hay método play() directo, se usa la prop paused
    // El PlayerController manejará esto
    return Promise.resolve();
  }
  
  async seek(time: number): Promise<void> {
    this.videoRef.current?.seek(time);
  }
  
  // Método interno para conectar eventos del Video
  handleVideoProgress(data: OnProgressData) {
    this.progressSubject.next({
      currentTime: data.currentTime,
      duration: data.seekableDuration || data.duration,
      buffered: [{ start: 0, end: data.playableDuration }],
      playableDuration: data.playableDuration,
      seekableRange: data.seekableDuration 
        ? { start: 0, end: data.seekableDuration }
        : undefined,
    });
  }
  
  get onProgress(): Observable<ProgressEvent> {
    return this.progressSubject.asObservable();
  }
  
  get capabilities(): TransportCapabilities {
    return {
      supportsPiP: true,
      supportsAirPlay: true,
      supportsRateChange: true,
      supportsAds: true,
      supportsMultipleAudioTracks: true,
      supportsTextTracks: true,
      isRemote: false,
    };
  }
}
```

### 2. CastTransport (Google Cast)

**Responsabilidad**: Wrapper del CastManager

**Características**:
- Traduce comandos a operaciones de Cast SDK
- Sincroniza estado desde el dispositivo Cast
- Gestiona la conexión y desconexión de Cast
- Traduce formato de source a MediaInfo de Cast

**Ejemplo de uso interno**:
```typescript
class CastTransport implements IPlayerTransport {
  private castManager: CastManager;
  private progressSubject = new Subject<ProgressEvent>();
  private stateSubject = new Subject<PlaybackStateEvent>();
  
  constructor(castManager: CastManager) {
    this.castManager = castManager;
    this.setupCastListeners();
  }
  
  async play(): Promise<void> {
    await this.castManager.play();
  }
  
  async pause(): Promise<void> {
    await this.castManager.pause();
  }
  
  async seek(time: number): Promise<void> {
    await this.castManager.seek(time);
  }
  
  async load(source: ProcessedSource, metadata: ContentMetadata): Promise<void> {
    const mediaInfo = this.buildMediaInfo(source, metadata);
    await this.castManager.loadMedia(mediaInfo);
  }
  
  private buildMediaInfo(source: ProcessedSource, metadata: ContentMetadata): MediaInfo {
    return {
      contentUrl: source.uri,
      contentType: this.getContentType(source.type),
      metadata: {
        title: metadata.title,
        subtitle: metadata.subtitle,
        images: metadata.poster ? [{ url: metadata.poster }] : [],
      },
      customData: source.metadata,
    };
  }
  
  private setupCastListeners() {
    // Escuchar eventos de Cast y emitirlos como eventos del transport
    this.castManager.onProgressUpdate((progress) => {
      this.progressSubject.next({
        currentTime: progress.currentTime,
        duration: progress.duration,
        buffered: [],
        playableDuration: progress.duration,
      });
    });
  }
  
  get capabilities(): TransportCapabilities {
    return {
      supportsPiP: false,
      supportsAirPlay: false,
      supportsRateChange: false, // Cast tiene limitaciones
      supportsAds: true,
      supportsMultipleAudioTracks: true,
      supportsTextTracks: true,
      isRemote: true,
    };
  }
}
```

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│                   PlayerController                      │
│  (Lógica de negocio, decide QUÉ hacer)                  │
└─────────────────────────────────────────────────────────┘
                          ↓ ↑
                   Comandos │ Eventos
                          ↓ ↑
┌─────────────────────────────────────────────────────────┐
│                   PlayerTransport                       │
│  (Abstracción, traduce CÓMO hacerlo)                    │
└─────────────────────────────────────────────────────────┘
                          ↓ ↑
                          ↓ ↑
        ┌─────────────────┴─┴─────────────────┐
        ↓                                      ↓
┌──────────────────┐              ┌──────────────────────┐
│  VideoTransport  │              │   CastTransport      │
│  (Impl. nativa)  │              │   (Impl. remota)     │
└──────────────────┘              └──────────────────────┘
        ↓                                      ↓
┌──────────────────┐              ┌──────────────────────┐
│  <Video> Native  │              │   CastManager SDK    │
└──────────────────┘              └──────────────────────┘
```

## 🎨 Patrones de Diseño Aplicados

### 1. **Strategy Pattern**
El PlayerTransport es una estrategia intercambiable. El PlayerController no sabe (ni le importa) si está usando Video nativo o Cast.

### 2. **Adapter Pattern**
Cada implementación adapta su API específica (Video component, Cast SDK) a la interface común IPlayerTransport.

### 3. **Observer Pattern**
Los eventos se emiten como Observables, permitiendo múltiples suscriptores sin acoplamiento.

### 4. **Command Pattern**
Los métodos de control (play, pause, seek) son comandos que pueden ser ejecutados, encolados, o cancelados.

## ⚠️ Consideraciones Importantes

### 1. **Estado Asíncrono vs Síncrono**

El Video component de React Native es **declarativo** (se controla via props), mientras que Cast es **imperativo** (se controla via métodos). El transport debe manejar esta diferencia:

```typescript
// VideoTransport NO puede ejecutar play() directamente
// Debe notificar al PlayerController que actualice la prop paused
async play(): Promise<void> {
  // Emitir evento de "solicitud de play"
  this.playRequestSubject.next(true);
}

// CastTransport SÍ puede ejecutar play() directamente
async play(): Promise<void> {
  await this.castManager.play();
}
```

**Solución**: El PlayerController escucha estos eventos y actualiza el estado React correspondiente.

### 2. **Sincronización de Estado**

El transport debe mantener un estado interno sincronizado para responder a `getState()`:

```typescript
private currentState: TransportState = {
  playbackState: 'idle',
  currentTime: 0,
  duration: 0,
  // ... resto de estado
};

// Actualizar en cada evento
handleVideoProgress(data: OnProgressData) {
  this.currentState.currentTime = data.currentTime;
  this.currentState.duration = data.duration;
  this.progressSubject.next(/* ... */);
}

getState(): TransportState {
  return { ...this.currentState }; // Copia defensiva
}
```

### 3. **Manejo de Errores**

Los errores deben ser **convertidos a PlayerError** del sistema existente:

```typescript
private handleVideoError(error: OnVideoErrorData) {
  // Usar el sistema de errores existente
  const playerError = new PlayerError(
    `VIDEO_${error.error.code}`,
    error.error.localizedDescription || 'Unknown error',
    error.error,
    this.isFatalError(error.error.code)
  );
  this.errorSubject.next(playerError);
}

// Para Cast
private handleCastError(error: CastError) {
  const playerError = new PlayerError(
    `CAST_${error.code}`,
    error.message,
    error,
    true // Errores de Cast suelen ser fatales
  );
  this.errorSubject.next(playerError);
}
```

### 4. **Estado de Buffering**

El transport debe emitir eventos de buffering y mantener el estado actualizado:

```typescript
private handleVideoBuffer(data: OnBufferData) {
  // Actualizar estado interno
  this.currentState.isBuffering = data.isBuffering;
  
  // Emitir evento de buffering
  this.bufferingSubject.next({
    isBuffering: data.isBuffering,
    timestamp: Date.now(),
    buffered: this.currentState.buffered,
  });
  
  // También actualizar playbackState si es necesario
  if (data.isBuffering && this.currentState.playbackState === 'playing') {
    this.currentState.playbackState = 'buffering';
    this.stateSubject.next({
      state: 'buffering',
      timestamp: Date.now(),
    });
  } else if (!data.isBuffering && this.currentState.playbackState === 'buffering') {
    this.currentState.playbackState = 'playing';
    this.stateSubject.next({
      state: 'playing',
      timestamp: Date.now(),
    });
  }
}
```

### 5. **Lifecycle y Cleanup**

El transport debe limpiar recursos al destruirse:

```typescript
dispose(): void {
  // Completar todos los subjects
  this.progressSubject.complete();
  this.stateSubject.complete();
  this.bufferingSubject.complete();
  this.errorSubject.complete();
  
  // Limpiar listeners
  this.castManager?.removeAllListeners();
  
  // Liberar referencias
  this.videoRef = null;
}
```

## 📝 Casos de Uso

### Caso 1: Cambio de Source

```typescript
// PlayerController
async changeSource(playlistItem: PlaylistItem) {
  // 1. Cocinar source (no es responsabilidad del transport)
  const cookedSource = await this.sourceManager.cook(playlistItem);
  
  // 2. Cargar en el transport
  await this.transport.load(cookedSource, playlistItem.metadata);
  
  // 3. El transport emitirá eventos de carga
  // El controller reaccionará a esos eventos
}
```

### Caso 2: Seek con Validación DVR

```typescript
// PlayerController
async seek(targetTime: number) {
  // 1. Validar con progress manager (lógica de negocio)
  const validatedTime = this.progressManager.validateSeekTime(targetTime);
  
  // 2. Ejecutar en el transport
  await this.transport.seek(validatedTime);
  
  // 3. El transport emitirá evento de progress actualizado
}
```

### Caso 3: Cambio de Transport (Cast Connect/Disconnect)

```typescript
// PlayerController
switchTransport(newTransport: IPlayerTransport) {
  // 1. Obtener estado actual del transport viejo
  const currentState = this.transport.getState();
  
  // 2. Disponer del transport viejo
  this.transport.dispose();
  
  // 3. Asignar nuevo transport
  this.transport = newTransport;
  
  // 4. Restaurar estado en el nuevo transport
  await this.transport.load(this.currentSource, this.currentMetadata);
  await this.transport.seek(currentState.currentTime);
  if (currentState.playbackState === 'playing') {
    await this.transport.play();
  }
}
```

## ✅ Criterios de Validación

Una implementación de PlayerTransport es correcta si:

1. ✅ **Aislamiento**: No contiene lógica de negocio del player
2. ✅ **Traducción**: Convierte correctamente entre formatos internos y externos
3. ✅ **Eventos**: Emite todos los eventos necesarios de forma consistente (progress, state, buffering, errors, etc.)
4. ✅ **Estado**: Mantiene estado interno sincronizado y accesible, incluyendo buffering
5. ✅ **Capacidades**: Declara correctamente sus limitaciones
6. ✅ **Cleanup**: Libera recursos al destruirse
7. ✅ **Errores**: Convierte errores a PlayerError del sistema existente
8. ✅ **Buffering**: Gestiona y emite eventos de buffering correctamente
9. ✅ **Testeable**: Puede ser mockeado fácilmente para tests

## 🔍 Próximos Pasos

Una vez validado este diseño:
1. Definir **PlayerController** (orquestador principal)
2. Definir **ProgressManager** (unificación VOD/DVR)
3. Definir **SourceManager** (cooking y gestión de sources)
4. Implementar **VideoTransport**
5. Implementar **CastTransport**
6. Refactorizar flavours para usar el nuevo sistema

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Estado**: 📝 Diseño - Pendiente de validación