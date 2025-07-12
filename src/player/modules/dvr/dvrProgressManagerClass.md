# DVRProgressManagerClass

## Descripción General

La clase `DVRProgressManagerClass` es responsable de gestionar la barra de progreso de un reproductor de video y audio que utiliza streams con capacidades DVR (timeshift). Esta clase permite a los usuarios navegar por contenido en directo con la capacidad de retroceder en el tiempo dentro de una ventana temporal disponible.

## Conceptos Fundamentales

### Ventana DVR (DVR Window)
- **Definición**: Tamaño de la ventana temporal disponible para navegación, expresado en segundos
- **Crecimiento dinámico**: La ventana crece naturalmente conforme avanza el tiempo
- **Ejemplo**: Si iniciamos con una ventana de 1 hora, después de 30 minutos la ventana será de 1.5 horas

### Live Edge y Offset
- **Live Edge**: Punto más actual en el stream (tiempo real)
- **Live Edge Offset**: Segundos de retraso respecto al live edge
- **Comportamiento en pausa**: Al pausar, la posición se mantiene pero el offset aumenta

## Fuentes de Datos

La clase recibe datos de dos fuentes principales:
- **Reproductor de video nativo**
- **Gestor de Chromecast**

### Datos de Entrada
- `currentTime`: Segundos desde el inicio de la ventana DVR
- `seekableRange`: Rango de tiempo disponible para navegación
- Estados de reproducción: pausa, buffering

> **Nota**: Los datos pueden llegar en formatos ligeramente diferentes según la fuente, por lo que se normalizan internamente.

## Integración con EPG

La clase se conecta con un proveedor de EPG (Electronic Program Guide) para:
- Obtener información del programa actual basado en la hora de reproducción
- Determinar horarios de inicio y fin de programas
- Actualizar automáticamente la información cuando cambia el programa

## Modos de Reproducción

### 🟦 Modo WINDOW (Por defecto)

**Características**:
- El slider abarca toda la ventana de tiempo disponible
- Inicio en el live edge
- Navegación libre por toda la ventana

**Comportamiento del slider**:
- **Extremo izquierdo**: Inicio de la ventana DVR
- **Extremo derecho**: Live edge
- **Crecimiento**: El slider representa un espacio mayor conforme crece la ventana

**Actualización de EPG**:
- Se dispara callback `onEPGRequest` al moverse más de `PROGRESS_SIGNIFICANT_CHANGE` (5 segundos)
- Actualiza información del programa si ha cambiado

### 🟨 Modo PROGRAM

**Características**:
- Similar al modo WINDOW pero limitado al programa actual
- Inicio de reproducción desde el comienzo del programa
- Navegación limitada al programa seleccionado

**Comportamiento del slider**:
- **Extremo izquierdo**: Fecha de inicio del programa (no inicio de ventana DVR)
- **Extremo derecho**: Live edge
- **Restricción**: No permite seek anterior a la fecha de inicio del programa

### 🟩 Modo PLAYLIST (Más sofisticado)

**Características**:
- Slider adaptado dinámicamente a cada programa
- Inicio en live edge
- Transición automática entre programas

**Flujo de funcionamiento**:
1. **Inicialización**: Consulta programa actual via `getEPGProgramAt`
2. **Configuración del slider**: Representa duración del programa (startDate - endDate)
3. **Live edge dinámico**: Valor inferior al máximo del slider mientras el programa está en directo
4. **Transición**: Al alcanzar el final, actualiza con el siguiente programa

**Casos especiales**:
- **Usuario retrasado**: Si va 30min por detrás y el live edge supera el máximo, no se cambia hasta que la reproducción alcance el final
- **Salto al live edge**: Si el live edge está en el siguiente programa, se actualiza el slider automáticamente

## API Pública de la Clase

### Constructor
| Método | Parámetros | Descripción |
|--------|------------|-------------|
| `constructor` | `options: DVRProgressManagerData = {}` | Inicializa el manager con configuración opcional |

