# ProgressManagerUnified - Fachada Unificada de Progress Tracking

## 📋 Propósito

El **ProgressManagerUnified** es una fachada que proporciona un **único punto de interacción** para la gestión de progreso de reproducción, abstrayendo la complejidad de tener dos managers separados (VOD y DVR). Delega automáticamente las operaciones al manager apropiado según el tipo de contenido.

## 🎯 Responsabilidades

### ✅ Lo que DEBE hacer:
1. **Delegar operaciones** al manager VOD o DVR según el tipo de contenido
2. **Detectar automáticamente** si el contenido es VOD o Live/DVR
3. **Proporcionar API unificada** que funcione para ambos tipos de contenido
4. **Gestionar transiciones** entre VOD y DVR (ej: cambio de contenido)
5. **Exponer callbacks unificados** que funcionen para ambos tipos
6. **Mantener estado sincronizado** entre ambos managers

### ❌ Lo que NO debe hacer:
- ❌ Reimplementar lógica de VOD o DVR (usa los managers existentes)
- ❌ Gestionar el reproductor directamente (eso es del PlayerController)
- ❌ Emitir eventos de analytics (eso es del PlayerController)
- ❌ Gestionar sources o playlists

## 🔌 Interface Principal

```typescript
interface IProgressManagerUnified {
  // === CONFIGURACIÓN ===
  
  /**
   * Inicializa el manager con la configuración necesaria
   * @param config Configuración para VOD y DVR managers
   */
  initialize(config: ProgressManagerConfig): void;
  
  /**
   * Cambia el tipo de contenido (VOD <-> DVR)
   * @param contentType Tipo de contenido actual
   */
  setContentType(contentType: 'vod' | 'live'): void;
  
  // === ACTUALIZACIÓN DE DATOS ===
  
  /**
   * Actualiza los datos del reproductor
   * Delega automáticamente al manager apropiado
   * @param data Datos de progreso del reproductor
   */
  updatePlayerData(data: PlayerProgressData): void;
  
  /**
   * Actualiza el estado de pausa
   * @param isPaused Si el reproductor está pausado
   */
  updatePausedState(isPaused: boolean): void;
  
  /**
   * Notifica que el contenido ha cargado
   * @param data Datos de carga (duración, seekableRange, etc.)
   */
  onContentLoaded(data: ContentLoadData): void;
  
  // === OBTENCIÓN DE VALORES ===
  
  /**
   * Obtiene los valores actuales del slider
   * Funciona tanto para VOD como DVR
   */
  getSliderValues(): SliderValues;
  
  /**
   * Obtiene el tiempo actual de reproducción
   * Para VOD: tiempo absoluto
   * Para DVR: tiempo relativo a la ventana DVR
   */
  getCurrentTime(): number;
  
  /**
   * Obtiene la duración total
   * Para VOD: duración del video
   * Para DVR: tamaño de la ventana DVR
   */
  getDuration(): number;
  
  /**
   * Verifica si el contenido actual es live/DVR
   */
  isLiveContent(): boolean;
  
  /**
   * Verifica si estamos en el edge (live) del stream DVR
   */
  isAtLiveEdge(): boolean;
  
  // === OPERACIONES DE SEEK ===
  
  /**
   * Convierte un valor del slider a tiempo de seek
   * @param sliderValue Valor del slider (0-1 o tiempo absoluto)
   * @returns Tiempo de seek validado
   */
  sliderValueToSeekTime(sliderValue: number): number;
  
  /**
   * Valida un tiempo de seek según las restricciones del contenido
   * @param time Tiempo objetivo
   * @returns Tiempo validado dentro de los límites permitidos
   */
  validateSeekTime(time: number): number;
  
  /**
   * Calcula el tiempo para saltar adelante/atrás
   * @param direction 'forward' o 'backward'
   * @param seconds Segundos a saltar (por defecto 10)
   */
  calculateSkipTime(direction: 'forward' | 'backward', seconds?: number): number;
  
  // === CALLBACKS DVR (solo para contenido live) ===
  
  /**
   * Registra callback para cambios de modo DVR
   * @param callback Función a llamar cuando cambia el modo
   */
  onDVRModeChange(callback: (mode: DVRMode) => void): void;
  
  /**
   * Registra callback para cambios de programa DVR
   * @param callback Función a llamar cuando cambia el programa
   */
  onDVRProgramChange(callback: (program: DVRProgram | null) => void): void;
  
  /**
   * Registra callback para actualizaciones de ventana DVR
   * @param callback Función a llamar cuando cambia la ventana
   */
  onDVRWindowUpdate(callback: (window: DVRWindow) => void): void;
  
  // === GESTIÓN DE PROGRAMAS DVR ===
  
  /**
   * Obtiene el programa actual (solo DVR)
   * @returns Programa actual o null si no hay o es VOD
   */
  getCurrentProgram(): DVRProgram | null;
  
  /**
   * Obtiene todos los programas disponibles (solo DVR)
   * @returns Array de programas o vacío si es VOD
   */
  getAvailablePrograms(): DVRProgram[];
  
  /**
   * Salta a un programa específico (solo DVR)
   * @param programId ID del programa
   * @returns Tiempo de seek para ir al programa
   */
  seekToProgram(programId: string): number | null;
  
  // === LIFECYCLE ===
  
  /**
   * Resetea el estado del manager
   * Útil al cambiar de contenido
   */
  reset(): void;
  
  /**
   * Limpia recursos y callbacks
   */
  dispose(): void;
}
```

