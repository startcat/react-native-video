# ProgressManagerUnified - Documentación

Documentación completa del **ProgressManagerUnified**, la fachada unificada para gestión de progreso.

## 📋 Índice

- [Descripción](#descripción)
- [Características](#características)
- [API Pública](#api-pública)
- [Configuración](#configuración)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Manejo de Errores](#manejo-de-errores)

## 📖 Descripción

`ProgressManagerUnified` es una fachada que proporciona un único punto de interacción para la gestión de progreso, abstrayendo la complejidad de tener dos managers separados (VOD y DVR).

### Propósito

- **Simplificar** la integración del sistema de progreso
- **Abstraer** la complejidad de VOD vs DVR
- **Detectar automáticamente** el tipo de contenido
- **Delegar** operaciones al manager apropiado
- **Proporcionar** una API consistente

### Ventajas

✅ **API Única**: Mismo código para VOD y DVR  
✅ **Detección Automática**: Identifica el tipo de contenido  
✅ **Transiciones Limpias**: Cambio automático entre tipos  
✅ **Type-Safe**: TypeScript completo  
✅ **Manejo de Errores**: Integrado con PlayerError  

## 🎯 Características

### 1. Delegación Automática

```typescript
// El manager delega automáticamente según el tipo de contenido
await progressManager.updatePlayerData(data);
// → VOD: delega a VODProgressManager
// → Live: delega a DVRProgressManager
```

### 2. Detección de Tipo de Contenido

```typescript
// Detecta automáticamente en onContentLoaded
progressManager.onContentLoaded({
  duration: 3600,
  isLive: true, // ← Detecta que es Live
});

// Cambia automáticamente a DVR manager
```

### 3. Transiciones Limpias

```typescript
// Al cambiar de tipo, resetea el manager anterior
progressManager.setContentType('live');
// → Resetea VOD manager
// → Activa DVR manager
```

### 4. Valores Seguros

```typescript
// Métodos DVR devuelven valores seguros cuando es VOD
progressManager.getCurrentProgram(); // → null si es VOD
progressManager.isAtLiveEdge(); // → false si es VOD
progressManager.goToLive(); // → null si es VOD
```

## 📚 API Pública

### Configuración

#### `initialize(config: ProgressManagerUnifiedConfig): void`

Inicializa el manager con la configuración necesaria.

```typescript
progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => console.log('VOD:', data),
    currentTime: 0,
    duration: 0,
  },
  dvr: {
    onProgressUpdate: (data) => console.log('DVR:', data),
    onModeChange: (data) => console.log('Mode:', data.playbackType),
    onProgramChange: (data) => console.log('Program:', data.currentProgram),
    getEPGProgramAt: fetchEPGProgram,
  },
  logger: myLogger,
  initialContentType: 'vod',
});
```

**Parámetros:**
- `config.vod` - Configuración para VOD manager
- `config.dvr` - Configuración para DVR manager
- `config.logger` - Logger compartido (opcional)
- `config.loggerEnabled` - Habilitar logging (opcional)
- `config.loggerLevel` - Nivel de log (opcional)
- `config.initialContentType` - Tipo inicial: 'vod' | 'live'

**Throws:**
- `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED` - Si ya está inicializado
- `PLAYER_PROGRESS_MANAGER_CREATION_FAILED` - Si falla la creación

#### `setContentType(contentType: 'vod' | 'live'): void`

Cambia el tipo de contenido (VOD ↔ Live).

```typescript
progressManager.setContentType('live');
```

**Comportamiento:**
- Resetea el manager anterior
- Activa el nuevo manager
- Emite log del cambio

### Actualización de Datos

#### `updatePlayerData(data: ProgressManagerUnifiedPlayerData): Promise<void>`

Actualiza los datos del reproductor. Delega automáticamente al manager apropiado.

```typescript
await progressManager.updatePlayerData({
  currentTime: 120,
  duration: 3600,
  seekableRange: { start: 0, end: 3600 },
  isPaused: false,
  isBuffering: false,
});
```

**Parámetros:**
- `data.currentTime` - Tiempo actual en segundos
- `data.duration` - Duración total (opcional para DVR)
- `data.seekableRange` - Rango seekable (importante para DVR)
- `data.isPaused` - Si está pausado
- `data.isBuffering` - Si está buffering

**Throws:**
- `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED` - Si no está inicializado
- `PLAYER_PROGRESS_UPDATE_FAILED` - Si falla la actualización

#### `updatePausedState(isPaused: boolean): void`

Actualiza el estado de pausa.

```typescript
progressManager.updatePausedState(true);
```

**Nota:** El estado se maneja internamente en `updatePlayerData`. Este método existe para compatibilidad.

#### `onContentLoaded(data: ProgressManagerUnifiedContentLoadData): void`

Notifica que el contenido ha cargado. Detecta automáticamente el tipo.

```typescript
progressManager.onContentLoaded({
  duration: 3600,
  isLive: true,
  seekableRange: { start: 0, end: 3600 },
  epgUrl: 'https://api.example.com/epg',
});
```

**Parámetros:**
- `data.duration` - Duración del contenido
- `data.isLive` - Si es contenido en vivo
- `data.seekableRange` - Rango seekable (opcional)
- `data.epgUrl` - URL del EPG (opcional)

**Comportamiento:**
- Detecta automáticamente VOD vs Live
- Cambia el `contentType` si es necesario
- Resetea el manager anterior si cambia

### Obtención de Valores

#### `getSliderValues(): SliderValues`

Obtiene los valores actuales del slider. Funciona para VOD y DVR.

```typescript
const values = progressManager.getSliderValues();

// VOD
console.log(values.progress); // Tiempo actual
console.log(values.minimumValue); // 0
console.log(values.maximumValue); // Duración

// DVR
console.log(values.progress); // Timestamp actual
console.log(values.liveEdge); // Timestamp del directo
console.log(values.liveEdgeOffset); // Segundos detrás del directo
console.log(values.isLiveEdgePosition); // ¿Está en directo?
```

**Retorna:** `SliderValues` con propiedades según el tipo de contenido

#### `getCurrentTime(): number`

Obtiene el tiempo actual de reproducción.

```typescript
const currentTime = progressManager.getCurrentTime();
```

**Retorna:**
- VOD: Tiempo absoluto en segundos
- DVR: Tiempo relativo a la ventana DVR

#### `getDuration(): number`

Obtiene la duración total.

```typescript
const duration = progressManager.getDuration();
```

**Retorna:**
- VOD: Duración del video
- DVR: Tamaño de la ventana DVR

#### `isLiveContent(): boolean`

Verifica si el contenido actual es live/DVR.

```typescript
const isLive = progressManager.isLiveContent();
```

**Retorna:** `true` si es Live, `false` si es VOD

#### `isAtLiveEdge(): boolean`

Verifica si estamos en el edge (live) del stream DVR.

```typescript
const isLive = progressManager.isAtLiveEdge();
```

**Retorna:** `true` si está en directo, `false` en caso contrario o si es VOD

### Operaciones de Seek

#### `sliderValueToSeekTime(sliderValue: number): number`

Convierte un valor del slider a tiempo de seek.

```typescript
const seekTime = progressManager.sliderValueToSeekTime(0.5); // 50%
```

**Parámetros:**
- `sliderValue` - Valor del slider (0-1 o tiempo absoluto según el manager)

**Retorna:** Tiempo de seek validado

#### `validateSeekTime(time: number): number`

Valida un tiempo de seek según las restricciones del contenido.

```typescript
const validTime = progressManager.validateSeekTime(requestedTime);
```

**Parámetros:**
- `time` - Tiempo objetivo

**Retorna:** Tiempo validado dentro de los límites permitidos

#### `calculateSkipTime(direction: 'forward' | 'backward', seconds?: number): number`

Calcula el tiempo para saltar adelante/atrás.

```typescript
const skipTime = progressManager.calculateSkipTime('forward', 10);
```

**Parámetros:**
- `direction` - 'forward' o 'backward'
- `seconds` - Segundos a saltar (por defecto 10)

**Retorna:** Tiempo de seek validado

### Callbacks DVR

#### `onDVRModeChange(callback: (mode: DVR_PLAYBACK_TYPE) => void): void`

Registra callback para cambios de modo DVR.

```typescript
progressManager.onDVRModeChange((mode) => {
  console.log('Mode changed to:', mode);
});
```

**Parámetros:**
- `callback` - Función a llamar cuando cambia el modo

#### `onDVRProgramChange(callback: (program: any | null) => void): void`

Registra callback para cambios de programa DVR.

```typescript
progressManager.onDVRProgramChange((program) => {
  if (program) {
    console.log('New program:', program.title);
  }
});
```

**Parámetros:**
- `callback` - Función a llamar cuando cambia el programa

### Gestión de Programas DVR

#### `getCurrentProgram(): Promise<any | null>`

Obtiene el programa actual (solo DVR).

```typescript
const program = await progressManager.getCurrentProgram();
if (program) {
  console.log('Title:', program.title);
  console.log('Start:', program.startDate);
  console.log('End:', program.endDate);
}
```

**Retorna:** Programa actual o `null` si no hay o es VOD

#### `getAvailablePrograms(): any[]`

Obtiene todos los programas disponibles (solo DVR).

```typescript
const programs = progressManager.getAvailablePrograms();
```

**Retorna:** Array de programas o vacío si es VOD

#### `seekToProgram(programId: string): number | null`

Salta a un programa específico (solo DVR).

```typescript
const seekTime = progressManager.seekToProgram('program-123');
if (seekTime !== null) {
  await transport.seek(seekTime);
}
```

**Parámetros:**
- `programId` - ID del programa

**Retorna:** Tiempo de seek o `null` si no es posible

### Métodos Adicionales

#### `startManualSeeking(): void`

Inicia el seguimiento manual de seek (DVR).

```typescript
// Al iniciar drag del slider
progressManager.startManualSeeking();
```

#### `endManualSeeking(): void`

Finaliza el seguimiento manual de seek (DVR).

```typescript
// Al soltar el slider
progressManager.endManualSeeking();
```

#### `goToLive(): number | null`

Navega al edge en vivo (solo DVR).

```typescript
const seekTime = progressManager.goToLive();
// seekTime es null, el método hace el seek internamente
```

**Retorna:** `null` (el método ejecuta el seek internamente)

#### `setPlaybackType(playbackType: DVR_PLAYBACK_TYPE): void`

Establece el tipo de reproducción DVR.

```typescript
import { DVR_PLAYBACK_TYPE } from '@player/core/progress';

progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);
```

**Parámetros:**
- `playbackType` - WINDOW, PROGRAM o PLAYLIST

#### `getStats(): any`

Obtiene estadísticas del manager activo.

```typescript
const stats = progressManager.getStats();
console.log('Current time:', stats.currentTime);
console.log('Duration:', stats.duration);
console.log('Is initialized:', stats.isInitialized);
```

**Retorna:** Objeto con estadísticas del manager

### Lifecycle

#### `reset(): void`

Resetea el estado del manager. Útil al cambiar de contenido.

```typescript
progressManager.reset();
```

**Comportamiento:**
- Resetea ambos managers (VOD y DVR)
- Mantiene la configuración
- No cambia el tipo de contenido

#### `dispose(): void`

Limpia recursos y callbacks.

```typescript
// Al desmontar el componente
progressManager.dispose();
```

**Comportamiento:**
- Llama a `destroy()` en ambos managers
- Limpia referencias
- Marca como no inicializado

## 🎯 Ejemplos de Uso

### Ejemplo 1: Configuración Completa

```typescript
const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => {
      updateVODUI({
        currentTime: data.currentTime,
        duration: data.duration,
        progress: data.progress,
      });
    },
  },
  dvr: {
    onProgressUpdate: (data) => {
      updateDVRUI({
        currentTime: data.progressDatum,
        liveEdge: data.liveEdge,
        offset: data.liveEdgeOffset,
        isLive: data.isLiveEdgePosition,
      });
    },
    onModeChange: (data) => {
      console.log('DVR mode:', data.playbackType);
    },
    onProgramChange: (data) => {
      if (data.currentProgram) {
        showProgramInfo(data.currentProgram);
      }
    },
    getEPGProgramAt: async (timestamp) => {
      return await api.getEPGProgram(timestamp);
    },
  },
  logger: createLogger('ProgressManager'),
  loggerEnabled: true,
  initialContentType: 'vod',
});
```

### Ejemplo 2: Manejo de Contenido Dinámico

```typescript
// Detecta automáticamente el tipo
const handleContentLoaded = (event: OnLoadData) => {
  progressManager.onContentLoaded({
    duration: event.duration,
    isLive: event.isLive,
    seekableRange: event.seekableRange,
  });
  
  // El manager cambia automáticamente a VOD o DVR
  const isLive = progressManager.isLiveContent();
  console.log('Content type:', isLive ? 'Live' : 'VOD');
};
```

### Ejemplo 3: Seek con Validación

```typescript
const handleSeek = async (sliderValue: number) => {
  try {
    // Convertir valor del slider a tiempo
    const seekTime = progressManager.sliderValueToSeekTime(sliderValue);
    
    // Validar tiempo
    const validTime = progressManager.validateSeekTime(seekTime);
    
    // Ejecutar seek
    await videoRef.current?.seek(validTime);
  } catch (error) {
    if (error instanceof PlayerError) {
      console.error('Seek error:', error.message);
      showError(error.message);
    }
  }
};
```

### Ejemplo 4: DVR con EPG

```typescript
// Configurar con EPG
progressManager.initialize({
  dvr: {
    getEPGProgramAt: async (timestamp) => {
      const response = await fetch(`/api/epg?time=${timestamp}`);
      return await response.json();
    },
    onProgramChange: (data) => {
      if (data.currentProgram) {
        updateProgramUI({
          title: data.currentProgram.title,
          description: data.currentProgram.description,
          startTime: new Date(data.currentProgram.startDate),
          endTime: new Date(data.currentProgram.endDate),
        });
      }
    },
  },
});

// Obtener programa actual
const program = await progressManager.getCurrentProgram();
```

## ⚠️ Manejo de Errores

El `ProgressManagerUnified` usa el sistema `PlayerError`. Ver [Manejo de Errores](./ErrorHandling.md) para detalles completos.

### Errores Comunes

```typescript
try {
  await progressManager.updatePlayerData(data);
} catch (error) {
  if (error instanceof PlayerError) {
    switch (error.key) {
      case 'PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED':
        console.error('Manager not initialized');
        break;
      case 'PLAYER_PROGRESS_UPDATE_FAILED':
        console.error('Update failed:', error.context);
        break;
      case 'PLAYER_PROGRESS_INVALID_STATE':
        console.error('Invalid state:', error.context);
        break;
    }
  }
}
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa de uso
- [API Reference](./API.md) - Referencia completa de la API
- [DVR Manager](./DVRProgressManager.md) - Documentación del DVR manager
- [VOD Manager](./VODProgressManager.md) - Documentación del VOD manager

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