### Métodos de Gestión de Datos

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `updatePlayerData` | `data: UpdatePlayerData` | `Promise<void>` | Actualiza los datos provenientes del reproductor (video o cast) |
| `checkInitialSeek` | `mode: 'player' \| 'cast'` | `void` | Workaround específico para iOS en modo 'player'. Ejecuta goToLive() después de 300ms si es necesario |

### Métodos de Obtención de Valores

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `getSliderValues` | - | `SliderValues` | Obtiene los valores calculados para renderizar el slider |
| `getCurrentProgramInfo` | - | `Promise<IBasicProgram \| null>` | Obtiene información del programa actual basado en la posición de reproducción |
| `getStats` | - | `DVRManagerStats` | Obtiene todas las propiedades internas para validaciones y debugging |

### Métodos de Configuración

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `setDuration` | `duration: number \| null` | `void` | Establece la duración (informativo, no se usa para cálculos en directos) |
| `setDVRWindowSeconds` | `seconds: number` | `void` | Configura el tamaño de la ventana DVR y reinicia cálculos. Establece que el stream comenzó en NOW - dvrWindowSeconds |
| `setPlaybackType` | `playbackType: DVR_PLAYBACK_TYPE, program?: IBasicProgram \| null` | `Promise<void>` | Cambia el modo de reproducción y recalcula valores. Emite onProgressUpdate con los nuevos valores |

### Métodos de Navegación Temporal

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `goToProgramStart` | - | `void` | Va al inicio del programa actual (funciona en cualquier modo). Obtiene el startDate del programa según la posición actual |
| `goToLive` | - | `void` | Salta al live edge (punto más actual del stream) |
| `seekToTime` | `timestamp: number` | `void` | Navega a un timestamp específico |
| `skipForward` | `seconds: number` | `void` | Avanza X segundos desde la posición actual |
| `skipBackward` | `seconds: number` | `void` | Retrocede X segundos desde la posición actual |
| `seekToProgress` | `progress: number` | `void` | Navega a una posición específica del slider (0.0 - 1.0) |

### Métodos Adicionales

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `destroy` | - | `void` | Limpia recursos y timers (llamar al desmontar componente) |
| `reset` | - | `void` | Resetea el manager a estado inicial |

### Atributos Públicos (Getters)

#### Estado de Configuración
| Getter | Tipo | Descripción |
|--------|------|-------------|
| `isDVRWindowConfigured` | `boolean` | Indica si la ventana DVR ha sido configurada correctamente |
| `currentTimeWindowSeconds` | `number \| null` | Tamaño actual de la ventana en segundos |
| `duration` | `number \| null` | Duración establecida (informativo) |

#### Información Temporal
| Getter | Tipo | Descripción |
|--------|------|-------------|
| `streamStartTime` | `number \| null` | Timestamp de inicio del stream |
| `endStreamDate` | `number \| null` | Timestamp de fin del stream (si aplica) |
| `currentLiveEdge` | `number \| null` | Posición actual del live edge |
| `progressDatum` | `number \| null` | Timestamp de la posición actual de reproducción |
| `liveEdgeOffset` | `number \| null` | Segundos de retraso respecto al live edge |

#### Estado de Reproducción
| Getter | Tipo | Descripción |
|--------|------|-------------|
| `isLiveEdgePosition` | `boolean` | Indica si estamos en la posición del live edge |
| `playbackType` | `DVR_PLAYBACK_TYPE` | Modo de reproducción actual |
| `currentProgram` | `IBasicProgram \| null` | Programa actualmente en reproducción |
| `totalPauseTime` | `number` | Tiempo total acumulado en pausa (en segundos) |

## Interfaces y Tipos

### Tipos de Reproducción
```typescript
export enum DVR_PLAYBACK_TYPE {
    WINDOW = 'window',
    PROGRAM = 'program', 
    PLAYLIST = 'playlist'
}
```