## 📦 Tipos de Datos

```typescript
// === CONFIGURACIÓN ===

interface ProgressManagerConfig {
  /** Configuración para VOD manager */
  vod: {
    /** Callback cuando cambia el progreso */
    onProgressUpdate?: (values: SliderValues) => void;
    
    /** Intervalo de actualización en ms (opcional) */
    updateInterval?: number;
  };
  
  /** Configuración para DVR manager */
  dvr: {
    /** Callback cuando cambia el modo DVR */
    onModeChange?: (mode: DVRMode) => void;
    
    /** Callback cuando cambia el programa */
    onProgramChange?: (program: DVRProgram | null) => void;
    
    /** Callback cuando cambia la ventana DVR */
    onWindowUpdate?: (window: DVRWindow) => void;
    
    /** Callback cuando cambia el progreso */
    onProgressUpdate?: (values: SliderValues) => void;
    
    /** URL del EPG (guía de programación) */
    epgUrl?: string;
    
    /** Margen para considerar "en vivo" en segundos */
    liveEdgeMargin?: number;
  };
  
  /** Tipo de contenido inicial */
  initialContentType?: 'vod' | 'live';
}

// === DATOS DEL REPRODUCTOR ===

interface PlayerProgressData {
  /** Tiempo actual en segundos */
  currentTime: number;
  
  /** Duración total en segundos */
  duration: number;
  
  /** Duración reproducible (buffered) */
  playableDuration: number;
  
  /** Rango seekable (para DVR) */
  seekableDuration?: number;
  
  /** Si el reproductor está pausado */
  paused?: boolean;
}

interface ContentLoadData {
  /** Duración del contenido */
  duration: number;
  
  /** Si es contenido en vivo */
  isLive: boolean;
  
  /** Rango seekable para DVR */
  seekableRange?: { start: number; end: number };
  
  /** URL del EPG (opcional) */
  epgUrl?: string;
}

// === VALORES DEL SLIDER ===

interface SliderValues {
  /** Valor actual del slider (0-1 para VOD, tiempo para DVR) */
  value: number;
  
  /** Valor máximo del slider */
  maximumValue: number;
  
  /** Valor mínimo del slider */
  minimumValue: number;
  
  /** Tiempo actual formateado (HH:MM:SS) */
  currentTimeFormatted: string;
  
  /** Duración formateada (HH:MM:SS) */
  durationFormatted: string;
  
  /** Tiempo restante formateado (para VOD) */
  remainingTimeFormatted?: string;
  
  /** Porcentaje buffereado (0-1) */
  bufferedPercentage: number;
  
  /** Si es contenido live */
  isLive: boolean;
  
  /** Si estamos en el edge (live) del stream */
  isAtLiveEdge?: boolean;
  
  /** Modo DVR actual (solo para live) */
  dvrMode?: DVRMode;
  
  /** Programa actual (solo para DVR) */
  currentProgram?: DVRProgram | null;
}

// === DVR TYPES ===

type DVRMode = 'live' | 'paused' | 'seeking' | 'catchup';

interface DVRProgram {
  id: string;
  title: string;
  startTime: number; // Unix timestamp
  endTime: number;   // Unix timestamp
  description?: string;
  image?: string;
}

interface DVRWindow {
  /** Inicio de la ventana DVR (Unix timestamp) */
  start: number;
  
  /** Fin de la ventana DVR (Unix timestamp) */
  end: number;
  
  /** Tamaño de la ventana en segundos */
  duration: number;
}
```

## 🏗️ Esquema de Implementación

