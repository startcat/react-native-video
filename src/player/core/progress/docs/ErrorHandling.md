# Manejo de Errores - Progress Management System

Guía completa para el manejo de errores en el sistema de gestión de progreso usando `PlayerError`.

## 📋 Índice

- [Introducción](#introducción)
- [Sistema PlayerError](#sistema-playererror)
- [Códigos de Error](#códigos-de-error)
- [Manejo de Errores](#manejo-de-errores)
- [Ejemplos](#ejemplos)
- [Best Practices](#best-practices)

## 🎯 Introducción

El sistema de gestión de progreso utiliza el sistema centralizado `PlayerError` para todos los errores. Esto proporciona:

- ✅ **Tipado fuerte**: Códigos de error específicos en TypeScript
- ✅ **Contexto rico**: Información adicional en cada error
- ✅ **Categorización**: Errores agrupados por categoría
- ✅ **Debugging facilitado**: Timestamps y contexto para debugging
- ✅ **Consistencia**: Mismo formato en toda la aplicación

## 📦 Sistema PlayerError

### Importar PlayerError

```typescript
import { PlayerError } from '@player/core/errors';
```

### Estructura de PlayerError

```typescript
class PlayerError extends Error {
  public readonly key: PlayerErrorCodeKey;
  public readonly category: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: number;
  
  constructor(key: PlayerErrorCodeKey, context?: Record<string, any>)
}
```

**Propiedades:**
- `key` - Código de error específico
- `category` - Categoría extraída del código (ej: 'PLAYER')
- `message` - Mensaje descriptivo del error
- `context` - Información adicional relevante
- `timestamp` - Momento en que ocurrió (Unix timestamp)

## 🏷️ Códigos de Error

### Errores de Progress Managers

#### `PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED`
Manager no inicializado antes de uso.

```typescript
throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED', {
  operation: 'updatePlayerData',
  message: 'Call initialize() first'
});
```

**Cuándo ocurre:**
- Intentar usar el manager sin llamar `initialize()`
- Intentar reinicializar un manager ya inicializado

**Solución:**
```typescript
progressManager.initialize(config);
```

#### `PLAYER_PROGRESS_MANAGER_DISPOSED`
Operación en manager disposed.

```typescript
throw new PlayerError('PLAYER_PROGRESS_MANAGER_DISPOSED', {
  operation: 'updatePlayerData'
});
```

**Cuándo ocurre:**
- Intentar usar el manager después de `dispose()`

**Solución:**
```typescript
// Crear nueva instancia
const progressManager = new ProgressManagerUnified();
progressManager.initialize(config);
```

#### `PLAYER_PROGRESS_INVALID_CONTENT_TYPE`
Tipo de contenido inválido.

```typescript
throw new PlayerError('PLAYER_PROGRESS_INVALID_CONTENT_TYPE', {
  providedType: contentType,
  validTypes: ['vod', 'live']
});
```

**Cuándo ocurre:**
- Pasar un tipo de contenido inválido a `setContentType()`

**Solución:**
```typescript
// Usar solo 'vod' o 'live'
progressManager.setContentType('live');
```

#### `PLAYER_PROGRESS_INVALID_SEEK_TIME`
Tiempo de seek fuera de rango.

```typescript
throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME', {
  requestedTime: time,
  seekableRange: { start: 0, end: 3600 },
  minimumAllowed: 0,
  maximumAllowed: 3600
});
```

**Cuándo ocurre:**
- Intentar seek a un tiempo fuera del rango seekable

**Solución:**
```typescript
// Validar antes de seek
const validTime = progressManager.validateSeekTime(requestedTime);
await transport.seek(validTime);
```

#### `PLAYER_PROGRESS_UPDATE_FAILED`
Fallo al actualizar datos del player.

```typescript
throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
  contentType: 'live',
  data: playerData,
  originalError: error
});
```

**Cuándo ocurre:**
- Error interno al actualizar datos del player
- Datos inválidos proporcionados

**Solución:**
```typescript
// Verificar que los datos son válidos
await progressManager.updatePlayerData({
  currentTime: validNumber,
  duration: validNumber,
  seekableRange: validRange,
});
```

#### `PLAYER_PROGRESS_INVALID_STATE`
Estado inválido para la operación.

```typescript
throw new PlayerError('PLAYER_PROGRESS_INVALID_STATE', {
  reason: 'VOD manager not initialized',
  contentType: 'vod',
  operation: 'getActiveManager'
});
```

**Cuándo ocurre:**
- Manager interno no está inicializado
- Estado inconsistente

**Solución:**
```typescript
// Asegurar inicialización correcta
progressManager.initialize(config);
```

#### `PLAYER_PROGRESS_MANAGER_CREATION_FAILED`
Fallo al crear instancia del manager.

```typescript
throw new PlayerError('PLAYER_PROGRESS_MANAGER_CREATION_FAILED', {
  originalError: error,
  config: config
});
```

**Cuándo ocurre:**
- Error al crear VOD o DVR manager interno
- Configuración inválida

**Solución:**
```typescript
// Verificar configuración
progressManager.initialize({
  vod: { /* config válida */ },
  dvr: { /* config válida */ },
});
```

## 🛠️ Manejo de Errores

### Patrón Básico

```typescript
try {
  await progressManager.updatePlayerData(data);
} catch (error) {
  if (error instanceof PlayerError) {
    console.error('Player error:', error.key);
    console.error('Message:', error.message);
    console.error('Context:', error.context);
    console.error('Timestamp:', new Date(error.timestamp));
  } else {
    console.error('Unknown error:', error);
  }
}
```

### Manejo por Código de Error

```typescript
try {
  await progressManager.updatePlayerData(data);
} catch (error) {
  if (error instanceof PlayerError) {
    switch (error.key) {
      case 'PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED':
        // Inicializar el manager
        progressManager.initialize(config);
        break;
        
      case 'PLAYER_PROGRESS_INVALID_SEEK_TIME':
        // Validar y reintentar
        const validTime = progressManager.validateSeekTime(
          error.context?.requestedTime
        );
        await transport.seek(validTime);
        break;
        
      case 'PLAYER_PROGRESS_UPDATE_FAILED':
        // Log y notificar al usuario
        console.error('Update failed:', error.context);
        showErrorToUser('Error actualizando progreso');
        break;
        
      default:
        // Error no manejado específicamente
        console.error('Unhandled error:', error.key);
        showErrorToUser(error.message);
    }
  }
}
```

### Propagación de Errores

```typescript
async function updateProgress(data: PlayerData) {
  try {
    await progressManager.updatePlayerData(data);
  } catch (error) {
    // Si es PlayerError, propagar
    if (error instanceof PlayerError) {
      throw error;
    }
    
    // Convertir otros errores a PlayerError
    throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
      originalError: error,
      data
    });
  }
}
```

## 📝 Ejemplos

### Ejemplo 1: Inicialización con Manejo de Errores

```typescript
const initializeProgressManager = () => {
  const manager = new ProgressManagerUnified();
  
  try {
    manager.initialize({
      vod: {
        onProgressUpdate: handleVODProgress,
      },
      dvr: {
        onProgressUpdate: handleDVRProgress,
        getEPGProgramAt: fetchEPGProgram,
      },
      logger: myLogger,
    });
    
    return manager;
  } catch (error) {
    if (error instanceof PlayerError) {
      if (error.key === 'PLAYER_PROGRESS_MANAGER_CREATION_FAILED') {
        console.error('Failed to create manager:', error.context);
        // Intentar con configuración por defecto
        return createDefaultManager();
      }
    }
    throw error;
  }
};
```

### Ejemplo 2: Actualización con Retry

```typescript
const updateWithRetry = async (
  data: PlayerData,
  maxRetries: number = 3
) => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await progressManager.updatePlayerData(data);
      return; // Éxito
    } catch (error) {
      if (error instanceof PlayerError) {
        if (error.key === 'PLAYER_PROGRESS_UPDATE_FAILED') {
          retries++;
          console.warn(`Update failed, retry ${retries}/${maxRetries}`);
          await delay(1000 * retries); // Backoff exponencial
          continue;
        }
      }
      throw error; // Error no recuperable
    }
  }
  
  throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
    reason: 'Max retries exceeded',
    maxRetries,
    data
  });
};
```

### Ejemplo 3: Seek con Validación y Manejo

```typescript
const handleSeek = async (targetTime: number) => {
  try {
    // Validar tiempo
    const validTime = progressManager.validateSeekTime(targetTime);
    
    // Ejecutar seek
    await videoRef.current?.seek(validTime);
    
    // Actualizar UI
    updateSeekPosition(validTime);
  } catch (error) {
    if (error instanceof PlayerError) {
      switch (error.key) {
        case 'PLAYER_PROGRESS_INVALID_SEEK_TIME':
          // Mostrar rango válido al usuario
          const range = error.context?.seekableRange;
          showError(
            `Tiempo fuera de rango. Válido: ${range.start}s - ${range.end}s`
          );
          break;
          
        case 'PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED':
          // Inicializar y reintentar
          await initializeProgressManager();
          await handleSeek(targetTime);
          break;
          
        default:
          showError('Error al buscar: ' + error.message);
      }
    } else {
      showError('Error desconocido al buscar');
    }
  }
};
```

### Ejemplo 4: Manejo en Hook de React

```typescript
const useProgressManager = (config: ProgressManagerUnifiedConfig) => {
  const [error, setError] = useState<PlayerError | null>(null);
  const managerRef = useRef<ProgressManagerUnified>();
  
  useEffect(() => {
    const manager = new ProgressManagerUnified();
    
    try {
      manager.initialize(config);
      managerRef.current = manager;
      setError(null);
    } catch (err) {
      if (err instanceof PlayerError) {
        setError(err);
        console.error('Initialization error:', err.key, err.context);
      }
    }
    
    return () => {
      manager.dispose();
    };
  }, [config]);
  
  const updatePlayerData = useCallback(async (data: PlayerData) => {
    try {
      await managerRef.current?.updatePlayerData(data);
      setError(null);
    } catch (err) {
      if (err instanceof PlayerError) {
        setError(err);
      }
    }
  }, []);
  
  return {
    manager: managerRef.current,
    error,
    updatePlayerData,
  };
};
```

## ✅ Best Practices

### 1. Siempre Verificar PlayerError

```typescript
// ✅ BIEN
catch (error) {
  if (error instanceof PlayerError) {
    // Manejar PlayerError
  } else {
    // Manejar otros errores
  }
}

// ❌ MAL
catch (error) {
  // Asumir que es PlayerError
  console.error(error.key); // Puede fallar
}
```

### 2. Proporcionar Contexto

```typescript
// ✅ BIEN
throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
  data,
  currentState: manager.getStats(),
  contentType: manager.isLiveContent() ? 'live' : 'vod'
});

// ❌ MAL
throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED');
```

### 3. No Silenciar Errores

```typescript
// ✅ BIEN
catch (error) {
  console.error('Error:', error);
  showErrorToUser(error.message);
  reportToAnalytics(error);
}

// ❌ MAL
catch (error) {
  // Silenciar error
}
```

### 4. Propagar PlayerError

```typescript
// ✅ BIEN
catch (error) {
  if (error instanceof PlayerError) {
    throw error; // Propagar
  }
  throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
    originalError: error
  });
}

// ❌ MAL
catch (error) {
  throw new Error(error.message); // Perder información
}
```

### 5. Usar Códigos Específicos

```typescript
// ✅ BIEN
throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME', {
  requestedTime: time,
  seekableRange: range
});

// ❌ MAL
throw new Error('Invalid seek time'); // Error genérico
```

## 📚 Ver También

- [Sistema de Errores](../../errors/instructions/ErrorSystem.md) - Documentación completa del sistema
- [Códigos de Error](../../errors/definitions/player-errors.ts) - Definiciones de todos los códigos
- [Guía de Uso](./Usage.md) - Guía general de uso
- [API Reference](./API.md) - Referencia completa de la API

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025