### Programa Básico
```typescript
export interface IBasicProgram {
    id: string;
    title?: string;
    startDate: number;      // Timestamp de inicio
    endDate: number;        // Timestamp de fin
    extraData?: any;        // Datos adicionales
}
```

### Valores del Slider
```typescript
export interface SliderValues {
    minimumValue: number;           // Valor mínimo del slider
    maximumValue: number;           // Valor máximo del slider
    progress: number;               // Posición actual
    percentProgress: number;        // Porcentaje del slider (0.0 - 1.0)
    duration?: number;              // ❌ Ignorado en streams en directo
    liveEdge?: number;              // Límite real del live edge
    percentLiveEdge?: number;       // Porcentaje del live edge (0.0 - 1.0)
    progressDatum?: number;         // Timestamp de la posición actual
    liveEdgeOffset?: number;        // Segundos de retraso respecto al live edge
}
```

### Datos de Actualización de Progreso
```typescript
export interface ProgressUpdateData extends SliderValues {
    isProgramLive?: boolean;                    // ¿El programa está en directo?
    isLiveEdgePosition?: boolean;              // ¿Estamos en el live edge?
    isPaused: boolean;                         // Estado de pausa
    isBuffering: boolean;                      // Estado de buffering
    playbackType?: DVR_PLAYBACK_TYPE;          // Modo de reproducción actual
    currentProgram?: IBasicProgram | null;     // Programa actual
    windowCurrentSizeInSeconds?: number;       // Tamaño actual de la ventana
    canSeekToEnd: boolean;                     // ❌ Ignorado en directos
}
```

### Estadísticas del Manager (para debugging)
```typescript
export interface DVRManagerStats {
    initialTimeWindowSeconds: number | null;   // Ventana inicial configurada
    currentTimeWindowSeconds: number | null;   // Tamaño actual de la ventana
    totalPauseTime: number;                     // Tiempo total pausado (en segundos)
    isLiveEdgePosition: boolean;                // ¿Estamos en el live edge?
    playbackType: DVR_PLAYBACK_TYPE;           // Modo de reproducción actual
    currentProgram: IBasicProgram | null;      // Programa actual
    streamStartTime: number | null;            // Timestamp de inicio del stream
    endStreamDate: number | null;              // Timestamp de fin del stream
    duration: number | null;                   // Duración informativa
    currentLiveEdge: number | null;            // Posición actual del live edge
    progressDatum: number | null;              // Timestamp de posición actual
    liveEdgeOffset: number | null;             // Segundos de retraso vs live edge
}
```

### Datos de Actualización del Reproductor
```typescript
export interface UpdatePlayerData {
    currentTime: number;            // Tiempo actual del reproductor (obligatorio)
    duration?: number;              // Duración si está disponible (opcional)
    seekableRange: SeekableRange;   // Rango navegable disponible (obligatorio)
    isBuffering: boolean;           // Estado de buffering (obligatorio)
    isPaused: boolean;              // Estado de pausa (obligatorio)
}
```
```typescript
export interface SeekableRange {
    start: number;          // Inicio del rango navegable (segundos)
    end: number;            // Final del rango navegable (segundos)
}
```

### Datos de Cambio de Programa
```typescript
export interface ProgramChangeData {
    previousProgram: IBasicProgram | null;  // Programa anterior (null si no había)
    currentProgram: IBasicProgram | null;   // Programa actual (null si no hay)
}
```

### Datos de Cambio de Modo
```typescript
export interface ModeChangeData {
    previousType: DVR_PLAYBACK_TYPE;        // Modo anterior
    playbackType: DVR_PLAYBACK_TYPE;        // Modo actual
    program: IBasicProgram | null;          // Programa asociado al cambio
}
```

