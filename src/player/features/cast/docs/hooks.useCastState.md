# Hooks de Estado Cast - useCastState.ts

Este documento describe el funcionamiento y uso de los hooks relacionados con el estado de Cast disponibles en el archivo `hooks/useCastState.ts`.

## Índice

1. [useCastState](#usecaststate) - Hook principal para gestión de estado Cast
2. [useCastConnectivity](#usecastconnectivity) - Hook para información de conectividad
3. [useCastReady](#usecastready) - Hook para verificar si Cast está listo
4. [useCastProgress](#usecastprogress) - Hook para información de progreso
5. [useCastVolume](#usecastvolume) - Hook para información de volumen

---

## useCastState

Hook principal para gestionar el estado de Cast de forma reactiva, proporcionando información completa sobre el estado actual del Cast Manager.

### Sintaxis

```typescript
const castStateInfo = useCastState(config);
```

### Parámetros

El hook acepta un objeto de configuración `UseCastStateConfig`:

| Propiedad | Tipo | Obligatorio | Por Defecto | Descripción |
|-----------|------|-------------|-------------|-------------|
| `streamPositionInterval` | `number` | ❌ | `1` | Intervalo en segundos para actualizar posición del stream |
| `debugMode` | `boolean` | ❌ | `false` | Activa logs de debug en consola |
| `onStateChange` | `(state: CastStateInfo, prev: CastStateInfo) => void` | ❌ | `undefined` | Callback cuando cambia el estado |
| `onConnectionChange` | `(isConnected: boolean, prev: boolean) => void` | ❌ | `undefined` | Callback cuando cambia la conexión |

### Valor de Retorno

Retorna un objeto `CastStateInfo` con las siguientes propiedades:

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `castState` | `CastState \| undefined` | Estado nativo de Cast desde react-native-google-cast |
| `castSession` | `any \| undefined` | Sesión activa de Cast |
| `castClient` | `any \| undefined` | Cliente remoto de Cast |
| `castMediaStatus` | `any \| undefined` | Estado del media actual |
| `castStreamPosition` | `number \| undefined` | Posición actual del stream |
| `managerState` | `CastManagerState` | Estado mapeado del Cast Manager |
| `isConnected` | `boolean` | Indica si Cast está conectado |
| `isConnecting` | `boolean` | Indica si Cast está conectando |
| `isDisconnected` | `boolean` | Indica si Cast está desconectado |
| `hasSession` | `boolean` | Indica si hay una sesión activa |
| `hasClient` | `boolean` | Indica si hay un cliente disponible |
| `hasMediaStatus` | `boolean` | Indica si hay estado de media |
| `connectivityInfo` | `object` | Información detallada de conectividad |
| `lastStateChange` | `number` | Timestamp del último cambio de estado |
| `lastUpdate` | `number` | Timestamp de la última actualización |

### Ejemplo de Uso

```typescript
import { useCastState } from '@/features/cast';

function MyCastComponent() {
    const castInfo = useCastState({
        streamPositionInterval: 1,
        debugMode: true,
        onStateChange: (newState, prevState) => {
            console.log('Cast state changed:', newState.managerState);
        },
        onConnectionChange: (isConnected, prevConnected) => {
            console.log('Cast connection changed:', isConnected ? 'Connected' : 'Disconnected');
        }
    });

    return (
        <div>
            <p>Estado: {castInfo.managerState}</p>
            <p>Conectado: {castInfo.isConnected ? 'Sí' : 'No'}</p>
            <p>Posición: {castInfo.castStreamPosition || 0}s</p>
        </div>
    );
}
```

---

## useCastConnectivity

Hook simplificado que retorna únicamente información de conectividad Cast.

### Sintaxis

```typescript
const connectivity = useCastConnectivity();
```

### Parámetros

Este hook no acepta parámetros.

### Valor de Retorno

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `isConnected` | `boolean` | Cast está conectado |
| `isConnecting` | `boolean` | Cast está conectando |
| `isDisconnected` | `boolean` | Cast está desconectado |
| `statusText` | `string` | Texto descriptivo del estado |

### Ejemplo de Uso

```typescript
import { useCastConnectivity } from '@/features/cast';

function CastStatusIndicator() {
    const { isConnected, statusText } = useCastConnectivity();
    
    return (
        <div className={`cast-status ${isConnected ? 'connected' : 'notConnected'}`}>
            {statusText}
        </div>
    );
}
```

---

## useCastReady

Hook que retorna un boolean indicando si Cast está listo para operaciones.

### Sintaxis

```typescript
const isReady = useCastReady();
```

### Parámetros

Este hook no acepta parámetros.

### Valor de Retorno

| Tipo | Descripción |
|------|-------------|
| `boolean` | `true` si Cast está conectado y tiene sesión y cliente disponibles |

### Ejemplo de Uso

```typescript
import { useCastReady } from '@/features/cast';

function CastControls() {
    const isReady = useCastReady();
    
    return (
        <button disabled={!isReady} onClick={handlePlay}>
            {isReady ? 'Reproducir en Cast' : 'Cast no disponible'}
        </button>
    );
}
```

---

## useCastProgress

Hook para obtener información de progreso de reproducción Cast.

### Sintaxis

```typescript
const progress = useCastProgress(enabled);
```

### Parámetros

| Parámetro | Tipo | Obligatorio | Por Defecto | Descripción |
|-----------|------|-------------|-------------|-------------|
| `enabled` | `boolean` | ❌ | `true` | Habilita el seguimiento de progreso |

### Valor de Retorno

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `currentTime` | `number` | Tiempo actual de reproducción en segundos |
| `duration` | `number` | Duración total del contenido en segundos |
| `progress` | `number` | Progreso como porcentaje (0-1) |
| `isBuffering` | `boolean` | Indica si está cargando/bufferizando |
| `isPaused` | `boolean` | Indica si está pausado |
| `position` | `number` | Alias de `currentTime` |

### Ejemplo de Uso

```typescript
import { useCastProgress } from '@/features/cast';

function CastProgressBar() {
    const { currentTime, duration, progress, isBuffering } = useCastProgress();
    
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return (
        <div className="progress-container">
            <div className="progress-bar">
                <div 
                    className="progress-fill" 
                    style={{ width: `${progress * 100}%` }}
                />
            </div>
            <div className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
                {isBuffering && <span> (Cargando...)</span>}
            </div>
        </div>
    );
}
```

---

## useCastVolume

Hook para obtener y gestionar información de volumen Cast.

### Sintaxis

```typescript
const volumeInfo = useCastVolume();
```

### Parámetros

Este hook no acepta parámetros.

### Valor de Retorno

Retorna un objeto `CastVolumeInfo`:

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `level` | `number` | Nivel de volumen (0.0 - 1.0) |
| `muted` | `boolean` | Indica si está silenciado |
| `stepInterval` | `number` | Intervalo para ajustes de volumen |
| `controlType` | `string` | Tipo de control ('master', 'none') |

### Ejemplo de Uso

```typescript
import { useCastVolume } from '@/features/cast';

function CastVolumeControl() {
    const { level, muted, controlType } = useCastVolume();
    const canControl = controlType === 'master';
    
    return (
        <div className="volume-control">
            <button 
                disabled={!canControl}
                onClick={handleMuteToggle}
            >
                {muted ? '🔇' : '🔊'}
            </button>
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={level}
                disabled={!canControl || muted}
                onChange={handleVolumeChange}
            />
            <span>{Math.round(level * 100)}%</span>
        </div>
    );
}
```

---

## Notas Importantes

### Estados de Cast Manager

Los hooks utilizan el enum `CastManagerState` con los siguientes valores:

- `NOT_CONNECTED` - Cast desconectado
- `CONNECTING` - Cast conectando
- `CONNECTED` - Cast conectado
- `LOADING` - Cargando contenido
- `PLAYING` - Reproduciendo
- `PAUSED` - Pausado
- `BUFFERING` - Bufferizando
- `ERROR` - Error

### Optimización de Rendimiento

- Los hooks implementan optimizaciones para evitar re-renders innecesarios
- Usan `useCallback` y `useRef` para mantener estabilidad de referencias
- **Refs de Callbacks**: Los callbacks (`onStateChange`, `onConnectionChange`) se capturan en refs para evitar dependencias circulares
- **Comparación Optimizada**: Solo actualiza el estado cuando hay cambios significativos detectados
- **Logging Condicional**: Los logs de debug se optimizan usando refs para evitar recreaciones innecesarias
- **Estado Memoizado**: El estado interno se actualiza de forma eficiente comparando propiedades específicas

### Debugging

Activa el modo debug en `useCastState` para obtener información detallada en consola:

```typescript
const castInfo = useCastState({ debugMode: true });
```

### Cambios Recientes y Arquitectura

**Optimizaciones Principales:**

1. **Eliminación del parámetro `enableStreamPosition`**: El seguimiento de posición del stream ahora está siempre habilitado, controlado internamente por `streamPositionInterval`.

2. **Sistema de Referencias para Callbacks**: Los callbacks se capturan en `useRef` para evitar dependencias circulares y re-renders innecesarios:
   ```typescript
   const onStateChangeRef = useRef(onStateChange);
   const onConnectionChangeRef = useRef(onConnectionChange);
   ```

3. **Detección Inteligente de Cambios**: Solo actualiza el estado cuando hay cambios significativos:
   ```typescript
   const hasStateChange = (
       newState.castState !== previousState.castState ||
       newState.hasSession !== previousState.hasSession ||
       newState.managerState !== previousState.managerState
   );
   ```

4. **Callback de Conexión Mejorado**: Ahora incluye el estado anterior:
   ```typescript
   onConnectionChange: (isConnected: boolean, previousConnected: boolean) => void
   ```

**Beneficios de la Arquitectura Optimizada:**
- Elimina bucles infinitos de actualización
- Reduce renders innecesarios en componentes padre
- Mejora la estabilidad del estado Cast
- Proporciona mejor debugging y trazabilidad
- Mantiene la compatibilidad con el API existente

### Dependencias

Estos hooks dependen de:
- `react-native-google-cast` para funcionalidad nativa
- Tipos consolidados en `../types`
- Constantes y utilidades del directorio Cast

---

## Ejemplos Completos

### Componente Completo de Cast

```typescript
import { 
    useCastState, 
    useCastProgress, 
    useCastVolume,
    useCastReady 
} from '@/features/cast';

function CompleteCastPlayer() {
    const isReady = useCastReady();
    const castState = useCastState({ debugMode: true });
    const progress = useCastProgress(isReady);
    const volume = useCastVolume();
    
    if (!isReady) {
        return <div>Cast no disponible</div>;
    }
    
    return (
        <div className="cast-player">
            <h3>{castState.managerState}</h3>
            
            {/* Progress Bar */}
            <div className="progress">
                <div style={{ width: `${progress.progress * 100}%` }} />
            </div>
            
            {/* Volume Control */}
            <div className="volume">
                Vol: {Math.round(volume.level * 100)}%
                {volume.muted && ' (Silenciado)'}
            </div>
            
            {/* Status */}
            <div className="status">
                {progress.isBuffering ? 'Cargando...' : 
                 progress.isPaused ? 'Pausado' : 'Reproduciendo'}
            </div>
        </div>
    );
}
```
