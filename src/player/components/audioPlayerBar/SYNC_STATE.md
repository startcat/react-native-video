# Sistema de Sincronización de Estado entre Flavours

## Propósito

El sistema `changeCommonData` gestiona la **sincronización de estado** cuando el usuario cambia entre reproducción local (móvil) y Chromecast. Esto garantiza que:

- La reproducción continúe desde el mismo punto temporal
- Se mantengan las preferencias de audio/subtítulos
- El estado de pausa/reproducción se preserve
- Los niveles de volumen y mute se mantengan

## Arquitectura

### Estado de Sincronización (`syncState`)

```typescript
const [syncState, setSyncState] = useState<ICommonData>({});
```

Este estado local en `AudioPlayerBar` captura todos los cambios que deben persistir entre flavours:

```typescript
interface ICommonData {
    time?: number;           // Posición de reproducción
    duration?: number;       // Duración del contenido
    volume?: number;         // Nivel de volumen (0-1)
    paused?: boolean;        // Estado de pausa
    muted?: boolean;         // Estado de mute
    audioIndex?: number;     // Índice de pista de audio
    subtitleIndex?: number;  // Índice de subtítulos
    audioLabel?: string;     // Label de audio seleccionado
    subtitleLabel?: string;  // Label de subtítulos
    playbackRate?: number;   // Velocidad de reproducción
}
```

### Función `changeCommonData`

```typescript
const changeCommonData = useCallback((data: ICommonData) => {
    // 1. Actualizar estado de sincronización (inmutable)
    setSyncState((prev) => ({ ...prev, ...data }));
    
    // 2. Notificar eventos específicos (onProgress, onPause, onPlay)
    // 3. Recopilar y notificar cambios de preferencias
}, [syncState, dpoData]);
```

**Características clave:**
- ✅ **Inmutable**: Usa `setState` en lugar de mutación directa
- ✅ **Reactivo**: Dispara re-renders cuando cambia el estado
- ✅ **Memoizado**: `useCallback` previene recreaciones innecesarias
- ✅ **Eventos**: Notifica callbacks específicos (onProgress, onPause, etc.)

## Flujo de Sincronización

### Escenario: Usuario cambia de móvil a Chromecast

```
1. Usuario reproduce en móvil
   ├─ AudioFlavour activo
   ├─ Posición: 120 segundos
   ├─ Estado: Pausado
   └─ Audio: Español (índice 1)

2. Usuario hace una acción (ej: pausa)
   ├─ AudioFlavour llama: onChangeCommonData({ paused: true })
   └─ syncState actualizado: { paused: true }

3. Usuario avanza el tiempo
   ├─ AudioFlavour llama: onChangeCommonData({ time: 120 })
   └─ syncState actualizado: { paused: true, time: 120 }

4. Usuario conecta Chromecast
   ├─ AudioFlavour se desmonta
   ├─ AudioCastFlavour se monta
   └─ Recibe initialState con valores sincronizados:
       {
           isPaused: true,      // desde syncState.paused
           volume: 0.8,         // desde syncState.volume
           audioIndex: 1        // desde syncState.audioIndex
       }

5. AudioCastFlavour inicia Cast
   ├─ Posición inicial: 120 segundos (desde syncState.time)
   ├─ Estado: Pausado
   └─ Audio: Español (índice 1)

✅ Continuidad perfecta entre flavours
```

## Integración con Flavours

### AudioPlayerBar pasa `initialState` enriquecido

```typescript
<AudioFlavour
    initialState={{
        ...dpoData.initialState,
        // Sobrescribir con valores sincronizados
        isPaused: syncState.paused ?? dpoData.initialState?.isPaused,
        isMuted: syncState.muted ?? dpoData.initialState?.isMuted,
        volume: syncState.volume ?? dpoData.initialState?.volume,
        audioIndex: syncState.audioIndex ?? dpoData.initialState?.audioIndex,
        subtitleIndex: syncState.subtitleIndex ?? dpoData.initialState?.subtitleIndex,
    }}
    events={{
        ...dpoData.events,
        onChangeCommonData: changeCommonData,
    }}
/>
```

**Prioridad de valores:**
1. `syncState` (valores sincronizados más recientes)
2. `dpoData.initialState` (valores iniciales del DPO)
3. `undefined` (sin valor)

### Flavours invocan `onChangeCommonData`

Los flavours llaman a este callback cuando:

#### 1. **Cambios de progreso** (onProgress)
```typescript
if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
    props.events.onChangeCommonData({
        time: e.currentTime,
        duration: vodDuration,
    });
}
```

