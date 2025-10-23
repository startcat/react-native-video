# Troubleshooting - Progress Management System

Guía de solución de problemas comunes del sistema de gestión de progreso.

## 📋 Índice

- [Errores de Inicialización](#errores-de-inicialización)
- [Problemas de Actualización](#problemas-de-actualización)
- [Problemas de Seek](#problemas-de-seek)
- [Problemas DVR](#problemas-dvr)
- [Problemas de Rendimiento](#problemas-de-rendimiento)

## ⚠️ Errores de Inicialización

### Error: Manager not initialized

**Síntoma:**
```
PlayerError: PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED
```

**Causa:** Intentar usar el manager sin llamar `initialize()`.

**Solución:**
```typescript
// Inicializar antes de usar
const progressManager = new ProgressManagerUnified();
progressManager.initialize(config);

// Luego usar
await progressManager.updatePlayerData(data);
```

---

### Error: Already initialized

**Síntoma:**
```
PlayerError: PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED
Reason: Already initialized. Call reset() first
```

**Causa:** Intentar inicializar un manager ya inicializado.

**Solución:**
```typescript
// Opción 1: Reset antes de reinicializar
progressManager.reset();
progressManager.initialize(newConfig);

// Opción 2: Crear nueva instancia
const progressManager = new ProgressManagerUnified();
progressManager.initialize(config);
```

---

### Error: Manager creation failed

**Síntoma:**
```
PlayerError: PLAYER_PROGRESS_MANAGER_CREATION_FAILED
```

**Causa:** Error al crear VOD o DVR manager interno.

**Solución:**
```typescript
// Verificar configuración
progressManager.initialize({
  vod: {
    onProgressUpdate: validCallback, // Debe ser función o null
  },
  dvr: {
    onProgressUpdate: validCallback,
    getEPGProgramAt: validAsyncFunction, // Debe retornar Promise
  },
});
```

## 🔄 Problemas de Actualización

### Progress no se actualiza

**Síntoma:** El progreso no cambia en la UI.

**Diagnóstico:**
```typescript
// Verificar que el callback se llama
progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => {
      console.log('Progress update:', data); // ¿Se llama?
    },
  },
});

// Verificar que updatePlayerData se llama
const handleProgress = async (event) => {
  console.log('Updating:', event.currentTime); // ¿Se llama?
  await progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration,
  });
};
```

**Soluciones:**

1. **Verificar interval de actualización**
```typescript
<Video
  progressUpdateInterval={1000} // Actualizar cada segundo
  onProgress={handleProgress}
/>
```

2. **Verificar que no hay errores silenciosos**
```typescript
const handleProgress = async (event) => {
  try {
    await progressManager.updatePlayerData(data);
  } catch (error) {
    console.error('Update error:', error);
  }
};
```

3. **Verificar estado del manager**
```typescript
const stats = progressManager.getStats();
console.log('Manager stats:', stats);
```

---

### Valores incorrectos en slider

**Síntoma:** El slider muestra valores incorrectos o NaN.

**Solución:**
```typescript
const values = progressManager.getSliderValues();

// Verificar valores válidos
const progress = isNaN(values.progress) ? 0 : values.progress;
const min = isNaN(values.minimumValue) ? 0 : values.minimumValue;
const max = isNaN(values.maximumValue) ? 100 : values.maximumValue;

<Slider
  value={progress}
  minimumValue={min}
  maximumValue={max}
/>
```

---

### Update failed error

**Síntoma:**
```
PlayerError: PLAYER_PROGRESS_UPDATE_FAILED
```

**Diagnóstico:**
```typescript
catch (error) {
  if (error instanceof PlayerError) {
    console.log('Context:', error.context);
    // Ver datos que causaron el error
  }
}
```

**Soluciones:**

1. **Validar datos antes de actualizar**
```typescript
const handleProgress = async (event) => {
  // Validar datos
  if (typeof event.currentTime !== 'number' || isNaN(event.currentTime)) {
    console.warn('Invalid currentTime:', event.currentTime);
    return;
  }
  
  await progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration || 0,
  });
};
```

2. **Implementar retry**
```typescript
const updateWithRetry = async (data, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await progressManager.updatePlayerData(data);
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000);
    }
  }
};
```

## 🎯 Problemas de Seek

### Invalid seek time error

**Síntoma:**
```
PlayerError: PLAYER_PROGRESS_INVALID_SEEK_TIME
```

**Solución:**
```typescript
// Siempre validar antes de seek
const handleSeek = async (requestedTime) => {
  try {
    const validTime = progressManager.validateSeekTime(requestedTime);
    await videoRef.current?.seek(validTime);
  } catch (error) {
    if (error instanceof PlayerError) {
      const range = error.context?.seekableRange;
      console.log(`Valid range: ${range.start}s - ${range.end}s`);
    }
  }
};
```

---

### Seek no funciona

**Síntoma:** El seek no tiene efecto.

**Diagnóstico:**
```typescript
const handleSeek = async (value) => {
  console.log('Slider value:', value);
  
  const seekTime = progressManager.sliderValueToSeekTime(value);
  console.log('Seek time:', seekTime);
  
  const validTime = progressManager.validateSeekTime(seekTime);
  console.log('Valid time:', validTime);
  
  await videoRef.current?.seek(validTime);
};
```

**Soluciones:**

1. **Verificar referencia del video**
```typescript
const videoRef = useRef(null);

<Video ref={videoRef} />

// Verificar que la ref existe
if (videoRef.current) {
  await videoRef.current.seek(seekTime);
}
```

2. **Usar método correcto según plataforma**
```typescript
// iOS/Android
await videoRef.current?.seek(seekTime);

// Cast
castClient.seek(seekTime);
```

---

### Slider salta durante seek manual

**Síntoma:** El slider salta mientras se arrastra.

**Solución:**
```typescript
const [isSeeking, setIsSeeking] = useState(false);
const [sliderValue, setSliderValue] = useState(0);

const handleProgress = (event) => {
  // No actualizar durante seek manual
  if (!isSeeking) {
    const values = progressManager.getSliderValues();
    setSliderValue(values.progress);
  }
};

const handleSliderStart = () => {
  setIsSeeking(true);
  progressManager.startManualSeeking(); // Para DVR
};

const handleSliderMove = (value) => {
  setSliderValue(value);
};

const handleSliderComplete = async (value) => {
  setIsSeeking(false);
  progressManager.endManualSeeking(); // Para DVR
  
  const seekTime = progressManager.sliderValueToSeekTime(value);
  await videoRef.current?.seek(seekTime);
};
```

## 📡 Problemas DVR

### Live edge no se actualiza

**Síntoma:** El indicador de "EN DIRECTO" no cambia.

**Solución:**
```typescript
// Asegurar que seekableRange se proporciona
const handleProgress = async (event) => {
  await progressManager.updatePlayerData({
    currentTime: event.currentTime,
    seekableRange: event.seekableRange, // ¡IMPORTANTE!
    isPaused: false,
  });
};

// Verificar estado
const isLive = progressManager.isAtLiveEdge();
console.log('Is at live edge:', isLive);
```

---

### EPG no carga

**Síntoma:** Los programas no se muestran.

**Diagnóstico:**
```typescript
progressManager.initialize({
  dvr: {
    getEPGProgramAt: async (timestamp) => {
      console.log('EPG requested for:', new Date(timestamp));
      try {
        const program = await fetchEPGProgram(timestamp);
        console.log('EPG response:', program);
        return program;
      } catch (error) {
        console.error('EPG error:', error);
        throw error;
      }
    },
    onEPGError: (data) => {
      console.error('EPG Error:', data.error);
      console.log('Retry count:', data.retryCount);
    },
  },
});
```

**Soluciones:**

1. **Verificar formato de respuesta**
```typescript
// El programa debe tener esta estructura
{
  title: string;
  description: string;
  startDate: number; // Unix timestamp
  endDate: number;   // Unix timestamp
  duration: number;  // Segundos
}
```

2. **Implementar manejo de errores**
```typescript
getEPGProgramAt: async (timestamp) => {
  try {
    const response = await fetch(`/api/epg?time=${timestamp}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('EPG fetch error:', error);
    // Retornar programa por defecto
    return {
      title: 'Programa no disponible',
      description: '',
      startDate: timestamp,
      endDate: timestamp + 3600000,
      duration: 3600,
    };
  }
},
```

---

### Go to live no funciona

**Síntoma:** El botón "IR AL DIRECTO" no tiene efecto.

**Solución:**
```typescript
const handleGoToLive = () => {
  // Verificar que es contenido live
  if (!progressManager.isLiveContent()) {
    console.warn('Not live content');
    return;
  }
  
  // Ejecutar goToLive
  progressManager.goToLive();
  
  // Verificar resultado
  setTimeout(() => {
    const isLive = progressManager.isAtLiveEdge();
    console.log('After goToLive, is at live:', isLive);
  }, 1000);
};
```

---

### Modo DVR no cambia

**Síntoma:** `setPlaybackType` no tiene efecto.

**Solución:**
```typescript
import { DVR_PLAYBACK_TYPE } from '@player/core/progress';

// Verificar que es contenido live
if (progressManager.isLiveContent()) {
  progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);
  
  // Verificar con callback
  progressManager.onDVRModeChange((mode) => {
    console.log('Mode changed to:', mode);
  });
}
```

## ⚡ Problemas de Rendimiento

### Updates muy frecuentes

**Síntoma:** La UI se actualiza demasiado rápido, causando lag.

**Solución:**
```typescript
// Throttle de updates
import { throttle } from 'lodash';

const throttledUpdate = throttle(
  async (data) => {
    await progressManager.updatePlayerData(data);
  },
  1000 // Máximo 1 update por segundo
);

const handleProgress = (event) => {
  throttledUpdate({
    currentTime: event.currentTime,
    duration: event.playableDuration,
  });
};
```

---

### Memory leaks

**Síntoma:** Uso de memoria crece con el tiempo.

**Solución:**
```typescript
useEffect(() => {
  const manager = new ProgressManagerUnified();
  manager.initialize(config);
  
  // ¡IMPORTANTE! Cleanup al desmontar
  return () => {
    manager.dispose();
  };
}, []);
```

---

### Callbacks no se limpian

**Síntoma:** Callbacks se ejecutan después de desmontar.

**Solución:**
```typescript
useEffect(() => {
  const manager = new ProgressManagerUnified();
  
  const handleProgress = (data) => {
    // Verificar que el componente está montado
    if (isMountedRef.current) {
      updateUI(data);
    }
  };
  
  manager.initialize({
    vod: { onProgressUpdate: handleProgress },
  });
  
  return () => {
    isMountedRef.current = false;
    manager.dispose();
  };
}, []);
```

## 🔍 Debugging Tips

### Habilitar Logs

```typescript
progressManager.initialize({
  logger: createLogger('ProgressManager'),
  loggerEnabled: true,
  loggerLevel: 'debug', // 'debug' | 'info' | 'warn' | 'error'
});
```

### Inspeccionar Estado

```typescript
// Obtener estadísticas completas
const stats = progressManager.getStats();
console.log('Manager stats:', JSON.stringify(stats, null, 2));

// Verificar tipo de contenido
console.log('Is live:', progressManager.isLiveContent());

// Verificar valores del slider
const values = progressManager.getSliderValues();
console.log('Slider values:', JSON.stringify(values, null, 2));
```

### Verificar Inicialización

```typescript
try {
  progressManager.initialize(config);
  console.log('✅ Manager initialized successfully');
} catch (error) {
  console.error('❌ Initialization failed:', error);
  if (error instanceof PlayerError) {
    console.error('Error code:', error.key);
    console.error('Context:', error.context);
  }
}
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa de uso
- [Error Handling](./ErrorHandling.md) - Manejo de errores
- [Examples](./Examples.md) - Ejemplos de uso
- [API Reference](./API.md) - Referencia completa

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