### Configuración del Manager
```typescript
export interface DVRProgressManagerData {
    dvrWindowSeconds?: number;                              // Tamaño inicial de ventana
    currentTime?: number;                                   // Tiempo actual
    isPaused?: boolean;                                     // Estado de pausa
    isBuffering?: boolean;                                  // Estado de buffering
    playbackType?: DVR_PLAYBACK_TYPE;                      // Modo de reproducción
    
    // Proveedor EPG
    getEPGProgramAt?: (timestamp: number) => Promise<IBasicProgram | null>;
    
    // Callbacks
    onModeChange?: (data: ModeChangeData) => void;          // Cambio de modo
    onProgramChange?: (data: ProgramChangeData) => void;    // Cambio de programa
    onProgressUpdate?: (data: ProgressUpdateData) => void; // Actualización de progreso
    onSeekRequest?: (playerTime: number) => void;          // Solicitud de seek
    onEPGRequest?: (timestamp: number) => void;            // Solicitud de datos EPG
}
```

## Integración con React Native

La clase está diseñada para funcionar con `react-native-awesome-slider`, proporcionando todos los valores necesarios para renderizar una barra de progreso interactiva y responsive.

## ⚠️ Consideraciones Importantes

### Configuración Obligatoria de Ventana DVR

**Requisito crítico**: La clase necesita conocer el tamaño de la ventana DVR para realizar cálculos correctos.

**Métodos de configuración**:
1. Durante construcción: `new DVRProgressManagerClass({ dvrWindowSeconds: 3600 })`
2. Posterior configuración: `setDVRWindowSeconds(3600)`

**Comportamiento sin configuración**:
- `getSliderValues()` → Retorna valores nulos/inválidos
- `isDVRWindowConfigured` → `false`
- Atributos temporales → `null`
- Métodos de navegación → Pueden fallar o comportarse incorrectamente

### Gestión de Estados de Pausa y Buffering

**Comportamiento crítico durante pausas**: Durante la pausa, aunque el `progressDatum` debe permanecer congelado, el `liveEdgeOffset` debe seguir creciendo porque el live edge continúa avanzando. La clase emite updates cada segundo durante la pausa para mostrar en la UI cómo aumenta el retraso.

**Flujo detallado**:
1. **Al pausar/iniciar buffering**:
   - Se congela `progressDatum` en la posición actual
   - Se inicia un timer que emite `onProgressUpdate` cada segundo
   - El `liveEdge` continúa avanzando normalmente

2. **Durante la pausa (cada segundo)**:
   - `progressDatum`: **Permanece congelado** (misma posición de reproducción)
   - `liveEdgeOffset`: **Crece continuamente** (+1 segundo por update)
   - `isLiveEdgePosition`: Se marca como `false` después de 30 segundos pausado
   - `percentProgress`: **Se mantiene estable** (misma posición en el slider)
   - `percentLiveEdge`: **Decrece gradualmente** (el live edge se aleja del punto de pausa)

3. **Al reanudar**:
   - Se descongela `progressDatum`
   - Se detiene el timer de updates de pausa
   - Se acumula el tiempo total pausado

### Gestión de Estados de Pausa y Buffering

**Comportamiento crítico durante pausas**: Durante la pausa, aunque el `progressDatum` debe permanecer congelado, el `liveEdgeOffset` debe seguir creciendo porque el live edge continúa avanzando. La clase emite updates cada segundo durante la pausa para mostrar en la UI cómo aumenta el retraso.

**Flujo detallado**:
1. **Al pausar/iniciar buffering**:
   - Se congela `progressDatum` en la posición actual
   - Se inicia un timer que emite `onProgressUpdate` cada segundo
   - El `liveEdge` continúa avanzando normalmente

2. **Durante la pausa (cada segundo)**:
   - `progressDatum`: **Permanece congelado** (misma posición de reproducción)
   - `liveEdgeOffset`: **Crece continuamente** (+1 segundo por update)
   - `isLiveEdgePosition`: Se marca como `false` después de 30 segundos pausado
   - `percentProgress`: **Se mantiene estable** (misma posición en el slider)
   - `percentLiveEdge`: **Decrece gradualmente** (el live edge se aleja del punto de pausa)

3. **Al reanudar**:
   - Se descongela `progressDatum`
   - Se detiene el timer de updates de pausa
   - Se acumula el tiempo total pausado

