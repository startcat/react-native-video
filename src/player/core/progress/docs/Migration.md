# Guía de Migración - Progress Management System

Guía para migrar al nuevo sistema unificado de gestión de progreso.

## 📋 Índice

- [Introducción](#introducción)
- [Cambios Principales](#cambios-principales)
- [Migración Paso a Paso](#migración-paso-a-paso)
- [Comparación de APIs](#comparación-de-apis)
- [Casos Comunes](#casos-comunes)

## 🎯 Introducción

El nuevo **ProgressManagerUnified** simplifica la gestión de progreso al proporcionar una API única para VOD y DVR. Esta guía te ayudará a migrar desde el sistema anterior.

### Beneficios de Migrar

- ✅ **API única**: Mismo código para VOD y DVR
- ✅ **Detección automática**: No más lógica if/else para tipos
- ✅ **Type-safe**: TypeScript completo
- ✅ **Manejo de errores**: Sistema PlayerError integrado
- ✅ **Menos código**: Simplificación significativa

## 🔄 Cambios Principales

### Antes (Sistema Anterior)

```typescript
// Gestión manual de dos managers
const vodManager = new VODProgressManager();
const dvrManager = new DVRProgressManager();

// Lógica condicional en todas partes
if (isLive) {
  await dvrManager.updatePlayerData(data);
  const values = dvrManager.getSliderValues();
} else {
  vodManager.updatePlayerData(data);
  const values = vodManager.getSliderValues();
}
```

### Después (Sistema Nuevo)

```typescript
// Un solo manager
const progressManager = new ProgressManagerUnified();

progressManager.initialize({
  vod: { onProgressUpdate: handleVOD },
  dvr: { onProgressUpdate: handleDVR },
});

// Delegación automática
await progressManager.updatePlayerData(data);
const values = progressManager.getSliderValues();
```

## 📝 Migración Paso a Paso

### Paso 1: Actualizar Imports

**Antes:**
```typescript
import { VODProgressManager } from './old-path/VODProgressManager';
import { DVRProgressManager } from './old-path/DVRProgressManager';
```

**Después:**
```typescript
import { ProgressManagerUnified } from '@player/core/progress';
```

### Paso 2: Crear Instancia Única

**Antes:**
```typescript
const vodManagerRef = useRef(new VODProgressManager());
const dvrManagerRef = useRef(new DVRProgressManager());
```

**Después:**
```typescript
const progressManagerRef = useRef(new ProgressManagerUnified());
```

### Paso 3: Inicializar con Configuración Unificada

**Antes:**
```typescript
vodManagerRef.current.initialize({
  onProgressUpdate: handleVODProgress,
});

dvrManagerRef.current.initialize({
  onProgressUpdate: handleDVRProgress,
  onModeChange: handleModeChange,
  getEPGProgramAt: fetchEPG,
});
```

**Después:**
```typescript
progressManagerRef.current.initialize({
  vod: {
    onProgressUpdate: handleVODProgress,
  },
  dvr: {
    onProgressUpdate: handleDVRProgress,
    onModeChange: handleModeChange,
    getEPGProgramAt: fetchEPG,
  },
  initialContentType: 'vod',
});
```

### Paso 4: Eliminar Lógica Condicional

**Antes:**
```typescript
const handleProgress = async (event) => {
  if (isLive) {
    await dvrManagerRef.current.updatePlayerData({
      currentTime: event.currentTime,
      seekableRange: event.seekableRange,
    });
  } else {
    vodManagerRef.current.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
    });
  }
};
```

**Después:**
```typescript
const handleProgress = async (event) => {
  await progressManagerRef.current.updatePlayerData({
    currentTime: event.currentTime,
    duration: event.playableDuration,
    seekableRange: event.seekableRange,
  });
};
```

### Paso 5: Usar Detección Automática

**Antes:**
```typescript
const handleLoad = (event) => {
  if (event.isLive) {
    setIsLive(true);
    dvrManagerRef.current.onContentLoaded(event);
  } else {
    setIsLive(false);
    vodManagerRef.current.onContentLoaded(event);
  }
};
```

**Después:**
```typescript
const handleLoad = (event) => {
  // Detección automática
  progressManagerRef.current.onContentLoaded({
    duration: event.duration,
    isLive: event.isLive,
    seekableRange: event.seekableRange,
  });
  
  // Verificar tipo detectado (opcional)
  const isLive = progressManagerRef.current.isLiveContent();
};
```

### Paso 6: Actualizar Cleanup

**Antes:**
```typescript
useEffect(() => {
  return () => {
    vodManagerRef.current.destroy();
    dvrManagerRef.current.destroy();
  };
}, []);
```

**Después:**
```typescript
useEffect(() => {
  return () => {
    progressManagerRef.current.dispose();
  };
}, []);
```

## 🔀 Comparación de APIs

### Inicialización

| Antes | Después |
|-------|---------|
| `vodManager.initialize(config)` | `progressManager.initialize({ vod: config })` |
| `dvrManager.initialize(config)` | `progressManager.initialize({ dvr: config })` |

### Actualización de Datos

| Antes | Después |
|-------|---------|
| `vodManager.updatePlayerData(data)` | `progressManager.updatePlayerData(data)` |
| `dvrManager.updatePlayerData(data)` | `progressManager.updatePlayerData(data)` |

### Obtener Valores

| Antes | Después |
|-------|---------|
| `vodManager.getSliderValues()` | `progressManager.getSliderValues()` |
| `dvrManager.getSliderValues()` | `progressManager.getSliderValues()` |

### Operaciones de Seek

| Antes | Después |
|-------|---------|
| `vodManager.validateSeekTime(time)` | `progressManager.validateSeekTime(time)` |
| `dvrManager.validateSeekTime(time)` | `progressManager.validateSeekTime(time)` |
| `dvrManager.goToLive()` | `progressManager.goToLive()` |

### Cleanup

| Antes | Después |
|-------|---------|
| `vodManager.destroy()` | `progressManager.dispose()` |
| `dvrManager.destroy()` | `progressManager.dispose()` |

## 📚 Casos Comunes

### Caso 1: Player Simple VOD

**Antes:**
```typescript
const VODPlayer = () => {
  const vodManager = useRef(new VODProgressManager());
  
  useEffect(() => {
    vodManager.current.initialize({
      onProgressUpdate: handleProgress,
    });
    
    return () => vodManager.current.destroy();
  }, []);
  
  const handleProgress = (event) => {
    vodManager.current.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
    });
  };
  
  return <Video onProgress={handleProgress} />;
};
```

**Después:**
```typescript
const VODPlayer = () => {
  const progressManager = useRef(new ProgressManagerUnified());
  
  useEffect(() => {
    progressManager.current.initialize({
      vod: { onProgressUpdate: handleProgress },
      initialContentType: 'vod',
    });
    
    return () => progressManager.current.dispose();
  }, []);
  
  const handleProgress = async (event) => {
    await progressManager.current.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
    });
  };
  
  return <Video onProgress={handleProgress} />;
};
```

### Caso 2: Player DVR con EPG

**Antes:**
```typescript
const DVRPlayer = () => {
  const dvrManager = useRef(new DVRProgressManager());
  
  useEffect(() => {
    dvrManager.current.initialize({
      onProgressUpdate: handleProgress,
      onProgramChange: handleProgramChange,
      getEPGProgramAt: fetchEPG,
    });
    
    return () => dvrManager.current.destroy();
  }, []);
  
  const handleProgress = async (event) => {
    await dvrManager.current.updatePlayerData({
      currentTime: event.currentTime,
      seekableRange: event.seekableRange,
    });
  };
  
  return <Video onProgress={handleProgress} />;
};
```

**Después:**
```typescript
const DVRPlayer = () => {
  const progressManager = useRef(new ProgressManagerUnified());
  
  useEffect(() => {
    progressManager.current.initialize({
      dvr: {
        onProgressUpdate: handleProgress,
        onProgramChange: handleProgramChange,
        getEPGProgramAt: fetchEPG,
      },
      initialContentType: 'live',
    });
    
    return () => progressManager.current.dispose();
  }, []);
  
  const handleProgress = async (event) => {
    await progressManager.current.updatePlayerData({
      currentTime: event.currentTime,
      seekableRange: event.seekableRange,
    });
  };
  
  return <Video onProgress={handleProgress} />;
};
```

### Caso 3: Player Universal (VOD + DVR)

**Antes:**
```typescript
const UniversalPlayer = ({ source }) => {
  const [isLive, setIsLive] = useState(false);
  const vodManager = useRef(new VODProgressManager());
  const dvrManager = useRef(new DVRProgressManager());
  
  useEffect(() => {
    vodManager.current.initialize({ onProgressUpdate: handleVOD });
    dvrManager.current.initialize({ onProgressUpdate: handleDVR });
    
    return () => {
      vodManager.current.destroy();
      dvrManager.current.destroy();
    };
  }, []);
  
  const handleLoad = (event) => {
    setIsLive(event.isLive);
  };
  
  const handleProgress = async (event) => {
    if (isLive) {
      await dvrManager.current.updatePlayerData({
        currentTime: event.currentTime,
        seekableRange: event.seekableRange,
      });
    } else {
      vodManager.current.updatePlayerData({
        currentTime: event.currentTime,
        duration: event.playableDuration,
      });
    }
  };
  
  const getSliderValues = () => {
    return isLive
      ? dvrManager.current.getSliderValues()
      : vodManager.current.getSliderValues();
  };
  
  return <Video onLoad={handleLoad} onProgress={handleProgress} />;
};
```

**Después:**
```typescript
const UniversalPlayer = ({ source }) => {
  const progressManager = useRef(new ProgressManagerUnified());
  
  useEffect(() => {
    progressManager.current.initialize({
      vod: { onProgressUpdate: handleVOD },
      dvr: { onProgressUpdate: handleDVR },
    });
    
    return () => progressManager.current.dispose();
  }, []);
  
  const handleLoad = (event) => {
    // Detección automática
    progressManager.current.onContentLoaded({
      duration: event.duration,
      isLive: event.isLive,
      seekableRange: event.seekableRange,
    });
  };
  
  const handleProgress = async (event) => {
    // Delegación automática
    await progressManager.current.updatePlayerData({
      currentTime: event.currentTime,
      duration: event.playableDuration,
      seekableRange: event.seekableRange,
    });
  };
  
  const getSliderValues = () => {
    // Funciona para ambos tipos
    return progressManager.current.getSliderValues();
  };
  
  return <Video onLoad={handleLoad} onProgress={handleProgress} />;
};
```

## ⚠️ Breaking Changes

### 1. Método destroy() → dispose()

```typescript
// Antes
manager.destroy();

// Después
manager.dispose();
```

### 2. Inicialización Requerida

```typescript
// Antes: Podía funcionar sin inicializar
const manager = new VODProgressManager();
manager.updatePlayerData(data); // Funcionaba

// Después: Debe inicializarse
const manager = new ProgressManagerUnified();
manager.initialize(config); // Requerido
manager.updatePlayerData(data);
```

### 3. Callbacks en Configuración

```typescript
// Antes: Callbacks se pasaban directamente
const manager = new DVRProgressManager();
manager.onProgramChange = callback;

// Después: Callbacks en initialize()
const manager = new ProgressManagerUnified();
manager.initialize({
  dvr: { onProgramChange: callback },
});
```

### 4. Manejo de Errores

```typescript
// Antes: Error genérico
try {
  manager.updatePlayerData(data);
} catch (error) {
  console.error(error.message);
}

// Después: PlayerError
import { PlayerError } from '@player/core/errors';

try {
  await manager.updatePlayerData(data);
} catch (error) {
  if (error instanceof PlayerError) {
    console.error(error.key, error.context);
  }
}
```

## ✅ Checklist de Migración

- [ ] Actualizar imports a `ProgressManagerUnified`
- [ ] Reemplazar dos managers con uno solo
- [ ] Actualizar inicialización con configuración unificada
- [ ] Eliminar lógica condicional if/else para tipos
- [ ] Usar `onContentLoaded()` para detección automática
- [ ] Cambiar `destroy()` por `dispose()`
- [ ] Actualizar manejo de errores a `PlayerError`
- [ ] Probar con contenido VOD
- [ ] Probar con contenido DVR/Live
- [ ] Probar transiciones VOD ↔ Live
- [ ] Actualizar tests

## 📚 Ver También

- [Guía de Uso](./Usage.md) - Guía completa del nuevo sistema
- [ProgressManagerUnified](./ProgressManagerUnified.md) - Documentación detallada
- [Examples](./Examples.md) - Ejemplos de uso
- [Error Handling](./ErrorHandling.md) - Manejo de errores

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