#### 2. **Acciones del usuario** (onPress)
```typescript
if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
    let data: ICommonData = {};
    
    if (id === CONTROL_ACTION.MUTE) {
        data.muted = !!value;
    }
    if (id === CONTROL_ACTION.VOLUME) {
        data.volume = value;
    }
    
    props.events.onChangeCommonData(data);
}
```

#### 3. **Cambios de pistas** (audio/subtítulos)
```typescript
if (menuData && props.events?.onChangeCommonData) {
    props.events.onChangeCommonData({
        audioIndex: audioDefaultIndex,
        audioLabel: audioTrack?.label,
        subtitleIndex: textDefaultIndex,
        subtitleLabel: textTrack?.label,
    });
}
```

## Limpieza de Estado

El `syncState` se limpia automáticamente cuando:

```typescript
const clearDataToChangeContents = () => {
    hasBeenLoaded.current = false;
    setDpoData(null);
    currentLogger.current = null;
    // Limpiar estado de sincronización al cambiar de contenido
    setSyncState({});
};
```

Esto previene que valores de un contenido anterior se apliquen a contenido nuevo.

## Notificaciones de Eventos

`changeCommonData` también dispara eventos específicos:

### onProgress
```typescript
if ((data?.time !== undefined || data?.duration !== undefined) && 
    dpoData?.events?.onProgress) {
    const currentTime = data.time ?? syncState.time ?? 0;
    const duration = data.duration ?? syncState.duration ?? 0;
    dpoData.events.onProgress(currentTime, duration);
}
```

### onPause / onPlay
```typescript
if (data?.paused !== undefined) {
    if (data.paused && dpoData?.events?.onPause) {
        dpoData.events.onPause();
    } else if (!data.paused && dpoData?.events?.onPlay) {
        dpoData.events.onPlay();
    }
}
```

### onChangePreferences
```typescript
if (Object.keys(preferencesData).length > 0 && 
    dpoData?.events?.onChangePreferences) {
    dpoData.events.onChangePreferences(preferencesData);
}
```

## Ventajas del Nuevo Sistema

### ✅ Inmutabilidad
- No modifica objetos directamente
- Usa `setState` para actualizaciones
- Previene bugs de mutación

### ✅ Reactividad
- Cambios disparan re-renders automáticamente
- React detecta cambios correctamente
- UI siempre sincronizada con estado

### ✅ Consistencia
- Sigue el patrón de props estructuradas
- Integración limpia con `ICommonPlayerProps`
- Tipos TypeScript completos

### ✅ Persistencia
- Estado se mantiene entre cambios de flavour
- Transiciones suaves móvil ↔ Chromecast
- No se pierde información del usuario

### ✅ Claridad
- Separación clara entre datos de sincronización y props del player
- Flujo de datos unidireccional
- Fácil de debuggear y mantener

## Casos de Uso

### 1. Continuar reproducción en Chromecast
Usuario reproduce video en móvil, conecta Chromecast → continúa desde mismo punto

### 2. Volver a móvil desde Chromecast
Usuario desconecta Chromecast → reproducción continúa en móvil con mismas preferencias

### 3. Cambiar audio/subtítulos
Usuario cambia idioma en móvil → al conectar Cast mantiene el idioma seleccionado

### 4. Mantener estado de pausa
Usuario pausa en móvil → al conectar Cast inicia pausado en mismo punto

### 5. Preservar volumen
Usuario ajusta volumen → se mantiene al cambiar entre dispositivos

## Debugging

Para debuggear el sistema de sincronización:

```typescript
// En changeCommonData
console.log('[Sync] Updating state:', data);
console.log('[Sync] Current syncState:', syncState);
console.log('[Sync] New syncState:', { ...syncState, ...data });

// En flavours al montar
console.log('[Flavour] Received initialState:', props.initialState);
console.log('[Flavour] Starting position:', props.initialState?.isPaused);
```

## Migración desde Sistema Anterior

### Antes (mutación directa)
```typescript
if (data?.time && dpoData?.playerProgress) {
    dpoData.playerProgress.currentTime = data.time; // ❌ Mutación
}
```

### Ahora (estado inmutable)
```typescript
setSyncState((prev) => ({ ...prev, ...data })); // ✅ Inmutable
```

### Antes (sin propagación)
```typescript
// Cambios no se reflejaban en flavours
```

### Ahora (propagación automática)
```typescript
<AudioFlavour
    initialState={{
        ...dpoData.initialState,
        isPaused: syncState.paused ?? dpoData.initialState?.isPaused,
    }}
/>
```

## Conclusión

El nuevo sistema de sincronización proporciona una solución robusta, reactiva e inmutable para mantener el estado del player consistente entre diferentes modos de reproducción (móvil ↔ Chromecast), mejorando significativamente la experiencia del usuario.