```typescript
import { VODProgressManagerClass } from '../VODProgressManagerClass';
import { DVRProgressManagerClass } from '../DVRProgressManagerClass';

class ProgressManagerUnified implements IProgressManagerUnified {
  private vodManager: VODProgressManagerClass;
  private dvrManager: DVRProgressManagerClass;
  private contentType: 'vod' | 'live' = 'vod';
  private isInitialized = false;
  
  constructor() {
    // Los managers se crearán en initialize()
  }
  
  // === CONFIGURACIÓN ===
  
  initialize(config: ProgressManagerConfig): void {
    // Crear VOD manager con callbacks
    this.vodManager = new VODProgressManagerClass({
      onProgressUpdate: config.vod.onProgressUpdate,
      updateInterval: config.vod.updateInterval,
    });
    
    // Crear DVR manager con callbacks
    this.dvrManager = new DVRProgressManagerClass({
      onModeChange: config.dvr.onModeChange,
      onProgramChange: config.dvr.onProgramChange,
      onWindowUpdate: config.dvr.onWindowUpdate,
      onProgressUpdate: config.dvr.onProgressUpdate,
      epgUrl: config.dvr.epgUrl,
      liveEdgeMargin: config.dvr.liveEdgeMargin,
    });
    
    this.contentType = config.initialContentType || 'vod';
    this.isInitialized = true;
  }
  
  setContentType(contentType: 'vod' | 'live'): void {
    if (this.contentType !== contentType) {
      // Resetear el manager anterior antes de cambiar
      if (this.contentType === 'vod') {
        this.vodManager.reset();
      } else {
        this.dvrManager.reset();
      }
      
      this.contentType = contentType;
    }
  }
  
  // === ACTUALIZACIÓN DE DATOS ===
  
  updatePlayerData(data: PlayerProgressData): void {
    this.ensureInitialized();
    
    // Delegar al manager apropiado
    if (this.contentType === 'vod') {
      this.vodManager.updatePlayerData(data);
    } else {
      this.dvrManager.updatePlayerData(data);
    }
  }
  
  onContentLoaded(data: ContentLoadData): void {
    this.ensureInitialized();
    
    // Detectar automáticamente el tipo de contenido
    const detectedType = data.isLive ? 'live' : 'vod';
    this.setContentType(detectedType);
    
    // Notificar al manager apropiado
    if (this.contentType === 'vod') {
      this.vodManager.onContentLoaded({ duration: data.duration });
    } else {
      this.dvrManager.onContentLoaded({
        duration: data.duration,
        seekableRange: data.seekableRange,
        epgUrl: data.epgUrl,
      });
    }
  }
  
  // === OBTENCIÓN DE VALORES ===
  
  getSliderValues(): SliderValues {
    this.ensureInitialized();
    return this.getActiveManager().getSliderValues();
  }
  
  getCurrentTime(): number {
    this.ensureInitialized();
    return this.getActiveManager().getCurrentTime();
  }
  
  isLiveContent(): boolean {
    return this.contentType === 'live';
  }
  
  isAtLiveEdge(): boolean {
    if (this.contentType !== 'live') return false;
    return this.dvrManager.isAtLiveEdge();
  }
  
  // === OPERACIONES DE SEEK ===
  
  validateSeekTime(time: number): number {
    this.ensureInitialized();
    return this.getActiveManager().validateSeekTime(time);
  }
  
  calculateSkipTime(direction: 'forward' | 'backward', seconds: number = 10): number {
    this.ensureInitialized();
    const currentTime = this.getCurrentTime();
    const targetTime = direction === 'forward' 
      ? currentTime + seconds 
      : currentTime - seconds;
    return this.validateSeekTime(targetTime);
  }
  
  // === GESTIÓN DE PROGRAMAS DVR ===
  
  getCurrentProgram(): DVRProgram | null {
    if (this.contentType !== 'live') return null;
    return this.dvrManager.getCurrentProgram();
  }
  
  getAvailablePrograms(): DVRProgram[] {
    if (this.contentType !== 'live') return [];
    return this.dvrManager.getAvailablePrograms();
  }
  
  // === LIFECYCLE ===
  
  reset(): void {
    if (this.isInitialized) {
      this.vodManager.reset();
      this.dvrManager.reset();
      this.contentType = 'vod';
    }
  }
  
  dispose(): void {
    if (this.isInitialized) {
      this.vodManager.dispose();
      this.dvrManager.dispose();
      this.isInitialized = false;
    }
  }
  
  // === HELPERS PRIVADOS ===
  
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('ProgressManagerUnified must be initialized before use');
    }
  }
  
  private getActiveManager(): VODProgressManagerClass | DVRProgressManagerClass {
    return this.contentType === 'vod' ? this.vodManager : this.dvrManager;
  }
}
```

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│                   PlayerController                      │
│  (Usa ProgressManagerUnified para todo)                 │
└─────────────────────────────────────────────────────────┘
                          ↓ ↑
              updatePlayerData() │ getSliderValues()
                   seek() │ validateSeekTime()
                          ↓ ↑
