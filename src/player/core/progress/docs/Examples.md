# Ejemplos - Progress Management System

Colección de ejemplos prácticos para usar el sistema de gestión de progreso.

## 📋 Índice

- [Configuración Básica](#configuración-básica)
- [VOD Examples](#vod-examples)
- [DVR Examples](#dvr-examples)
- [React Integration](#react-integration)
- [Cast Integration](#cast-integration)
- [Advanced Examples](#advanced-examples)

## 🚀 Configuración Básica

### Ejemplo 1: Setup Mínimo

```typescript
import { ProgressManagerUnified } from '@player/core/progress';

const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => console.log('VOD:', data),
  },
  dvr: {
    onProgressUpdate: (data) => console.log('DVR:', data),
  },
  initialContentType: 'vod',
});
```

### Ejemplo 2: Setup Completo

```typescript
import { ProgressManagerUnified, DVR_PLAYBACK_TYPE } from '@player/core/progress';
import { createLogger } from '@player/features/logger';

const logger = createLogger('ProgressManager');

const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: {
    onProgressUpdate: handleVODProgress,
    currentTime: 0,
    duration: 0,
    isPaused: false,
    isBuffering: false,
    autoSeekToEnd: false,
    enableLooping: false,
  },
  dvr: {
    onProgressUpdate: handleDVRProgress,
    onModeChange: handleModeChange,
    onProgramChange: handleProgramChange,
    onEPGRequest: handleEPGRequest,
    onEPGError: handleEPGError,
    getEPGProgramAt: fetchEPGProgram,
    dvrWindowSeconds: 3600,
    playbackType: DVR_PLAYBACK_TYPE.WINDOW,
  },
  logger,
  loggerEnabled: true,
  loggerLevel: 'info',
  initialContentType: 'vod',
});
```

## 📺 VOD Examples

### Ejemplo 3: VOD Player Básico

```typescript
import React, { useEffect, useRef } from 'react';
import Video from 'react-native-video';
import { ProgressManagerUnified } from '@player/core/progress';

const VODPlayer = ({ source }) => {
  const videoRef = useRef(null);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      vod: {
        onProgressUpdate: (data) => {
          console.log('Progress:', data.currentTime, '/', data.duration);
        },
      },
      initialContentType: 'vod',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  const handleLoad = (event) => {
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: false,
    });
  };
  
  const handleProgress = (event) => {
    progressManagerRef.current?.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
      isPaused: false,
      isBuffering: false,
    });
  };
  
  return (
    <Video
      ref={videoRef}
      source={source}
      onLoad={handleLoad}
      onProgress={handleProgress}
      progressUpdateInterval={1000}
    />
  );
};
```

### Ejemplo 4: VOD con Slider Custom

```typescript
import React, { useState } from 'react';
import Slider from '@react-native-community/slider';

const VODPlayerWithSlider = () => {
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  const handleProgress = (event) => {
    if (!isSeeking) {
      progressManagerRef.current?.updatePlayerData({
        currentTime: event.currentTime,
        duration: event.playableDuration,
      });
      
      const values = progressManagerRef.current?.getSliderValues();
      if (values) {
        setSliderValue(values.progress);
      }
    }
  };
  
  const handleSliderStart = () => {
    setIsSeeking(true);
  };
  
  const handleSliderMove = (value) => {
    setSliderValue(value);
  };
  
  const handleSliderComplete = async (value) => {
    setIsSeeking(false);
    
    const seekTime = progressManagerRef.current?.sliderValueToSeekTime(value);
    if (seekTime !== undefined) {
      await videoRef.current?.seek(seekTime);
    }
  };
  
  const values = progressManagerRef.current?.getSliderValues() || {
    minimumValue: 0,
    maximumValue: 100,
  };
  
  return (
    <View>
      <Video
        ref={videoRef}
        onProgress={handleProgress}
        // ... otros props
      />
      
      <Slider
        value={sliderValue}
        minimumValue={values.minimumValue}
        maximumValue={values.maximumValue}
        onSlidingStart={handleSliderStart}
        onValueChange={handleSliderMove}
        onSlidingComplete={handleSliderComplete}
      />
      
      <Text>
        {formatTime(sliderValue)} / {formatTime(values.duration)}
      </Text>
    </View>
  );
};
```

### Ejemplo 5: VOD con Skip Buttons

```typescript
const VODPlayerWithSkip = () => {
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  const handleSkip = async (direction: 'forward' | 'backward') => {
    const skipTime = progressManagerRef.current?.calculateSkipTime(
      direction,
      10 // 10 segundos
    );
    
    if (skipTime !== undefined) {
      await videoRef.current?.seek(skipTime);
    }
  };
  
  return (
    <View>
      <Video ref={videoRef} />
      
      <View style={styles.controls}>
        <Button
          title="⏪ -10s"
          onPress={() => handleSkip('backward')}
        />
        <Button
          title="+10s ⏩"
          onPress={() => handleSkip('forward')}
        />
      </View>
    </View>
  );
};
```

## 📡 DVR Examples

### Ejemplo 6: DVR Player Básico

```typescript
const DVRPlayer = ({ source }) => {
  const videoRef = useRef(null);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        onProgressUpdate: (data) => {
          console.log('Live offset:', data.liveEdgeOffset, 'seconds');
          console.log('Is live:', data.isLiveEdgePosition);
        },
        onProgramChange: (data) => {
          if (data.currentProgram) {
            console.log('Program:', data.currentProgram.title);
          }
        },
        getEPGProgramAt: async (timestamp) => {
          const response = await fetch(`/api/epg?time=${timestamp}`);
          return await response.json();
        },
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  const handleLoad = (event) => {
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: true,
      seekableRange: event.seekableRange,
    });
  };
  
  const handleProgress = async (event) => {
    await progressManagerRef.current?.updatePlayerData({
      currentTime: event.currentTime,
      seekableRange: event.seekableRange,
      isPaused: false,
      isBuffering: false,
    });
  };
  
  return (
    <Video
      ref={videoRef}
      source={source}
      onLoad={handleLoad}
      onProgress={handleProgress}
    />
  );
};
```

### Ejemplo 7: DVR con Live Button

```typescript
const DVRPlayerWithLiveButton = () => {
  const [isAtLive, setIsAtLive] = useState(true);
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        onProgressUpdate: (data) => {
          setIsAtLive(data.isLiveEdgePosition);
        },
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  const handleGoToLive = () => {
    progressManagerRef.current?.goToLive();
  };
  
  return (
    <View>
      <Video ref={videoRef} />
      
      {!isAtLive && (
        <Button
          title="🔴 IR AL DIRECTO"
          onPress={handleGoToLive}
        />
      )}
      
      {isAtLive && (
        <View style={styles.liveBadge}>
          <Text>🔴 EN DIRECTO</Text>
        </View>
      )}
    </View>
  );
};
```

### Ejemplo 8: DVR con Program Info

```typescript
const DVRPlayerWithProgramInfo = () => {
  const [currentProgram, setCurrentProgram] = useState(null);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        onProgramChange: (data) => {
          setCurrentProgram(data.currentProgram);
        },
        getEPGProgramAt: fetchEPGProgram,
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  return (
    <View>
      <Video />
      
      {currentProgram && (
        <View style={styles.programInfo}>
          <Text style={styles.title}>{currentProgram.title}</Text>
          <Text style={styles.description}>
            {currentProgram.description}
          </Text>
          <Text style={styles.time}>
            {formatTime(currentProgram.startDate)} - 
            {formatTime(currentProgram.endDate)}
          </Text>
        </View>
      )}
    </View>
  );
};
```

### Ejemplo 9: DVR con Modos de Reproducción

```typescript
import { DVR_PLAYBACK_TYPE } from '@player/core/progress';

const DVRPlayerWithModes = () => {
  const [mode, setMode] = useState(DVR_PLAYBACK_TYPE.WINDOW);
  const progressManagerRef = useRef(null);
  
  const handleModeChange = (newMode: DVR_PLAYBACK_TYPE) => {
    progressManagerRef.current?.setPlaybackType(newMode);
    setMode(newMode);
  };
  
  return (
    <View>
      <Video />
      
      <View style={styles.modeSelector}>
        <Button
          title="WINDOW"
          onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.WINDOW)}
          disabled={mode === DVR_PLAYBACK_TYPE.WINDOW}
        />
        <Button
          title="PROGRAM"
          onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.PROGRAM)}
          disabled={mode === DVR_PLAYBACK_TYPE.PROGRAM}
        />
        <Button
          title="PLAYLIST"
          onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.PLAYLIST)}
          disabled={mode === DVR_PLAYBACK_TYPE.PLAYLIST}
        />
      </View>
    </View>
  );
};
```

## ⚛️ React Integration

### Ejemplo 10: Custom Hook

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { ProgressManagerUnified } from '@player/core/progress';

const useProgressManager = (config) => {
  const managerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    manager.initialize(config);
    managerRef.current = manager;
    
    return () => {
      manager.dispose();
    };
  }, [config]);
  
  const updatePlayerData = useCallback(async (data) => {
    await managerRef.current?.updatePlayerData(data);
  }, []);
  
  const getSliderValues = useCallback(() => {
    return managerRef.current?.getSliderValues();
  }, []);
  
  const goToLive = useCallback(() => {
    managerRef.current?.goToLive();
  }, []);
  
  return {
    manager: managerRef.current,
    updatePlayerData,
    getSliderValues,
    goToLive,
  };
};

// Uso
const VideoPlayer = () => {
  const { updatePlayerData, getSliderValues, goToLive } = useProgressManager({
    vod: { onProgressUpdate: handleVODProgress },
    dvr: { onProgressUpdate: handleDVRProgress },
  });
  
  return <Video onProgress={updatePlayerData} />;
};
```

### Ejemplo 11: Context Provider

```typescript
import React, { createContext, useContext, useRef } from 'react';

const ProgressManagerContext = createContext(null);

export const ProgressManagerProvider = ({ children, config }) => {
  const managerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    manager.initialize(config);
    managerRef.current = manager;
    
    return () => manager.dispose();
  }, [config]);
  
  return (
    <ProgressManagerContext.Provider value={managerRef.current}>
      {children}
    </ProgressManagerContext.Provider>
  );
};

export const useProgressManager = () => {
  const manager = useContext(ProgressManagerContext);
  if (!manager) {
    throw new Error('useProgressManager must be used within ProgressManagerProvider');
  }
  return manager;
};

// Uso
const App = () => (
  <ProgressManagerProvider config={config}>
    <VideoPlayer />
  </ProgressManagerProvider>
);

const VideoPlayer = () => {
  const progressManager = useProgressManager();
  
  const handleProgress = async (event) => {
    await progressManager.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
    });
  };
  
  return <Video onProgress={handleProgress} />;
};
```

## 📱 Cast Integration

### Ejemplo 12: Cast con Progress Manager

```typescript
const CastPlayer = () => {
  const progressManagerRef = useRef(null);
  const { castState, castStreamPosition } = useCastState();
  
  useEffect(() => {
    if (castState === 'CONNECTED') {
      // Actualizar con datos de Cast
      progressManagerRef.current?.updatePlayerData({
        currentTime: castStreamPosition,
        seekableRange: castSeekableRange,
        isPaused: castIsPaused,
        isBuffering: castIsBuffering,
      });
    }
  }, [castState, castStreamPosition]);
  
  return <CastButton />;
};
```

## 🎯 Advanced Examples

### Ejemplo 13: Detección Automática de Tipo

```typescript
const SmartPlayer = ({ source }) => {
  const progressManagerRef = useRef(null);
  
  const handleLoad = (event) => {
    // El manager detecta automáticamente VOD vs Live
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: event.isLive,
      seekableRange: event.seekableRange,
    });
    
    // Verificar tipo detectado
    const isLive = progressManagerRef.current?.isLiveContent();
    console.log('Content type:', isLive ? 'Live' : 'VOD');
  };
  
  return <Video onLoad={handleLoad} />;
};
```

### Ejemplo 14: Manejo de Errores Completo

```typescript
import { PlayerError } from '@player/core/errors';

