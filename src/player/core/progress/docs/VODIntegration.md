# Integración VOD - Progress Management System

Guía detallada para integrar el sistema de progreso con contenido VOD (Video on Demand).

## 📋 Índice

- [Configuración Básica](#configuración-básica)
- [Integración con Video Player](#integración-con-video-player)
- [UI Components](#ui-components)
- [Casos de Uso Avanzados](#casos-de-uso-avanzados)

## 🚀 Configuración Básica

### Setup Inicial

```typescript
import { ProgressManagerUnified } from '@player/core/progress';

const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => {
      // Actualizar UI con progreso
      updateProgressUI(data);
    },
    currentTime: 0,
    duration: 0,
    isPaused: false,
    isBuffering: false,
  },
  initialContentType: 'vod',
});
```

## 📺 Integración con Video Player

### React Native Video

```typescript
import React, { useRef, useEffect } from 'react';
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
  
  const handleBuffer = ({ isBuffering }) => {
    progressManagerRef.current?.updatePlayerData({
      currentTime: videoRef.current?.currentTime || 0,
      duration: videoRef.current?.duration || 0,
      isBuffering,
    });
  };
  
  return (
    <Video
      ref={videoRef}
      source={source}
      onLoad={handleLoad}
      onProgress={handleProgress}
      onBuffer={handleBuffer}
      progressUpdateInterval={1000}
    />
  );
};
```

### HTML5 Video

```typescript
import React, { useRef, useEffect } from 'react';

const HTML5VODPlayer = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    manager.initialize({
      vod: { onProgressUpdate: updateUI },
      initialContentType: 'vod',
    });
    progressManagerRef.current = manager;
    
    const video = videoRef.current;
    if (!video) return;
    
    const handleLoadedMetadata = () => {
      progressManagerRef.current?.onContentLoaded({
        duration: video.duration,
        isLive: false,
      });
    };
    
    const handleTimeUpdate = () => {
      progressManagerRef.current?.updatePlayerData({
        currentTime: video.currentTime,
        duration: video.duration,
        isPaused: video.paused,
      });
    };
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      manager.dispose();
    };
  }, []);
  
  return <video ref={videoRef} src={src} controls />;
};
```

## 🎨 UI Components

### Progress Bar

```typescript
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

const ProgressBar = ({ progressManager }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  
  useEffect(() => {
    const updateInterval = setInterval(() => {
      if (!isSeeking) {
        const values = progressManager.getSliderValues();
        setSliderValue(values.progress);
      }
    }, 1000);
    
    return () => clearInterval(updateInterval);
  }, [isSeeking]);
  
  const handleSliderStart = () => {
    setIsSeeking(true);
  };
  
  const handleSliderMove = (value) => {
    setSliderValue(value);
  };
  
  const handleSliderComplete = async (value) => {
    setIsSeeking(false);
    const seekTime = progressManager.sliderValueToSeekTime(value);
    await videoRef.current?.seek(seekTime);
  };
  
  const values = progressManager.getSliderValues();
  
  return (
    <View style={styles.container}>
      <Slider
        style={styles.slider}
        value={sliderValue}
        minimumValue={values.minimumValue}
        maximumValue={values.maximumValue}
        onSlidingStart={handleSliderStart}
        onValueChange={handleSliderMove}
        onSlidingComplete={handleSliderComplete}
        minimumTrackTintColor="#1DB954"
        maximumTrackTintColor="#CCCCCC"
        thumbTintColor="#1DB954"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
```

### Time Display

```typescript
const TimeDisplay = ({ progressManager }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const values = progressManager.getSliderValues();
      setCurrentTime(values.progress);
      setDuration(values.duration);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <View style={styles.timeContainer}>
      <Text style={styles.time}>{formatTime(currentTime)}</Text>
      <Text style={styles.separator}>/</Text>
      <Text style={styles.time}>{formatTime(duration)}</Text>
    </View>
  );
};
```

### Skip Buttons

```typescript
const SkipButtons = ({ progressManager, videoRef }) => {
  const handleSkip = async (direction: 'forward' | 'backward') => {
    const skipTime = progressManager.calculateSkipTime(direction, 10);
    await videoRef.current?.seek(skipTime);
  };
  
  return (
    <View style={styles.skipContainer}>
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => handleSkip('backward')}
      >
        <Text style={styles.skipText}>⏪ -10s</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => handleSkip('forward')}
      >
        <Text style={styles.skipText}>+10s ⏩</Text>
      </TouchableOpacity>
    </View>
  );
};
```

### Progress Percentage

```typescript
const ProgressPercentage = ({ progressManager }) => {
  const [percentage, setPercentage] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const values = progressManager.getSliderValues();
      const pct = (values.progress / values.duration) * 100;
      setPercentage(Math.round(pct));
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <View style={styles.percentageContainer}>
      <Text style={styles.percentage}>{percentage}%</Text>
    </View>
  );
};
```

## 🎯 Casos de Uso Avanzados

### Continuar Donde se Quedó

```typescript
const VODPlayerWithResume = ({ source, videoId }) => {
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    manager.initialize({
      vod: {
        onProgressUpdate: (data) => {
          // Guardar progreso
          saveProgress(videoId, data.currentTime);
        },
      },
    });
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  const handleLoad = async (event) => {
    progressManagerRef.current?.onContentLoaded({
      duration: event.duration,
      isLive: false,
    });
    
    // Restaurar progreso guardado
    const savedTime = await loadProgress(videoId);
    if (savedTime > 0) {
      await videoRef.current?.seek(savedTime);
    }
  };
  
  return (
    <Video
      ref={videoRef}
      source={source}
      onLoad={handleLoad}
    />
  );
};
```

### Marcadores de Capítulos

```typescript
const VODPlayerWithChapters = ({ source, chapters }) => {
  const progressManagerRef = useRef(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      vod: {
        onProgressUpdate: (data) => {
          // Detectar capítulo actual
          const chapter = chapters.find(
            (ch) => data.currentTime >= ch.start && data.currentTime < ch.end
          );
          setCurrentChapter(chapter);
        },
      },
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, [chapters]);
  
  const seekToChapter = async (chapter) => {
    await videoRef.current?.seek(chapter.start);
  };
  
  return (
    <View>
      <Video ref={videoRef} source={source} />
      
      {currentChapter && (
        <Text style={styles.chapterTitle}>{currentChapter.title}</Text>
      )}
      
      <ScrollView horizontal>
        {chapters.map((chapter) => (
          <TouchableOpacity
            key={chapter.id}
            onPress={() => seekToChapter(chapter)}
            style={[
              styles.chapterButton,
              currentChapter?.id === chapter.id && styles.activeChapter,
            ]}
          >
            <Text>{chapter.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
```

### Preview en Hover

```typescript
const VODPlayerWithPreview = ({ source }) => {
  const [previewTime, setPreviewTime] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const progressManagerRef = useRef(null);
  
  const handleSliderMove = (value, event) => {
    const seekTime = progressManagerRef.current?.sliderValueToSeekTime(value);
    setPreviewTime(seekTime);
    
    // Posición del preview
    setPreviewPosition({
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY - 100,
    });
  };
  
  const handleSliderEnd = () => {
    setPreviewTime(null);
  };
  
  return (
    <View>
      <Video ref={videoRef} source={source} />
      
      <Slider
        onValueChange={handleSliderMove}
        onSlidingComplete={handleSliderEnd}
      />
      
      {previewTime !== null && (
        <View
          style={[
            styles.preview,
            { left: previewPosition.x, top: previewPosition.y },
          ]}
        >
          <Text>{formatTime(previewTime)}</Text>
          {/* Thumbnail del preview */}
        </View>
      )}
    </View>
  );
};
```

### Velocidad de Reproducción

```typescript
const VODPlayerWithSpeed = ({ source }) => {
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  
  const handleSpeedChange = (speed) => {
    setPlaybackRate(speed);
    videoRef.current?.setNativeProps({ rate: speed });
  };
  
  return (
    <View>
      <Video
        ref={videoRef}
        source={source}
        rate={playbackRate}
      />
      
      <View style={styles.speedControls}>
        {speeds.map((speed) => (
          <TouchableOpacity
            key={speed}
            onPress={() => handleSpeedChange(speed)}
            style={[
              styles.speedButton,
              playbackRate === speed && styles.activeSpeed,
            ]}
          >
            <Text>{speed}x</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};
```

### Picture-in-Picture

```typescript
const VODPlayerWithPiP = ({ source }) => {
  const [isPiP, setIsPiP] = useState(false);
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  const togglePiP = async () => {
    if (isPiP) {
      await videoRef.current?.dismissFullscreenPlayer();
    } else {
      await videoRef.current?.presentFullscreenPlayer();
    }
    setIsPiP(!isPiP);
  };
  
  return (
    <View>
      <Video
        ref={videoRef}
        source={source}
        pictureInPicture={true}
        onPictureInPictureStatusChanged={(status) => {
          setIsPiP(status.isActive);
        }}
      />
      
      <TouchableOpacity onPress={togglePiP}>
        <Text>{isPiP ? 'Exit PiP' : 'Enter PiP'}</Text>
      </TouchableOpacity>
    </View>
  );
};
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía general
- [VODProgressManager](./VODProgressManager.md) - Documentación del manager VOD
- [Examples](./Examples.md) - Más ejemplos
- [API Reference](./API.md) - Referencia completa

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
