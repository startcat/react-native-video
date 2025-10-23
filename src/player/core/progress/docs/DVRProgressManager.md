# DVRProgressManager - Documentación

Documentación del **DVRProgressManagerClass**, manager especializado para contenido Live/DVR.

## 📋 Índice

- [Descripción](#descripción)
- [Conceptos Clave](#conceptos-clave)
- [Modos de Reproducción](#modos-de-reproducción)
- [Integración con EPG](#integración-con-epg)
- [Reglas Fundamentales](#reglas-fundamentales)

## 📖 Descripción

`DVRProgressManagerClass` gestiona el progreso de reproducción para contenido en directo con ventana DVR (Digital Video Recording). Permite pausar, retroceder y avanzar en streams en vivo dentro de una ventana temporal.

### Características

- ✅ **Ventana DVR dinámica**: Crece naturalmente con el tiempo
- ✅ **Live Edge Tracking**: Seguimiento del punto en directo
- ✅ **Múltiples modos**: WINDOW, PROGRAM, PLAYLIST
- ✅ **Integración EPG**: Información de programas
- ✅ **Gestión de pausas**: Offset crece durante pausa
- ✅ **Seeking inteligente**: Validación automática de rangos

## 🎯 Conceptos Clave

### Live Edge

El **live edge** es el punto actual del directo. Siempre es `Date.now()` (o `endStreamDate` si está definido).

```typescript
const values = progressManager.getSliderValues();
console.log('Live edge:', new Date(values.liveEdge));
```

**Importante:**
- Es global, no depende del modo de reproducción
- Se actualiza constantemente
- Es la referencia para calcular offsets

### Live Edge Offset

El **offset** es cuántos segundos estás por detrás del directo.

```typescript
const values = progressManager.getSliderValues();
console.log('Offset:', values.liveEdgeOffset, 'seconds behind live');

// Verificar si estás en directo
const isLive = values.isLiveEdgePosition; // true si offset <= tolerancia
```

**Comportamiento:**
- **En reproducción**: Se mantiene constante (si no haces seek)
- **En pausa**: Crece cada segundo
- **En seek atrás**: Aumenta
- **En goToLive()**: Se vuelve 0

### Ventana DVR

La **ventana DVR** es el rango temporal disponible para navegar.

```typescript
const values = progressManager.getSliderValues();
console.log('Window start:', new Date(values.windowStart));
console.log('Window size:', values.duration, 'seconds');
```

**Características:**
- Crece naturalmente con el tiempo
- Se calcula desde `seekableRange` del player
- `windowStart = liveEdge - seekableDuration`

### Progress Datum

El **progress datum** es el timestamp absoluto de tu posición actual.

```typescript
const values = progressManager.getSliderValues();
console.log('Current position:', new Date(values.progressDatum));
```

**Cálculo:**
```typescript
progressDatum = windowStart + (currentTime * 1000)
```

### Seekable Range

El **seekable range** es el rango que el player puede reproducir.

```typescript
// Viene del player/cast
const seekableRange = {
  start: 0,        // Inicio relativo
  end: 3600,       // Fin relativo (segundos)
};

// Es LA fuente de verdad para la ventana DVR
```

**Importante:**
- Prevalece sobre cualquier dato del CMS
- Define los límites reales de navegación
- Debe proporcionarse en cada `updatePlayerData()`

## 🎮 Modos de Reproducción

### WINDOW (Por defecto)

Slider representa toda la ventana DVR disponible.

```typescript
import { DVR_PLAYBACK_TYPE } from '@player/core/progress';

progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW);
```

**Características:**
- Slider: `windowStart` → `liveEdge`
- Inicia en `liveEdge` (directo)
- EPG se consulta por cambios significativos
- Modo más flexible

**Uso típico:** Streams sin restricciones de programa

### PROGRAM

Slider limitado a un programa específico.

```typescript
progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);
```

**Características:**
- Slider: `programStart` → `liveEdge`
- Inicia en el inicio del programa indicado
- Mínimo = inicio del programa
- Máximo = `liveEdge` (no el final del programa)

**Uso típico:** Ver un programa específico desde el inicio

### PLAYLIST

Slider se adapta al programa actual automáticamente.

```typescript
progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);
```

**Características:**
- Slider: `currentProgram.startDate` → `currentProgram.endDate`
- Inicia en `liveEdge` (directo)
- Cambio automático de programa
- `isLiveProgramRestricted` limita navegación

**Uso típico:** Navegación por programas EPG

**Comportamiento:**
```typescript
// Si isLiveProgramRestricted = true
// → Solo puedes navegar dentro del programa actual

// Si isLiveProgramRestricted = false
// → Puedes navegar a programas anteriores
```

### PLAYLIST_EXPAND_RIGHT

Variante de PLAYLIST con expansión a la derecha.

```typescript
progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT);
```

**Características:**
- Similar a PLAYLIST
- Permite expandir hacia programas futuros

## 📺 Integración con EPG

### Configurar EPG

```typescript
progressManager.initialize({
  dvr: {
    getEPGProgramAt: async (timestamp) => {
      // Consultar tu servicio EPG
      const response = await fetch(`/api/epg?time=${timestamp}`);
      return await response.json();
    },
    onEPGRequest: (timestamp) => {
      console.log('EPG requested for:', new Date(timestamp));
    },
    onEPGError: (data) => {
      console.error('EPG error:', data.error);
      console.log('Retry count:', data.retryCount);
    },
    onProgramChange: (data) => {
      if (data.currentProgram) {
        console.log('New program:', data.currentProgram.title);
      }
    },
  },
});
```

### Formato de Programa

```typescript
interface EPGProgram {
  title: string;
  description: string;
  startDate: number;    // Unix timestamp (ms)
  endDate: number;      // Unix timestamp (ms)
  duration: number;     // Segundos
  id?: string;
  imageUrl?: string;
  // ... otros campos opcionales
}
```

### Obtener Programa Actual

```typescript
const program = await progressManager.getCurrentProgram();

if (program) {
  console.log('Title:', program.title);
  console.log('Description:', program.description);
  console.log('Start:', new Date(program.startDate));
  console.log('End:', new Date(program.endDate));
  console.log('Duration:', program.duration, 'seconds');
}
```

### Reintentos EPG

El sistema reintenta automáticamente si falla la consulta EPG:

```typescript
// Configuración de reintentos (interno)
const EPG_RETRY_DELAYS = [1000, 2000, 5000]; // 1s, 2s, 5s

// Callback de error incluye retry count
onEPGError: (data) => {
  console.log('Retry', data.retryCount, 'of 3');
  
  if (data.retryCount >= 3) {
    // Máximo de reintentos alcanzado
    showError('No se pudo cargar información del programa');
  }
}
```

## 📏 Reglas Fundamentales

### 1. seekableRange es la Fuente de Verdad

```typescript
// ✅ CORRECTO
await progressManager.updatePlayerData({
  currentTime: event.currentTime,
  seekableRange: event.seekableRange, // Del player
});

// ❌ INCORRECTO
await progressManager.updatePlayerData({
  currentTime: event.currentTime,
  duration: 3600, // No usar duration fijo
});
```

### 2. Live Edge es Global

```typescript
// El liveEdge es el mismo en todos los modos
const values = progressManager.getSliderValues();

// WINDOW mode
console.log('Live edge:', values.liveEdge);

// PROGRAM mode
console.log('Live edge:', values.liveEdge); // Mismo valor

// PLAYLIST mode
console.log('Live edge:', values.liveEdge); // Mismo valor
```

### 3. Offset Crece Durante Pausa

```typescript
// En reproducción: offset constante
// t=0: offset = 10s
// t=1: offset = 10s
// t=2: offset = 10s

// En pausa: offset crece
// t=0: offset = 10s (pausa)
// t=1: offset = 11s
// t=2: offset = 12s
// t=3: offset = 13s
```

### 4. Ventana Crece Naturalmente

```typescript
// Inicio: ventana = 1 hora
// Después de 30 min: ventana = 1.5 horas
// Después de 1 hora: ventana = 2 horas

// La ventana crece automáticamente con el tiempo
```

### 5. currentTime es Relativo

```typescript
// currentTime es relativo al windowStart
// NO al programa en modo PLAYLIST

// Ejemplo:
// windowStart = 10:00:00
// currentTime = 600 (segundos)
// → Posición real = 10:10:00
```

### 6. Modos Solo Afectan al Slider

```typescript
// Los cálculos base son independientes del modo
// Solo cambian minimumValue y maximumValue del slider

// WINDOW: min = windowStart, max = liveEdge
// PROGRAM: min = programStart, max = liveEdge
// PLAYLIST: min = programStart, max = programEnd
```

## 🔧 Operaciones Comunes

### Ir al Directo

```typescript
progressManager.goToLive();

// Verifica después
setTimeout(() => {
  const isLive = progressManager.isAtLiveEdge();
  console.log('Is at live:', isLive); // true
}, 500);
```

### Seek Manual con Slider

```typescript
// Inicio del drag
progressManager.startManualSeeking();
// → Desactiva actualización automática de live edge

// Durante el drag
const seekTime = progressManager.sliderValueToSeekTime(sliderValue);
showPreview(seekTime);

// Fin del drag
progressManager.endManualSeeking();
// → Reactiva actualización automática
await transport.seek(seekTime);
```

### Validar Seek

```typescript
const requestedTime = 1200; // 20 minutos

try {
  const validTime = progressManager.validateSeekTime(requestedTime);
  await transport.seek(validTime);
} catch (error) {
  if (error instanceof PlayerError) {
    const range = error.context?.seekableRange;
    console.log(`Valid: ${range.start}s - ${range.end}s`);
  }
}
```

## ⚠️ Consideraciones Importantes

### 1. Actualización Durante Pausa

```typescript
// El player NO envía datos en pausa
// El manager DEBE emitir updates cada 1 segundo

// Esto se maneja automáticamente internamente
// Solo asegúrate de pasar isPaused correctamente

await progressManager.updatePlayerData({
  currentTime: event.currentTime,
  seekableRange: event.seekableRange,
  isPaused: true, // ¡IMPORTANTE!
});
```

### 2. Consistencia de Valores

```typescript
// Antes de emitir update, el manager valida:
// - progressDatum es coherente
// - liveEdgeOffset es correcto
// - windowStart está actualizado

// Si hay inconsistencias, se corrigen automáticamente
```

### 3. Inicialización Progresiva

```typescript
// El manager se inicializa progresivamente:
// 1. hasReceivedPlayerData = false
// 2. Recibe primer updatePlayerData
// 3. hasReceivedPlayerData = true
// 4. seekableRange válido (end > 0)
// 5. isInitialized = true

// No necesita setDVRWindowSeconds del CMS
```

### 4. Cast vs Player Normal

```typescript
// Los datos pueden venir en formatos diferentes

// Player normal:
{
  currentTime: 120,
  seekableRange: { start: 0, end: 3600 }
}

// Cast:
{
  currentTime: 120,
  seekableRange: { start: 0, end: 3600 }
}

// El manager normaliza automáticamente
```

## 📚 Ver También

- [Reglas Fundamentales](../instructions/rules.md) - Invariantes críticos
- [Guía de Uso](./Usage.md) - Guía completa
- [ProgressManagerUnified](./ProgressManagerUnified.md) - Fachada unificada
- [Examples](./Examples.md) - Ejemplos de DVR

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