┌─────────────────────────────────────────────────────────┐
│              ProgressManagerUnified                     │
│  (Fachada - delega según contentType)                  │
└─────────────────────────────────────────────────────────┘
                          ↓ ↑
        ┌─────────────────┴─┴─────────────────┐
        ↓                                      ↓
┌───────────────────────────┐  ┌───────────────────────────┐
│ VODProgressManagerClass   │  │ DVRProgressManagerClass   │
│ (Lógica VOD existente)    │  │ (Lógica DVR existente)    │
└───────────────────────────┘  └───────────────────────────┘
```

## 🎨 Patrones de Diseño Aplicados

### 1. **Facade Pattern**
El ProgressManagerUnified es una fachada que simplifica la interacción con dos subsistemas complejos (VOD y DVR managers).

### 2. **Strategy Pattern**
El manager activo (VOD o DVR) se selecciona dinámicamente según el tipo de contenido.

### 3. **Delegation Pattern**
Todas las operaciones se delegan al manager apropiado sin reimplementar lógica.

### 4. **Null Object Pattern**
Los métodos específicos de DVR devuelven valores seguros (null, [], false) cuando el contenido es VOD.

## 📝 Casos de Uso

### Caso 1: Inicialización en PlayerController

```typescript
// En PlayerController
class PlayerController {
  private progressManager: ProgressManagerUnified;
  
  constructor(config: PlayerConfig) {
    this.progressManager = new ProgressManagerUnified();
    
    this.progressManager.initialize({
      vod: {
        onProgressUpdate: (values) => {
          this.emit('progressUpdate', values);
        },
      },
      dvr: {
        onModeChange: (mode) => {
          this.emit('dvrModeChange', mode);
        },
        onProgramChange: (program) => {
          this.emit('dvrProgramChange', program);
        },
        onProgressUpdate: (values) => {
          this.emit('progressUpdate', values);
        },
        epgUrl: config.epgUrl,
      },
    });
  }
}
```

### Caso 2: Cambio Automático de Contenido (VOD → Live)

```typescript
// El PlayerController recibe evento de carga
private handleContentLoad(event: ContentLoadEvent) {
  // El ProgressManagerUnified detecta automáticamente el tipo
  this.progressManager.onContentLoaded({
    duration: event.duration,
    isLive: event.isLive,
    seekableRange: event.seekableRange,
  });
  
  // Ahora podemos usar la misma API para VOD o DVR
  const sliderValues = this.progressManager.getSliderValues();
  this.updateUI(sliderValues);
}
```

### Caso 3: Actualización de Progreso (Funciona para VOD y DVR)

```typescript
// Desde el Transport (Video o Cast)
private handleProgress(event: ProgressEvent) {
  // Mismo código para VOD y DVR
  this.progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.duration,
    playableDuration: event.playableDuration,
    seekableDuration: event.seekableRange?.end,
  });
  
  // Obtener valores actualizados
  const values = this.progressManager.getSliderValues();
  
  // Los valores incluyen información específica según el tipo
  if (values.isLive) {
    console.log('DVR Mode:', values.dvrMode);
    console.log('Current Program:', values.currentProgram?.title);
    console.log('At Live Edge:', values.isAtLiveEdge);
  }
}
```

### Caso 4: Seek con Validación Unificada

```typescript
// En PlayerController
async handleSeek(sliderValue: number) {
  // Convertir valor del slider a tiempo
  const seekTime = this.progressManager.sliderValueToSeekTime(sliderValue);
  
  // Validar (respeta límites VOD o ventana DVR)
  const validatedTime = this.progressManager.validateSeekTime(seekTime);
  
  // Ejecutar seek en el transport
  await this.transport.seek(validatedTime);
}

// Skip forward/backward
async handleSkip(direction: 'forward' | 'backward') {
  const targetTime = this.progressManager.calculateSkipTime(direction, 10);
  await this.transport.seek(targetTime);
}
```

### Caso 5: Funcionalidad Específica de DVR

```typescript
// En PlayerController
handleProgramSelect(programId: string) {
  // Solo funciona si es contenido live
  if (this.progressManager.isLiveContent()) {
    const seekTime = this.progressManager.seekToProgram(programId);
    if (seekTime !== null) {
      this.transport.seek(seekTime);
    }
  }
}