const RobustPlayer = () => {
  const [error, setError] = useState(null);
  const progressManagerRef = useRef(null);
  
  const handleProgress = async (event) => {
    try {
      await progressManagerRef.current?.updatePlayerData({
        currentTime: event.currentTime,
        duration: event.playableDuration,
      });
      setError(null);
    } catch (err) {
      if (err instanceof PlayerError) {
        console.error('Progress error:', err.key, err.context);
        setError(err.message);
        
        // Intentar recuperación
        if (err.key === 'PLAYER_PROGRESS_UPDATE_FAILED') {
          // Reintentar después de 1 segundo
          setTimeout(() => handleProgress(event), 1000);
        }
      }
    }
  };
  
  return (
    <View>
      <Video onProgress={handleProgress} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};
```

### Ejemplo 15: Multi-Source Player

```typescript
const MultiSourcePlayer = ({ sources }) => {
  const [currentSource, setCurrentSource] = useState(0);
  const progressManagerRef = useRef(null);
  
  const handleSourceChange = (index) => {
    // Reset al cambiar de fuente
    progressManagerRef.current?.reset();
    setCurrentSource(index);
  };
  
  const handleLoad = (event) => {
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: event.isLive,
    });
  };
  
  return (
    <View>
      <Video
        source={sources[currentSource]}
        onLoad={handleLoad}
      />
      
      <View style={styles.sourceSelector}>
        {sources.map((_, index) => (
          <Button
            key={index}
            title={`Source ${index + 1}`}
            onPress={() => handleSourceChange(index)}
          />
        ))}
      </View>
    </View>
  );
};
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa de uso
- [API Reference](./API.md) - Referencia completa de la API
- [Error Handling](./ErrorHandling.md) - Manejo de errores
- [ProgressManagerUnified](./ProgressManagerUnified.md) - Documentación detallada

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
