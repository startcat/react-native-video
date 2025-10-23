# API Reference - Progress Management System

Referencia completa de la API del sistema de gestión de progreso.

## 📋 Índice

- [ProgressManagerUnified](#progressmanagerunified)
- [Tipos TypeScript](#tipos-typescript)
- [Enums](#enums)
- [Interfaces](#interfaces)

## 🎯 ProgressManagerUnified

Fachada unificada para gestión de progreso VOD y DVR.

### Constructor

```typescript
constructor()
```

Crea una nueva instancia de `ProgressManagerUnified`.

**Ejemplo:**
```typescript
const progressManager = new ProgressManagerUnified();
```

---

### initialize

```typescript
initialize(config: ProgressManagerUnifiedConfig): void
```

Inicializa el manager con la configuración necesaria.

**Parámetros:**
- `config: ProgressManagerUnifiedConfig` - Configuración para VOD y DVR managers

**Throws:**
- `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED` - Si ya está inicializado
- `PLAYER_PROGRESS_MANAGER_CREATION_FAILED` - Si falla la creación

**Ejemplo:**
```typescript
progressManager.initialize({
  vod: { onProgressUpdate: handleVODProgress },
  dvr: { onProgressUpdate: handleDVRProgress },
  logger: myLogger,
  initialContentType: 'vod',
});
```

---

### setContentType

```typescript
setContentType(contentType: 'vod' | 'live'): void
```

Cambia el tipo de contenido (VOD ↔ Live).

**Parámetros:**
- `contentType: 'vod' | 'live'` - Tipo de contenido

**Ejemplo:**
```typescript
progressManager.setContentType('live');
```

---

### updatePlayerData

```typescript
async updatePlayerData(data: ProgressManagerUnifiedPlayerData): Promise<void>
```

Actualiza los datos del reproductor. Delega automáticamente al manager apropiado.

**Parámetros:**
- `data: ProgressManagerUnifiedPlayerData` - Datos del reproductor

**Throws:**
- `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED` - Si no está inicializado
- `PLAYER_PROGRESS_UPDATE_FAILED` - Si falla la actualización

**Ejemplo:**
```typescript
await progressManager.updatePlayerData({
  currentTime: 120,
  duration: 3600,
  seekableRange: { start: 0, end: 3600 },
  isPaused: false,
  isBuffering: false,
});
```

---

### updatePausedState

```typescript
updatePausedState(isPaused: boolean): void
```

Actualiza el estado de pausa.

**Parámetros:**
- `isPaused: boolean` - Si está pausado

**Nota:** El estado se maneja internamente en `updatePlayerData`.

**Ejemplo:**
```typescript
progressManager.updatePausedState(true);
```

---

### onContentLoaded

```typescript
onContentLoaded(data: ProgressManagerUnifiedContentLoadData): void
```

Notifica que el contenido ha cargado. Detecta automáticamente el tipo.

**Parámetros:**
- `data: ProgressManagerUnifiedContentLoadData` - Datos de carga

**Ejemplo:**
```typescript
progressManager.onContentLoaded({
  duration: 3600,
  isLive: true,
  seekableRange: { start: 0, end: 3600 },
});
```

---

### getSliderValues

```typescript
getSliderValues(): SliderValues
```

Obtiene los valores actuales del slider.

**Retorna:** `SliderValues` - Valores del slider

**Ejemplo:**
```typescript
const values = progressManager.getSliderValues();
console.log('Progress:', values.progress);
console.log('Duration:', values.duration);
```

---

### getCurrentTime

```typescript
getCurrentTime(): number
```

Obtiene el tiempo actual de reproducción.

**Retorna:** `number` - Tiempo actual en segundos

**Ejemplo:**
```typescript
const currentTime = progressManager.getCurrentTime();
```

---

### getDuration

```typescript
getDuration(): number
```

Obtiene la duración total.

**Retorna:** `number` - Duración en segundos

**Ejemplo:**
```typescript
const duration = progressManager.getDuration();
```

---

### isLiveContent

```typescript
isLiveContent(): boolean
```

Verifica si el contenido actual es live/DVR.

**Retorna:** `boolean` - `true` si es Live, `false` si es VOD

**Ejemplo:**
```typescript
const isLive = progressManager.isLiveContent();
```

---

### isAtLiveEdge

```typescript
isAtLiveEdge(): boolean
```

Verifica si estamos en el edge (live) del stream DVR.

**Retorna:** `boolean` - `true` si está en directo

**Ejemplo:**
```typescript
const isLive = progressManager.isAtLiveEdge();
```

---

### sliderValueToSeekTime

```typescript
sliderValueToSeekTime(sliderValue: number): number
```

Convierte un valor del slider a tiempo de seek.

**Parámetros:**
- `sliderValue: number` - Valor del slider

**Retorna:** `number` - Tiempo de seek

**Ejemplo:**
```typescript
const seekTime = progressManager.sliderValueToSeekTime(0.5);
```

---

### validateSeekTime

```typescript
validateSeekTime(time: number): number
```

Valida un tiempo de seek según las restricciones del contenido.

**Parámetros:**
- `time: number` - Tiempo objetivo

**Retorna:** `number` - Tiempo validado

**Ejemplo:**
```typescript
const validTime = progressManager.validateSeekTime(requestedTime);
```

---

### calculateSkipTime

```typescript
calculateSkipTime(direction: 'forward' | 'backward', seconds?: number): number
```

Calcula el tiempo para saltar adelante/atrás.

**Parámetros:**
- `direction: 'forward' | 'backward'` - Dirección del skip
- `seconds?: number` - Segundos a saltar (por defecto 10)

**Retorna:** `number` - Tiempo de seek validado

**Ejemplo:**
```typescript
const skipTime = progressManager.calculateSkipTime('forward', 10);
```

---

### onDVRModeChange

```typescript
onDVRModeChange(callback: (mode: DVR_PLAYBACK_TYPE) => void): void
```

Registra callback para cambios de modo DVR.

**Parámetros:**
- `callback: (mode: DVR_PLAYBACK_TYPE) => void` - Función callback

**Ejemplo:**
```typescript
progressManager.onDVRModeChange((mode) => {
  console.log('Mode:', mode);
});
```

---

### onDVRProgramChange

```typescript
onDVRProgramChange(callback: (program: any | null) => void): void
```

Registra callback para cambios de programa DVR.

**Parámetros:**
- `callback: (program: any | null) => void` - Función callback

**Ejemplo:**
```typescript
progressManager.onDVRProgramChange((program) => {
  if (program) console.log('Program:', program.title);
});
```

---

### getCurrentProgram

```typescript
async getCurrentProgram(): Promise<any | null>
```

Obtiene el programa actual (solo DVR).

**Retorna:** `Promise<any | null>` - Programa actual o `null`

**Ejemplo:**
```typescript
const program = await progressManager.getCurrentProgram();
```

---

### getAvailablePrograms

```typescript
getAvailablePrograms(): any[]
```

Obtiene todos los programas disponibles (solo DVR).

**Retorna:** `any[]` - Array de programas

**Ejemplo:**
```typescript
const programs = progressManager.getAvailablePrograms();
```

---

### seekToProgram

```typescript
seekToProgram(programId: string): number | null
```

Salta a un programa específico (solo DVR).

**Parámetros:**
- `programId: string` - ID del programa

**Retorna:** `number | null` - Tiempo de seek o `null`

**Ejemplo:**
```typescript
const seekTime = progressManager.seekToProgram('program-123');
```

---

### startManualSeeking

```typescript
startManualSeeking(): void
```

Inicia el seguimiento manual de seek (DVR).

**Ejemplo:**
```typescript
progressManager.startManualSeeking();
```

---

### endManualSeeking

```typescript
endManualSeeking(): void
```

Finaliza el seguimiento manual de seek (DVR).

**Ejemplo:**
```typescript
progressManager.endManualSeeking();
```

---

### goToLive

```typescript
goToLive(): number | null
```

Navega al edge en vivo (solo DVR).

**Retorna:** `number | null` - `null` (ejecuta seek internamente)

**Ejemplo:**
```typescript
progressManager.goToLive();
```

---

### setPlaybackType

```typescript
setPlaybackType(playbackType: DVR_PLAYBACK_TYPE): void
```

Establece el tipo de reproducción DVR.

**Parámetros:**
- `playbackType: DVR_PLAYBACK_TYPE` - Tipo de reproducción

**Ejemplo:**
```typescript
progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);
```

---

### getStats

```typescript
getStats(): any
```

Obtiene estadísticas del manager activo.

**Retorna:** `any` - Objeto con estadísticas

**Ejemplo:**
```typescript
const stats = progressManager.getStats();
```

---

### reset

```typescript
reset(): void
```

Resetea el estado del manager.

**Ejemplo:**
```typescript
progressManager.reset();
```

---

### dispose

```typescript
dispose(): void
```

Limpia recursos y callbacks.

**Ejemplo:**
```typescript
progressManager.dispose();
```

---

## 📦 Tipos TypeScript

### ProgressManagerUnifiedConfig

```typescript
interface ProgressManagerUnifiedConfig {
  vod?: ProgressManagerUnifiedVODConfig;
  dvr?: ProgressManagerUnifiedDVRConfig;
  initialContentType?: 'vod' | 'live';
  logger?: Logger;
  loggerEnabled?: boolean;
  loggerLevel?: LogLevel;
}
```

### ProgressManagerUnifiedVODConfig

```typescript
interface ProgressManagerUnifiedVODConfig {
  onProgressUpdate?: ((data: any) => void) | null;
  currentTime?: number;
  duration?: number;
  isPaused?: boolean;
  isBuffering?: boolean;
  autoSeekToEnd?: boolean;
  enableLooping?: boolean;
}
```

### ProgressManagerUnifiedDVRConfig

```typescript
interface ProgressManagerUnifiedDVRConfig {
  onModeChange?: ((data: ModeChangeData) => void) | null;
  onProgramChange?: ((data: ProgramChangeData) => void) | null;
  onProgressUpdate?: ((data: any) => void) | null;
  onEPGRequest?: ((timestamp: number) => void) | null;
  onEPGError?: ((data: EPGErrorData) => void) | null;
  getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
  currentTime?: number;
  duration?: number;
  isPaused?: boolean;
  isBuffering?: boolean;
  dvrWindowSeconds?: number;
  playbackType?: DVR_PLAYBACK_TYPE;
}
```

### ProgressManagerUnifiedPlayerData

```typescript
interface ProgressManagerUnifiedPlayerData {
  currentTime: number;
  duration?: number;
  seekableRange?: SeekableRange;
  isPaused?: boolean;
  isBuffering?: boolean;
}
```

### ProgressManagerUnifiedContentLoadData

```typescript
interface ProgressManagerUnifiedContentLoadData {
  duration: number;
  isLive: boolean;
  seekableRange?: SeekableRange;
  epgUrl?: string;
}
```

### SliderValues

```typescript
interface SliderValues {
  progress: number;
  minimumValue: number;
  maximumValue: number;
  duration: number;
  
  // DVR específico
  liveEdge?: number;
  liveEdgeOffset?: number;
  isLiveEdgePosition?: boolean;
  windowStart?: number;
  progressDatum?: number;
  isLive?: boolean;
}
```

### SeekableRange

```typescript
interface SeekableRange {
  start: number;
  end: number;
}
```

### ModeChangeData

```typescript
interface ModeChangeData {
  playbackType: DVR_PLAYBACK_TYPE;
  previousPlaybackType: DVR_PLAYBACK_TYPE;
}
```

### ProgramChangeData

```typescript
interface ProgramChangeData {
  currentProgram: any | null;
  previousProgram: any | null;
}
```

### EPGErrorData

```typescript
interface EPGErrorData {
  error: string;
  timestamp: number;
  retryCount: number;
}
```

## 🏷️ Enums

### DVR_PLAYBACK_TYPE

```typescript
enum DVR_PLAYBACK_TYPE {
  WINDOW = 'WINDOW',
  PROGRAM = 'PROGRAM',
  PLAYLIST = 'PLAYLIST',
  PLAYLIST_EXPAND_RIGHT = 'PLAYLIST_EXPAND_RIGHT',
}
```

**Valores:**
- `WINDOW` - Slider representa toda la ventana DVR
- `PROGRAM` - Slider limitado a un programa específico
- `PLAYLIST` - Slider se adapta al programa actual
- `PLAYLIST_EXPAND_RIGHT` - Playlist con expansión a la derecha

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa de uso
- [ProgressManagerUnified](./ProgressManagerUnified.md) - Documentación detallada
- [Ejemplos](./Examples.md) - Ejemplos de uso
- [Error Handling](./ErrorHandling.md) - Manejo de errores

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