// Obtener programa actual
getCurrentProgramInfo() {
  const program = this.progressManager.getCurrentProgram();
  if (program) {
    return {
      title: program.title,
      description: program.description,
      timeRemaining: program.endTime - Date.now(),
    };
  }
  return null;
}
```

## ⚠️ Manejo de Errores

**CRÍTICO**: Todos los Progress Managers (Base, VOD, DVR y Unified) **DEBEN** usar el sistema de errores `PlayerError` definido en `src/player/core/errors/instructions/ErrorSystem.md`.

### Reglas de Manejo de Errores:

1. ✅ **Usar PlayerError para todos los errores**
   ```typescript
   import { PlayerError } from '../../errors';
   
   // ❌ MAL
   throw new Error('Manager not initialized');
   
   // ✅ BIEN
   throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED');
   ```

2. ✅ **Incluir contexto relevante**
   ```typescript
   throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME', {
     requestedTime: time,
     seekableRange: this.seekableRange,
     contentType: this.contentType
   });
   ```

3. ✅ **Capturar y convertir errores genéricos**
   ```typescript
   try {
     await this.dvrManager.updatePlayerData(data);
   } catch (error) {
     if (error instanceof PlayerError) {
       throw error;
     }
     throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
       originalError: error,
       contentType: this.contentType
     });
   }
   ```

4. ✅ **Códigos de error específicos para Progress Managers**
   - `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED` - Manager no inicializado
   - `PLAYER_PROGRESS_INVALID_CONTENT_TYPE` - Tipo de contenido inválido
   - `PLAYER_PROGRESS_INVALID_SEEK_TIME` - Tiempo de seek fuera de rango
   - `PLAYER_PROGRESS_UPDATE_FAILED` - Fallo al actualizar datos
   - `PLAYER_PROGRESS_MANAGER_DISPOSED` - Operación en manager disposed

5. ✅ **NO usar console.error o console.warn para errores**
   ```typescript
   // ❌ MAL
   console.error('Failed to update player data');
   
   // ✅ BIEN
   throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', { data });
   ```

## ✅ Criterios de Validación

Una implementación de ProgressManagerUnified es correcta si:

1. ✅ **Delegación correcta**: Todas las operaciones se delegan al manager apropiado según `contentType`
2. ✅ **Detección automática**: Detecta correctamente VOD vs Live en `onContentLoaded()`
3. ✅ **Transiciones limpias**: Resetea el manager anterior al cambiar de tipo de contenido
4. ✅ **API unificada**: Los métodos comunes funcionan para ambos tipos (VOD y DVR)
5. ✅ **Valores seguros**: Los métodos específicos de DVR devuelven valores seguros cuando es VOD
6. ✅ **Callbacks funcionan**: Los callbacks de ambos managers se invocan correctamente
7. ✅ **Estado sincronizado**: El estado se mantiene consistente entre cambios
8. ✅ **Lifecycle correcto**: `reset()` y `dispose()` limpian ambos managers
9. ✅ **Sin reimplementación**: No duplica lógica de VOD o DVR managers existentes
10. ✅ **⚠️ Usa PlayerError**: Todos los errores usan PlayerError con códigos apropiados

## 🎯 Beneficios

### 1. **Simplificación del PlayerController**
```typescript
// ANTES: PlayerController tenía que gestionar dos managers
if (isLive) {
  dvrManager.updatePlayerData(data);
  const values = dvrManager.getSliderValues();
} else {
  vodManager.updatePlayerData(data);
  const values = vodManager.getSliderValues();
}

// DESPUÉS: Un solo manager para todo
progressManager.updatePlayerData(data);
const values = progressManager.getSliderValues();
```

### 2. **Eliminación de Código Duplicado**
- Los 4 flavours actuales duplican la lógica de gestión de VOD/DVR
- Con ProgressManagerUnified, todos usan la misma API
- Reducción estimada: **~200 líneas por flavour** = **~800 líneas totales**

### 3. **Facilita Transiciones**
- Cambiar de VOD a Live (o viceversa) es automático
- No hay que gestionar manualmente qué manager usar
- El estado se resetea correctamente

### 4. **Extensibilidad**
- Agregar nuevas funcionalidades solo requiere actualizar la fachada
- Los managers existentes no se modifican
- Fácil agregar nuevos tipos de contenido (ej: "podcast", "audiobook")

## 🔍 Próximos Pasos

Una vez validado este diseño:
1. Implementar **ProgressManagerUnified** clase
2. Definir **PlayerController** que use ProgressManagerUnified
3. Actualizar **flavours** para usar el nuevo sistema
4. Migrar tests existentes
5. Documentar migración desde sistema actual

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Estado**: 📝 Diseño - Pendiente de validación