#### Navegación Durante la Pausa (Seek)

**Comportamiento especial**: Todos los métodos de navegación (`seekToTime`, `skipForward`, `skipBackward`, `seekToProgress`, `goToLive`, `goToProgramStart`) funcionan correctamente durante la pausa, actualizando la posición congelada y reflejando los cambios inmediatamente en la UI.

**Flujo de seek durante pausa**:
1. **Usuario ejecuta seek**: Cualquier método de navegación
2. **Actualización inmediata**: Se actualiza `_frozenProgressDatum` a la nueva posición
3. **Update instantáneo**: Se emite `onProgressUpdate` inmediato para reflejar el cambio en UI
4. **Timer continúa**: El timer de pausa sigue funcionando desde la nueva posición

**Ejemplo práctico**:
```javascript
// Estado inicial: pausado en minuto 5 con 2 minutos de retraso
{
    progressDatum: 300000,      // Congelado en minuto 5
    liveEdgeOffset: 120,        // 2 minutos de retraso
    isLiveEdgePosition: false
}

// Usuario hace skipForward(30) durante la pausa
manager.skipForward(30);

// Estado inmediatamente después del seek
{
    progressDatum: 330000,      // Actualizado a minuto 5:30 
    liveEdgeOffset: 90,         // Solo 1:30 de retraso ahora
    isLiveEdgePosition: false
}

// Un segundo después (timer de pausa continúa)
{
    progressDatum: 330000,      // Sigue congelado en 5:30
    liveEdgeOffset: 91,         // Crece a 1:31 de retraso
    isLiveEdgePosition: false
}
```

**Métodos de navegación que funcionan durante pausa**:
- `seekToTime(timestamp)`: Navega a timestamp específico
- `skipForward(seconds)`: Avanza X segundos desde posición actual
- `skipBackward(seconds)`: Retrocede X segundos desde posición actual  
- `seekToProgress(progress)`: Navega a posición del slider (0.0-1.0)
- `goToLive()`: Salta al live edge actual
- `goToProgramStart()`: Va al inicio del programa actual

**Importancia para la UI**: Este comportamiento permite al usuario navegar libremente por el contenido incluso estando pausado, viendo los efectos inmediatamente en el slider, mientras el sistema continúa calculando el retraso real respecto al live edge.

### Workaround para iOS - checkInitialSeek()

**Problema específico**: En iOS con el reproductor nativo, algunos streams no inician automáticamente en el live edge.

**Implementación actual**:
```typescript
checkInitialSeek(mode: 'player' | 'cast') {
    console.log(`[Player] (DVR Progress Manager) checkInitialSeek for ${mode}`);
    
    if (mode === 'player' && Platform.OS === 'ios') {
        setTimeout(() => {
            this.goToLive();
        }, 300);
    }
}
```

**Comportamiento**:
- **Solo iOS + modo 'player'**: Ejecuta el workaround
- **Delay de 300ms**: Permite que el reproductor se inicialice completamente
- **Automático**: Llama a `goToLive()` para posicionar en el live edge

**Cuándo usar**: Llamar después de inicializar el reproductor y configurar la ventana DVR

### Funcionamiento de goToProgramStart()

**Disponibilidad**: Funciona en **todos los modos** (WINDOW, PROGRAM, PLAYLIST)

**Proceso**:
1. Obtiene la posición actual de reproducción (`progressDatum`)
2. Consulta EPG para obtener el programa en esa posición
3. Extrae el `startDate` del programa
4. Ejecuta `seekToTime(startDate)`

**Casos especiales**:
- Si no hay programa en EPG → No ejecuta seek
- Si ya estamos en el inicio → Permanece en la misma posición
- Funciona incluso cuando el programa empezó antes de la ventana DVR

### Flujo de Inicialización

