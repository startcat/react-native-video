# Guía de Uso - Progress Management System

Guía completa para usar el sistema de gestión de progreso en react-native-video.

## 📋 Índice

- [Instalación](#instalación)
- [Configuración Básica](#configuración-básica)
- [Uso con VOD](#uso-con-vod)
- [Uso con DVR/Live](#uso-con-dvrlive)
- [Callbacks y Eventos](#callbacks-y-eventos)
- [Operaciones Comunes](#operaciones-comunes)

## 🚀 Instalación

El sistema de progreso viene incluido en react-native-video. Solo necesitas importarlo:

```typescript
import { ProgressManagerUnified } from '@player/core/progress';
```

## ⚙️ Configuración Básica

### 1. Crear Instancia

```typescript
const progressManager = new ProgressManagerUnified();
```

### 2. Inicializar con Configuración

```typescript
progressManager.initialize({
  // Configuración para VOD
  vod: {
    onProgressUpdate: (data) => {
      console.log('VOD Progress:', data);
    },
    currentTime: 0,
    duration: 0,
    isPaused: false,
    isBuffering: false,
  },
  
  // Configuración para DVR
  dvr: {
    onProgressUpdate: (data) => {
      console.log('DVR Progress:', data);
    },
    onModeChange: (data) => {
      console.log('DVR Mode:', data.playbackType);
    },
    onProgramChange: (data) => {
      console.log('Program:', data.currentProgram);
    },
    onEPGRequest: (timestamp) => {
      console.log('EPG requested for:', new Date(timestamp));
    },
    onEPGError: (data) => {
      console.error('EPG Error:', data.error);
    },
    getEPGProgramAt: async (timestamp) => {
      // Implementar consulta a tu servicio EPG
      return await fetchEPGProgram(timestamp);
    },
  },
  
  // Configuración general
  logger: myLogger,
  loggerEnabled: true,
  loggerLevel: 'info',
  initialContentType: 'vod', // 'vod' o 'live'
});
```

### 3. Notificar Carga de Contenido

```typescript
// El manager detecta automáticamente el tipo
progressManager.onContentLoaded({
  duration: 3600,
  isLive: false, // true para DVR/Live
  seekableRange: { start: 0, end: 3600 },
});
```

## 📺 Uso con VOD

### Actualizar Progreso

```typescript
// Desde eventos del player
const handleProgress = (event: OnProgressData) => {
  progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration,
    isPaused: false,
    isBuffering: false,
  });
};
```

### Obtener Valores para UI

```typescript
const sliderValues = progressManager.getSliderValues();

console.log('Progress:', sliderValues.progress); // Tiempo actual
console.log('Min:', sliderValues.minimumValue); // 0
console.log('Max:', sliderValues.maximumValue); // Duración
console.log('Duration:', sliderValues.duration); // Duración total
```

### Operaciones de Seek

```typescript
// Seek a tiempo específico
const seekTime = 120; // 2 minutos
const validTime = progressManager.validateSeekTime(seekTime);
await transport.seek(validTime);

// Skip forward/backward
const skipTime = progressManager.calculateSkipTime('forward', 10);
await transport.seek(skipTime);

// Seek desde slider (0-1)
const sliderValue = 0.5; // 50%
const seekTime = progressManager.sliderValueToSeekTime(sliderValue);
await transport.seek(seekTime);
```

## 📡 Uso con DVR/Live

### Actualizar Progreso DVR

```typescript
const handleProgress = async (event: OnProgressData) => {
  await progressManager.updatePlayerData({
    currentTime: event.currentTime,
    seekableRange: event.seekableRange, // ¡IMPORTANTE para DVR!
    isPaused: false,
    isBuffering: false,
  });
};
```

### Obtener Valores DVR

```typescript
const sliderValues = progressManager.getSliderValues();

console.log('Progress:', sliderValues.progress); // Timestamp actual
console.log('Live Edge:', sliderValues.liveEdge); // Timestamp del directo
console.log('Live Offset:', sliderValues.liveEdgeOffset); // Segundos detrás del directo
console.log('Is Live:', sliderValues.isLiveEdgePosition); // ¿Está en directo?
console.log('Window Start:', sliderValues.windowStart); // Inicio ventana DVR
```

### Modos de Reproducción DVR

#### WINDOW (Por defecto)
Slider representa toda la ventana DVR disponible.

```typescript
// El modo WINDOW se activa automáticamente al cargar contenido live
progressManager.onContentLoaded({
  duration: 3600,
  isLive: true,
  seekableRange: { start: 0, end: 3600 },
});
```

#### PROGRAM
Slider limitado a un programa específico.

```typescript
import { DVR_PLAYBACK_TYPE } from '@player/core/progress';

progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);

// El programa se obtiene automáticamente del EPG
// o puedes forzar uno específico en la configuración
```

#### PLAYLIST
Slider se adapta al programa actual automáticamente.

```typescript
progressManager.setPlaybackType(DVR_PLAYBACK_TYPE.PLAYLIST);

// El slider cambiará automáticamente cuando cambie el programa
```

### Ir al Directo

```typescript
// Navegar al live edge
progressManager.goToLive();

// Verificar si estamos en directo
const isLive = progressManager.isAtLiveEdge();
console.log('Is at live edge:', isLive);
```

### Gestión de Programas EPG

```typescript
// Obtener programa actual
const currentProgram = await progressManager.getCurrentProgram();
if (currentProgram) {
  console.log('Program:', currentProgram.title);
  console.log('Start:', new Date(currentProgram.startDate));
  console.log('End:', new Date(currentProgram.endDate));
}

// Obtener programas disponibles
const programs = progressManager.getAvailablePrograms();
```

## 🔔 Callbacks y Eventos

### Callback de Progreso

```typescript
const handleProgressUpdate = (data: any) => {
  // VOD
  if (!data.isLive) {
    updateUI({
      currentTime: data.currentTime,
      duration: data.duration,
      progress: data.progress,
    });
  }
  
  // DVR
  else {
    updateUI({
      currentTime: data.progressDatum,
      liveEdge: data.liveEdge,
      offset: data.liveEdgeOffset,
      isLive: data.isLiveEdgePosition,
    });
  }
};
```

### Callback de Cambio de Modo DVR

```typescript
const handleModeChange = (data: ModeChangeData) => {
  console.log('Mode changed to:', data.playbackType);
  console.log('Previous mode:', data.previousPlaybackType);
  
  // Actualizar UI según el modo
  switch (data.playbackType) {
    case DVR_PLAYBACK_TYPE.WINDOW:
      showFullDVRWindow();
      break;
    case DVR_PLAYBACK_TYPE.PROGRAM:
      showProgramMode();
      break;
    case DVR_PLAYBACK_TYPE.PLAYLIST:
      showPlaylistMode();
      break;
  }
};
```

### Callback de Cambio de Programa

```typescript
const handleProgramChange = (data: ProgramChangeData) => {
  const program = data.currentProgram;
  
  if (program) {
    console.log('New program:', program.title);
    console.log('Duration:', program.duration);
    
    // Actualizar UI con información del programa
    updateProgramInfo({
      title: program.title,
      description: program.description,
      startTime: new Date(program.startDate),
      endTime: new Date(program.endDate),
    });
  } else {
    console.log('No program available');
    clearProgramInfo();
  }
};
```

### Callback de Error EPG

```typescript
const handleEPGError = (data: EPGErrorData) => {
  console.error('EPG Error:', data.error);
  console.log('Timestamp:', new Date(data.timestamp));
  console.log('Retry count:', data.retryCount);
  
  // Mostrar error al usuario si es crítico
  if (data.retryCount >= 3) {
    showError('No se pudo cargar información del programa');
  }
};
```

## 🛠️ Operaciones Comunes

### Seek Manual con Slider

```typescript
// Al iniciar el drag del slider
const handleSliderStart = () => {
  progressManager.startManualSeeking();
};

// Durante el drag
const handleSliderMove = (value: number) => {
  const seekTime = progressManager.sliderValueToSeekTime(value);
  // Mostrar preview del tiempo sin hacer seek
  showSeekPreview(seekTime);
};

// Al soltar el slider
const handleSliderComplete = async (value: number) => {
  progressManager.endManualSeeking();
  const seekTime = progressManager.sliderValueToSeekTime(value);
  await transport.seek(seekTime);
};
```

### Cambiar entre VOD y Live

```typescript
// El manager detecta automáticamente, pero puedes forzar
progressManager.setContentType('live');

// Verificar tipo actual
const isLive = progressManager.isLiveContent();
```

### Obtener Estadísticas

```typescript
const stats = progressManager.getStats();
console.log('Stats:', {
  currentTime: stats.currentTime,
  duration: stats.duration,
  seekableRange: stats.seekableRange,
  isPaused: stats.isPaused,
  isBuffering: stats.isBuffering,
  isInitialized: stats.isInitialized,
});
```

### Reset y Cleanup

```typescript
// Reset al cambiar de contenido
progressManager.reset();

// Cleanup al desmontar
progressManager.dispose();
```

## 🎯 Ejemplo Completo

```typescript
import React, { useEffect, useRef } from 'react';
import { ProgressManagerUnified, DVR_PLAYBACK_TYPE } from '@player/core/progress';

const VideoPlayer = () => {
  const progressManagerRef = useRef<ProgressManagerUnified>(null);
  
  useEffect(() => {
    // Crear e inicializar
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      vod: {
        onProgressUpdate: handleVODProgress,
      },
      dvr: {
        onProgressUpdate: handleDVRProgress,
        onModeChange: handleModeChange,
        onProgramChange: handleProgramChange,
        getEPGProgramAt: fetchEPGProgram,
      },
      logger: myLogger,
    });
    
    progressManagerRef.current = manager;
    
    // Cleanup
    return () => {
      manager.dispose();
    };
  }, []);
  
  const handleContentLoaded = (event: OnLoadData) => {
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: event.isLive,
      seekableRange: event.seekableRange,
    });
  };
  
  const handleProgress = async (event: OnProgressData) => {
    await progressManagerRef.current?.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
      seekableRange: event.seekableRange,
      isPaused: false,
      isBuffering: false,
    });
  };
  
  const handleSeek = async (value: number) => {
    const manager = progressManagerRef.current;
    if (!manager) return;
    
    const seekTime = manager.sliderValueToSeekTime(value);
    const validTime = manager.validateSeekTime(seekTime);
    await videoRef.current?.seek(validTime);
  };
  
  return (
    <Video
      onLoad={handleContentLoaded}
      onProgress={handleProgress}
      // ... otros props
    />
  );
};
```

## 📚 Próximos Pasos

- [API Reference](./API.md) - Referencia completa de métodos
- [Ejemplos](./Examples.md) - Más ejemplos de uso
- [Troubleshooting](./Troubleshooting.md) - Solución de problemas
- [Integración DVR](./DVRIntegration.md) - Guía detallada de DVR

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
