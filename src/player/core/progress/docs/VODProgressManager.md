# VODProgressManager - Documentación

Documentación del **VODProgressManagerClass**, manager especializado para contenido VOD (Video on Demand).

## 📋 Índice

- [Descripción](#descripción)
- [Características](#características)
- [Uso Básico](#uso-básico)
- [Operaciones](#operaciones)
- [Configuración](#configuración)

## 📖 Descripción

`VODProgressManagerClass` gestiona el progreso de reproducción para contenido VOD (videos bajo demanda). Proporciona tracking lineal de progreso, cálculo de valores de slider y validación de seeks.

### Responsabilidades

- ✅ **Tracking de progreso lineal**: Seguimiento del tiempo actual
- ✅ **Cálculo de valores de slider**: Conversión entre tiempo y porcentaje
- ✅ **Validación de seeks**: Asegurar seeks dentro de rango válido
- ✅ **Gestión de estado**: Pausa, buffering, reproducción
- ✅ **Callbacks de progreso**: Notificaciones de cambios

## 🎯 Características

### Progreso Lineal

El progreso en VOD es lineal y predecible:

```typescript
// Slider representa el video completo
// minimumValue = 0
// maximumValue = duration
// progress = currentTime

const values = progressManager.getSliderValues();
console.log('Progress:', values.progress); // Tiempo actual
console.log('Duration:', values.duration); // Duración total
console.log('Percentage:', (values.progress / values.duration) * 100);
```

### Seekable Range

En VOD, el seekable range es típicamente todo el video:

```typescript
const seekableRange = {
  start: 0,
  end: duration,
};

// Puedes navegar a cualquier punto del video
```

### Estados

El manager rastrea varios estados:

```typescript
const stats = progressManager.getStats();

console.log('Current time:', stats.currentTime);
console.log('Duration:', stats.duration);
console.log('Is paused:', stats.isPaused);
console.log('Is buffering:', stats.isBuffering);
console.log('Has received data:', stats.hasReceivedPlayerData);
```

## 🚀 Uso Básico

### Configuración

```typescript
import { ProgressManagerUnified } from '@player/core/progress';

const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => {
      console.log('Progress:', data.currentTime, '/', data.duration);
      updateUI(data);
    },
    currentTime: 0,
    duration: 0,
    isPaused: false,
    isBuffering: false,
    autoSeekToEnd: false,
    enableLooping: false,
  },
  initialContentType: 'vod',
});
```

### Actualizar Progreso

```typescript
const handleProgress = (event: OnProgressData) => {
  progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration,
    isPaused: false,
    isBuffering: false,
  });
};

<Video
  onProgress={handleProgress}
  progressUpdateInterval={1000}
/>
```

### Obtener Valores

```typescript
const values = progressManager.getSliderValues();

// Valores disponibles
console.log('Progress:', values.progress);        // Tiempo actual
console.log('Min:', values.minimumValue);         // 0
console.log('Max:', values.maximumValue);         // Duración
console.log('Duration:', values.duration);        // Duración total
console.log('Is live:', values.isLive);           // false para VOD
```

## 🛠️ Operaciones

### Seek a Tiempo Específico

```typescript
const seekToTime = async (time: number) => {
  try {
    // Validar tiempo
    const validTime = progressManager.validateSeekTime(time);
    
    // Ejecutar seek
    await videoRef.current?.seek(validTime);
  } catch (error) {
    console.error('Seek error:', error);
  }
};

// Ejemplo: Seek a 2 minutos
await seekToTime(120);
```

### Seek desde Slider

```typescript
const handleSliderChange = async (sliderValue: number) => {
  // sliderValue está entre minimumValue y maximumValue
  // Para VOD, es directamente el tiempo en segundos
  
  const seekTime = progressManager.sliderValueToSeekTime(sliderValue);
  await videoRef.current?.seek(seekTime);
};
```

### Skip Forward/Backward

```typescript
const handleSkipForward = async () => {
  const skipTime = progressManager.calculateSkipTime('forward', 10);
  await videoRef.current?.seek(skipTime);
};

const handleSkipBackward = async () => {
  const skipTime = progressManager.calculateSkipTime('backward', 10);
  await videoRef.current?.seek(skipTime);
};
```

### Seek a Porcentaje

```typescript
const seekToPercentage = async (percentage: number) => {
  // percentage: 0-100
  const values = progressManager.getSliderValues();
  const seekTime = (values.duration * percentage) / 100;
  
  const validTime = progressManager.validateSeekTime(seekTime);
  await videoRef.current?.seek(validTime);
};

// Ejemplo: Seek al 50%
await seekToPercentage(50);
```

## ⚙️ Configuración

### Opciones Disponibles

```typescript
interface VODProgressManagerConfig {
  // Callback de progreso
  onProgressUpdate?: (data: any) => void;
  
  // Estado inicial
  currentTime?: number;
  duration?: number;
  isPaused?: boolean;
  isBuffering?: boolean;
  
  // Opciones específicas VOD
  autoSeekToEnd?: boolean;  // Auto-seek al final al cargar
  enableLooping?: boolean;  // Habilitar loop automático
}
```

### Auto Seek to End

```typescript
progressManager.initialize({
  vod: {
    autoSeekToEnd: true, // Ir al final al cargar
    onProgressUpdate: handleProgress,
  },
});

// Útil para continuar donde se quedó
```

### Enable Looping

```typescript
progressManager.initialize({
  vod: {
    enableLooping: true, // Loop automático al terminar
    onProgressUpdate: handleProgress,
  },
});

// El video se reinicia automáticamente al terminar
```

## 📊 Callback de Progreso

### Estructura de Datos

```typescript
interface VODProgressData {
  currentTime: number;      // Tiempo actual en segundos
  duration: number;         // Duración total en segundos
  progress: number;         // Mismo que currentTime
  minimumValue: number;     // 0
  maximumValue: number;     // duration
  isPaused: boolean;        // Si está pausado
  isBuffering: boolean;     // Si está buffering
  isLive: false;           // Siempre false para VOD
}
```

### Ejemplo de Uso

```typescript
progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => {
      // Actualizar UI
      setCurrentTime(data.currentTime);
      setDuration(data.duration);
      
      // Calcular porcentaje
      const percentage = (data.currentTime / data.duration) * 100;
      setProgressPercentage(percentage);
      
      // Actualizar slider
      setSliderValue(data.progress);
      
      // Mostrar tiempo restante
      const remaining = data.duration - data.currentTime;
      setTimeRemaining(formatTime(remaining));
      
      // Detectar cerca del final
      if (remaining < 30) {
        showEndingCredits();
      }
    },
  },
});
```

## 🎯 Ejemplos Prácticos

### Ejemplo 1: Player Básico

```typescript
const BasicVODPlayer = ({ source }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressManagerRef = useRef(null);
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    manager.initialize({
      vod: {
        onProgressUpdate: (data) => {
          setCurrentTime(data.currentTime);
          setDuration(data.duration);
        },
      },
      initialContentType: 'vod',
    });
    
    progressManagerRef.current = manager;
    
    return () => manager.dispose();
  }, []);
  
  const handleProgress = (event) => {
    progressManagerRef.current?.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
    });
  };
  
  return (
    <View>
      <Video
        source={source}
        onProgress={handleProgress}
      />
      <Text>
        {formatTime(currentTime)} / {formatTime(duration)}
      </Text>
    </View>
  );
};
```

### Ejemplo 2: Player con Slider

```typescript
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
    await videoRef.current?.seek(seekTime);
  };
  
  const values = progressManagerRef.current?.getSliderValues() || {
    minimumValue: 0,
    maximumValue: 100,
    duration: 0,
  };
  
  return (
    <View>
      <Video
        ref={videoRef}
        onProgress={handleProgress}
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

### Ejemplo 3: Player con Controles

```typescript
const VODPlayerWithControls = () => {
  const progressManagerRef = useRef(null);
  const videoRef = useRef(null);
  
  const handleSkip = async (direction: 'forward' | 'backward') => {
    const skipTime = progressManagerRef.current?.calculateSkipTime(
      direction,
      10
    );
    await videoRef.current?.seek(skipTime);
  };
  
  const handleSeekToStart = async () => {
    await videoRef.current?.seek(0);
  };
  
  const handleSeekToEnd = async () => {
    const values = progressManagerRef.current?.getSliderValues();
    if (values) {
      await videoRef.current?.seek(values.duration);
    }
  };
  
  return (
    <View>
      <Video ref={videoRef} />
      
      <View style={styles.controls}>
        <Button title="⏮ Inicio" onPress={handleSeekToStart} />
        <Button title="⏪ -10s" onPress={() => handleSkip('backward')} />
        <Button title="+10s ⏩" onPress={() => handleSkip('forward')} />
        <Button title="⏭ Final" onPress={handleSeekToEnd} />
      </View>
    </View>
  );
};
```

## ⚠️ Consideraciones

### 1. Validación de Seeks

Siempre valida los seeks antes de ejecutarlos:

```typescript
// ✅ CORRECTO
const validTime = progressManager.validateSeekTime(requestedTime);
await videoRef.current?.seek(validTime);

// ❌ INCORRECTO
await videoRef.current?.seek(requestedTime); // Puede estar fuera de rango
```

### 2. Actualización Durante Seek

Evita actualizar el slider durante seek manual:

```typescript
const [isSeeking, setIsSeeking] = useState(false);

const handleProgress = (event) => {
  if (!isSeeking) { // Solo actualizar si no estamos haciendo seek
    updateSlider(event.currentTime);
  }
};
```

### 3. Precisión de Tiempo

Los tiempos pueden tener decimales:

```typescript
// Redondear si es necesario
const currentTime = Math.floor(event.currentTime);
const duration = Math.floor(event.playableDuration);
```

### 4. Estado de Pausa

Actualiza correctamente el estado de pausa:

```typescript
const handleProgress = (event) => {
  progressManager.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration,
    isPaused: isPaused, // Desde el estado del player
  });
};
```

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa de uso
- [ProgressManagerUnified](./ProgressManagerUnified.md) - Fachada unificada
- [Examples](./Examples.md) - Más ejemplos
- [API Reference](./API.md) - Referencia completa

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