```typescript
// Ejemplo de inicialización completa
const manager = new DVRProgressManagerClass({
    dvrWindowSeconds: 3600,  // 1 hora
    playbackType: DVR_PLAYBACK_TYPE.WINDOW,
    getEPGProgramAt: async (timestamp) => {
        // Implementación de consulta EPG
        return await epgService.getProgramAt(timestamp);
    },
    onProgressUpdate: (data) => {
        // Actualizar UI del slider
        updateSliderUI(data);
    }
});

// Verificar configuración antes de usar
if (manager.isDVRWindowConfigured) {
    // Inicializar reproductor
    await setupVideoPlayer();
    
    // Aplicar workaround para iOS si es necesario
    manager.checkInitialSeek('player'); // o 'cast' según corresponda
    
    // Iniciar actualización de datos
    await manager.updatePlayerData({ 
        currentTime: player.currentTime,
        seekableRange: {
            start: player.seekable.start(0),
            end: player.seekable.end(0)
        },
        isBuffering: player.buffering,
        isPaused: player.paused,
        duration: player.duration // opcional
    });
}
```

## Constantes

```typescript
const PROGRESS_SIGNIFICANT_CHANGE = 5; // Segundos - Umbral para disparar onEPGRequest
```

## Gestión de Errores (Propuesta)

### Fallos de EPG

**Problema**: `getEPGProgramAt()` puede fallar por problemas de red o datos corruptos.

**Solución propuesta**:
```typescript
interface EPGErrorData {
    timestamp: number;          // Momento del fallo
    error: Error;              // Error original
    retryCount: number;        // Intentos realizados
}

// Callback adicional en DVRProgressManagerData
onEPGError?: (data: EPGErrorData) => void;
```

**Comportamiento**:
- **Primer fallo**: Reintento automático después de 2 segundos
- **Segundo fallo**: Reintento después de 5 segundos
- **Tercer fallo**: Emitir `onEPGError` y mantener último programa conocido
- **Fallback**: Si no hay programa previo, mostrar información genérica

### Datos Inconsistentes

**Problema**: `currentTime` fuera del `seekableRange` o valores negativos.

**Solución propuesta**:
```typescript
interface ValidationErrorData {
    type: 'INVALID_CURRENT_TIME' | 'INVALID_SEEKABLE_RANGE' | 'WINDOW_SIZE_MISMATCH';
    receivedValue: any;
    expectedRange?: { min: number, max: number };
    correctedValue?: any;
}

// Callback adicional
onValidationError?: (data: ValidationErrorData) => void;
```

**Comportamiento**:
- **Corrección automática**: Ajustar valores a rangos válidos
- **Logging**: Emitir error para debugging
- **Continuidad**: Mantener reproducción sin interrupciones

### Pérdida de Conectividad

**Problema**: Pérdida temporal de conexión durante streaming.

**Solución propuesta**:
```typescript
interface ConnectivityState {
    isOnline: boolean;
    lastSuccessfulUpdate: number;  // Timestamp
    stalenessLevel: 'FRESH' | 'STALE' | 'VERY_STALE';
}

// Estado adicional en ProgressUpdateData
connectivity?: ConnectivityState;
```

**Comportamiento**:
- **Modo degradado**: Continuar con última información conocida
- **Indicador visual**: Mostrar estado de conectividad en UI
- **Recuperación**: Sincronización automática al restaurar conexión

### Transiciones de Modo Fallidas

**Problema**: Fallo al cambiar entre modos (ej: WINDOW → PLAYLIST).

**Solución propuesta**:
```typescript
interface ModeTransitionError {
    fromMode: DVR_PLAYBACK_TYPE;
    toMode: DVR_PLAYBACK_TYPE;
    reason: 'EPG_UNAVAILABLE' | 'INVALID_PROGRAM_DATA' | 'SEEK_RANGE_CONFLICT';
    fallbackMode: DVR_PLAYBACK_TYPE;
}

// Callback adicional
onModeTransitionError?: (data: ModeTransitionError) => void;
```

