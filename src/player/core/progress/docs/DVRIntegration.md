# Integración DVR - Progress Management System

Guía detallada para integrar el sistema de progreso con contenido DVR/Live.

## 📋 Índice

- [Configuración Básica](#configuración-básica)
- [Integración con EPG](#integración-con-epg)
- [UI Components](#ui-components)
- [Modos de Reproducción](#modos-de-reproducción)
- [Casos de Uso Avanzados](#casos-de-uso-avanzados)

## 🚀 Configuración Básica

### Setup Inicial

```typescript
import { ProgressManagerUnified, DVR_PLAYBACK_TYPE } from '@player/core/progress';

const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  dvr: {
    onProgressUpdate: (data) => {
      updateDVRUI(data);
    },
    onModeChange: (data) => {
      console.log('Mode:', data.playbackType);
    },
    onProgramChange: (data) => {
      if (data.currentProgram) {
        showProgramInfo(data.currentProgram);
      }
    },
    onEPGRequest: (timestamp) => {
      console.log('EPG requested:', new Date(timestamp));
    },
    onEPGError: (data) => {
      console.error('EPG error:', data.error);
    },
    getEPGProgramAt: fetchEPGProgram,
    dvrWindowSeconds: 3600,
    playbackType: DVR_PLAYBACK_TYPE.WINDOW,
  },
  initialContentType: 'live',
});
```

## 📺 Integración con EPG

### Implementar Servicio EPG

```typescript
const fetchEPGProgram = async (timestamp: number) => {
  try {
    const response = await fetch(
      `https://api.example.com/epg?time=${timestamp}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const program = await response.json();
    
    // Validar formato
    if (!program.title || !program.startDate || !program.endDate) {
      throw new Error('Invalid program format');
    }
    
    return {
      id: program.id,
      title: program.title,
      description: program.description,
      startDate: program.startDate, // Unix timestamp (ms)
      endDate: program.endDate,     // Unix timestamp (ms)
      duration: (program.endDate - program.startDate) / 1000, // segundos
      imageUrl: program.imageUrl,
    };
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
};
```

### Caché de EPG

```typescript
class EPGCache {
  private cache = new Map<number, any>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutos
  
  async getProgram(timestamp: number, fetcher: (ts: number) => Promise<any>) {
    // Redondear a minuto para mejorar hit rate
    const key = Math.floor(timestamp / 60000) * 60000;
    
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTimeout) {
      return cached.program;
    }
    
    const program = await fetcher(timestamp);
    this.cache.set(key, {
      program,
      fetchedAt: Date.now(),
    });
    
    return program;
  }
  
  clear() {
    this.cache.clear();
  }
}

// Uso
const epgCache = new EPGCache();

const fetchEPGProgramCached = async (timestamp: number) => {
  return await epgCache.getProgram(timestamp, fetchEPGProgram);
};

progressManager.initialize({
  dvr: {
    getEPGProgramAt: fetchEPGProgramCached,
  },
});
```

## 🎨 UI Components

### Live Badge

```typescript
const LiveBadge = ({ progressManager }) => {
  const [isLive, setIsLive] = useState(true);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const isAtLive = progressManager.isAtLiveEdge();
      setIsLive(isAtLive);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!isLive) return null;
  
  return (
    <View style={styles.liveBadge}>
      <View style={styles.liveIndicator} />
      <Text style={styles.liveText}>EN DIRECTO</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  liveText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
```

### Go to Live Button

```typescript
const GoToLiveButton = ({ progressManager }) => {
  const [isLive, setIsLive] = useState(true);
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const values = progressManager.getSliderValues();
      setIsLive(values.isLiveEdgePosition);
      setOffset(Math.floor(values.liveEdgeOffset || 0));
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const handleGoToLive = () => {
    progressManager.goToLive();
  };
  
  if (isLive) return null;
  
  return (
    <TouchableOpacity
      style={styles.goToLiveButton}
      onPress={handleGoToLive}
    >
      <Text style={styles.buttonText}>
        🔴 IR AL DIRECTO
      </Text>
      {offset > 0 && (
        <Text style={styles.offsetText}>
          -{formatOffset(offset)}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const formatOffset = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
```

### Program Info Card

```typescript
const ProgramInfoCard = ({ progressManager }) => {
  const [program, setProgram] = useState(null);
  
  useEffect(() => {
    const updateProgram = async () => {
      const currentProgram = await progressManager.getCurrentProgram();
      setProgram(currentProgram);
    };
    
    // Actualizar al inicio
    updateProgram();
    
    // Actualizar cada minuto
    const interval = setInterval(updateProgram, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!program) return null;
  
  const startTime = new Date(program.startDate);
  const endTime = new Date(program.endDate);
  const now = Date.now();
  const progress = ((now - program.startDate) / program.duration / 1000) * 100;
  
  return (
    <View style={styles.programCard}>
      {program.imageUrl && (
        <Image
          source={{ uri: program.imageUrl }}
          style={styles.programImage}
        />
      )}
      
      <View style={styles.programInfo}>
        <Text style={styles.programTitle}>{program.title}</Text>
        <Text style={styles.programDescription}>
          {program.description}
        </Text>
        <Text style={styles.programTime}>
          {formatTime(startTime)} - {formatTime(endTime)}
        </Text>
        
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progress}%` }]}
          />
        </View>
      </View>
    </View>
  );
};
```

### DVR Timeline

```typescript
const DVRTimeline = ({ progressManager }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [values, setValues] = useState(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSeeking) {
        const sliderValues = progressManager.getSliderValues();
        setValues(sliderValues);
        setSliderValue(sliderValues.progress);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isSeeking]);
  
  const handleSliderStart = () => {
    setIsSeeking(true);
    progressManager.startManualSeeking();
  };
  
  const handleSliderMove = (value) => {
    setSliderValue(value);
  };
  
  const handleSliderComplete = async (value) => {
    setIsSeeking(false);
    progressManager.endManualSeeking();
    
    const seekTime = progressManager.sliderValueToSeekTime(value);
    await videoRef.current?.seek(seekTime);
  };
  
  if (!values) return null;
  
  return (
    <View style={styles.timeline}>
      <Text style={styles.timeLabel}>
        {formatTimestamp(values.windowStart)}
      </Text>
      
      <Slider
        style={styles.slider}
        value={sliderValue}
        minimumValue={values.minimumValue}
        maximumValue={values.maximumValue}
        onSlidingStart={handleSliderStart}
        onValueChange={handleSliderMove}
        onSlidingComplete={handleSliderComplete}
      />
      
      <Text style={styles.timeLabel}>
        {formatTimestamp(values.liveEdge)}
      </Text>
    </View>
  );
};
```

## 🎮 Modos de Reproducción

### Window Mode

```typescript
const WindowModePlayer = ({ source }) => {
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        playbackType: DVR_PLAYBACK_TYPE.WINDOW,
        onProgressUpdate: handleProgress,
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  return (
    <View>
      <Video source={source} />
      <Text>Modo: Ventana completa DVR</Text>
    </View>
  );
};
```

### Program Mode

```typescript
const ProgramModePlayer = ({ source, programId }) => {
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        playbackType: DVR_PLAYBACK_TYPE.PROGRAM,
        onProgressUpdate: handleProgress,
        getEPGProgramAt: fetchEPGProgram,
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  return (
    <View>
      <Video source={source} />
      <Text>Modo: Programa específico</Text>
    </View>
  );
};
```

### Playlist Mode

```typescript
const PlaylistModePlayer = ({ source }) => {
  const [currentProgram, setCurrentProgram] = useState(null);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        playbackType: DVR_PLAYBACK_TYPE.PLAYLIST,
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
      <Video source={source} />
      {currentProgram && (
        <Text>Programa actual: {currentProgram.title}</Text>
      )}
    </View>
  );
};
```

### Mode Switcher

```typescript
const ModeSwitcher = ({ progressManager }) => {
  const [mode, setMode] = useState(DVR_PLAYBACK_TYPE.WINDOW);
  
  const handleModeChange = (newMode) => {
    progressManager.setPlaybackType(newMode);
    setMode(newMode);
  };
  
  return (
    <View style={styles.modeSwitcher}>
      <TouchableOpacity
        style={[
          styles.modeButton,
          mode === DVR_PLAYBACK_TYPE.WINDOW && styles.activeMode,
        ]}
        onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.WINDOW)}
      >
        <Text>WINDOW</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.modeButton,
          mode === DVR_PLAYBACK_TYPE.PROGRAM && styles.activeMode,
        ]}
        onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.PROGRAM)}
      >
        <Text>PROGRAM</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.modeButton,
          mode === DVR_PLAYBACK_TYPE.PLAYLIST && styles.activeMode,
        ]}
        onPress={() => handleModeChange(DVR_PLAYBACK_TYPE.PLAYLIST)}
      >
        <Text>PLAYLIST</Text>
      </TouchableOpacity>
    </View>
  );
};
```

## 🎯 Casos de Uso Avanzados

### DVR con Cast

```typescript
const DVRPlayerWithCast = ({ source }) => {
  const progressManagerRef = useRef(null);
  const { castState, castStreamPosition, castSeekableRange } = useCastState();
  
  useEffect(() => {
    if (castState === 'CONNECTED') {
      // Actualizar con datos de Cast
      progressManagerRef.current?.updatePlayerData({
        currentTime: castStreamPosition,
        seekableRange: castSeekableRange,
        isPaused: false,
      });
    }
  }, [castState, castStreamPosition, castSeekableRange]);
  
  return (
    <View>
      {castState === 'CONNECTED' ? (
        <CastPlayer />
      ) : (
        <Video source={source} />
      )}
    </View>
  );
};
```

### Program List

```typescript
const ProgramList = ({ progressManager }) => {
  const [programs, setPrograms] = useState([]);
  const [currentProgram, setCurrentProgram] = useState(null);
  
  useEffect(() => {
    const loadPrograms = async () => {
      // Cargar programas del día
      const response = await fetch('/api/epg/today');
      const data = await response.json();
      setPrograms(data);
    };
    
    loadPrograms();
    
    // Actualizar programa actual
    const interval = setInterval(async () => {
      const program = await progressManager.getCurrentProgram();
      setCurrentProgram(program);
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  const handleProgramSelect = async (program) => {
    const seekTime = progressManager.seekToProgram(program.id);
    if (seekTime !== null) {
      await videoRef.current?.seek(seekTime);
    }
  };
  
  return (
    <ScrollView style={styles.programList}>
      {programs.map((program) => (
        <TouchableOpacity
          key={program.id}
          style={[
            styles.programItem,
            currentProgram?.id === program.id && styles.currentProgram,
          ]}
          onPress={() => handleProgramSelect(program)}
        >
          <Text style={styles.programTitle}>{program.title}</Text>
          <Text style={styles.programTime}>
            {formatTime(program.startDate)} - {formatTime(program.endDate)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};
```

### DVR con Notificaciones

```typescript
const DVRPlayerWithNotifications = ({ source }) => {
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      dvr: {
        onProgramChange: (data) => {
          if (data.currentProgram) {
            // Notificar cambio de programa
            showNotification({
              title: 'Nuevo programa',
              body: data.currentProgram.title,
            });
          }
        },
        onEPGError: (data) => {
          if (data.retryCount >= 3) {
            // Notificar error persistente
            showNotification({
              title: 'Error de EPG',
              body: 'No se pudo cargar información del programa',
            });
          }
        },
        getEPGProgramAt: fetchEPGProgram,
      },
      initialContentType: 'live',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  return <Video source={source} />;
};
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía general
- [DVRProgressManager](./DVRProgressManager.md) - Documentación del manager DVR
- [Examples](./Examples.md) - Más ejemplos
- [API Reference](./API.md) - Referencia completa
- [Reglas Fundamentales](../instructions/rules.md) - Invariantes DVR

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