**Comportamiento**:
- **Fallback automático**: Volver al modo anterior o WINDOW por defecto
- **Notificación**: Informar al usuario del problema
- **Reintento**: Opción de intentar cambio después de resolver el problema

## Ejemplos de Uso

### Inicialización Básica
```typescript
const dvrManager = new DVRProgressManagerClass({
    dvrWindowSeconds: 7200, // 2 horas
    playbackType: DVR_PLAYBACK_TYPE.WINDOW,
    getEPGProgramAt: async (timestamp) => {
        return await epgProvider.getProgramAt(timestamp);
    },
    onProgressUpdate: (data) => {
        // Actualizar slider UI
        setSliderState(data);
    },
    onProgramChange: (data) => {
        console.log(`Cambio de programa: ${data.previousProgram?.title} → ${data.currentProgram?.title}`);
    },
    onSeekRequest: (playerTime) => {
        videoPlayer.seekTo(playerTime);
    }
});
```

### Actualización Continua desde Reproductor
```typescript
// En el loop de actualización del reproductor
const updateLoop = async () => {
    if (dvrManager.isDVRWindowConfigured) {
        await dvrManager.updatePlayerData({
            currentTime: videoPlayer.currentTime,
            seekableRange: {
                start: videoPlayer.seekable.start(0),
                end: videoPlayer.seekable.end(0)
            },
            isPaused: videoPlayer.paused,
            isBuffering: videoPlayer.buffering
        });
        
        // Actualizar UI con valores calculados
        const sliderValues = dvrManager.getSliderValues();
        updateSliderComponent(sliderValues);
    }
};

setInterval(updateLoop, 1000); // Actualizar cada segundo
```

### Cambio de Modo Dinámico
```typescript
// Cambiar a modo PROGRAM para un programa específico
const switchToProgramMode = async (program: IBasicProgram) => {
    await dvrManager.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM, program);
    
    // Ir al inicio del programa
    dvrManager.goToProgramStart();
};

// Cambiar a modo PLAYLIST
const switchToPlaylistMode = async () => {
    await dvrManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);
    // El slider se adaptará automáticamente al programa actual
};
```

### Controles de Navegación
```typescript
// Botones de la UI
const handleLiveButton = () => {
    dvrManager.goToLive();
};

const handleProgramStartButton = () => {
    dvrManager.goToProgramStart();
};

const handleSkipButtons = (direction: 'forward' | 'backward') => {
    const skipSeconds = 30;
    if (direction === 'forward') {
        dvrManager.skipForward(skipSeconds);
    } else {
        dvrManager.skipBackward(skipSeconds);
    }
};

// Slider arrastrado por usuario
const handleSliderChange = (progress: number) => {
    dvrManager.seekToProgress(progress);
};
```

### Manejo de Estados Especiales
```typescript
// Verificar estado antes de acciones
const safeSeek = (timestamp: number) => {
    if (dvrManager.isDVRWindowConfigured) {
        dvrManager.seekToTime(timestamp);
    } else {
        console.warn('DVR window not configured yet');
    }
};

// Obtener información del programa actual
const showCurrentProgramInfo = async () => {
    const program = await dvrManager.getCurrentProgramInfo();
    if (program) {
        console.log(`Programa actual: ${program.title}`);
        console.log(`Inicio: ${new Date(program.startDate)}`);
        console.log(`Fin: ${new Date(program.endDate)}`);
    }
};

// Verificar si estamos en directo
const checkLiveStatus = () => {
    if (dvrManager.isLiveEdgePosition) {
        showLiveIndicator();
    } else {
        const offset = dvrManager.liveEdgeOffset;
        showDelayIndicator(`${offset}s de retraso`);
    }
};
```

## Casos de Uso Típicos

1. **Reproducción en directo**: Usuario ve contenido actual con capacidad de retroceso
2. **Catch-up TV**: Usuario accede a programas desde el inicio  
3. **Navegación por programas**: Usuario salta entre diferentes programas en la ventana DVR
4. **Modo playlist inteligente**: UI que se adapta automáticamente a cada programa