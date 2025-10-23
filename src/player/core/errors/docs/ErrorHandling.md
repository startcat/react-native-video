# Error Handling - Guía de Uso del Sistema de Errores

## 📚 Introducción

Esta guía explica cómo usar el sistema de errores del reproductor en tu código. El sistema proporciona una forma tipada, estructurada y consistente de manejar errores.

## 🚀 Inicio Rápido

### Importar PlayerError

```typescript
import { PlayerError } from '@/player/core/errors';
```

### Lanzar un Error

```typescript
throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
  uri: 'https://example.com/video.m3u8',
  reason: 'Network timeout'
});
```

### Capturar y Manejar Errores

```typescript
try {
  await loadMedia();
} catch (error) {
  if (error instanceof PlayerError) {
    console.error(`Error ${error.key}:`, error.message);
    console.error('Context:', error.context);
  }
}
```

## 📖 Casos de Uso Comunes

### 1. Validación de Parámetros

```typescript
function loadSource(sourceData: SourceData) {
  if (!sourceData.manifests || sourceData.manifests.length === 0) {
    throw new PlayerError('PLAYER_SOURCE_NO_MANIFESTS_PROVIDED', {
      providedManifests: sourceData.manifests
    });
  }
  
  // Continuar con la carga...
}
```

### 2. Operaciones Asíncronas

```typescript
async function loadContent(uri: string) {
  try {
    const response = await fetch(uri);
    
    if (!response.ok) {
      throw new PlayerError('NETWORK_HTTP_404', {
        uri,
        status: response.status,
        statusText: response.statusText
      });
    }
    
    return await response.json();
    
  } catch (error) {
    // Si ya es PlayerError, re-lanzarlo
    if (error instanceof PlayerError) {
      throw error;
    }
    
    // Convertir error genérico a PlayerError
    throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
      uri,
      originalError: error
    });
  }
}
```

### 3. Manejo de Errores Nativos

```typescript
// En un event handler del reproductor nativo
function handleNativeError(nativeError: OnVideoErrorData) {
  const playerError = mapNativeErrorToPlayerError(nativeError);
  
  console.error('Native error mapped:', {
    key: playerError.key,
    category: playerError.category,
    message: playerError.message,
    context: playerError.context
  });
  
  // Notificar al controller
  onError?.(playerError);
}
```

### 4. Propagación con Contexto Adicional

```typescript
async function seekToPosition(time: number) {
  try {
    await transport.seek(time);
  } catch (error) {
    throw new PlayerError('PLAYER_SEEK_FAILED', {
      targetTime: time,
      currentTime: getCurrentTime(),
      originalError: error
    });
  }
}
```

### 5. Validación de Estado

```typescript
function play() {
  if (!this.isInitialized) {
    throw new PlayerError('PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED', {
      message: 'Player must be initialized before calling play()',
      currentState: this.getState()
    });
  }
  
  if (!this.source) {
    throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
      message: 'No source loaded',
      action: 'play'
    });
  }
  
  // Continuar con play...
}
```

### 6. Manejo de Errores de Cast

```typescript
async function loadCastContent(source: ProcessedSource) {
  if (!source.uri) {
    throw new PlayerError('PLAYER_CAST_INVALID_SOURCE', {
      source,
      reason: 'Missing URI'
    });
  }
  
  if (!source.metadata) {
    throw new PlayerError('PLAYER_CAST_INVALID_METADATA', {
      source,
      reason: 'Missing metadata'
    });
  }
  
  try {
    await castClient.loadMedia(source);
  } catch (error) {
    throw new PlayerError('PLAYER_CAST_CONNECTION_FAILED', {
      source: source.uri,
      originalError: error
    });
  }
}
```

### 7. Errores de Descarga

```typescript
async function startDownload(contentId: number) {
  // Verificar espacio disponible
  const availableSpace = await getAvailableSpace();
  const requiredSpace = await getRequiredSpace(contentId);
  
  if (availableSpace < requiredSpace) {
    throw new PlayerError('STORAGE_SPACE_301', {
      contentId,
      availableSpace,
      requiredSpace,
      deficit: requiredSpace - availableSpace
    });
  }
  
  try {
    await downloadManager.start(contentId);
  } catch (error) {
    throw new PlayerError('DOWNLOAD_START_FAILED', {
      contentId,
      originalError: error
    });
  }
}
```

### 8. Errores de Analytics

```typescript
function initializeAnalytics(config: AnalyticsConfig) {
  if (!config.apiKey) {
    throw new PlayerError('PLAYER_ANALYTICS_INVALID_CONFIGURATION', {
      config,
      missingField: 'apiKey'
    });
  }
  
  try {
    const plugin = analyticsFactory.create(config.provider);
    plugin.initialize(config);
  } catch (error) {
    throw new PlayerError('PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED', {
      provider: config.provider,
      originalError: error
    });
  }
}
```

## 🎯 Patrones Recomendados

### Patrón 1: Try-Catch con Conversión

```typescript
async function operation() {
  try {
    // Operación que puede fallar
    await riskyOperation();
  } catch (error) {
    // Si ya es PlayerError, re-lanzar
    if (error instanceof PlayerError) {
      throw error;
    }
    
    // Convertir a PlayerError con contexto
    throw new PlayerError('PLAYER_OPERATION_FAILED', {
      operation: 'riskyOperation',
      originalError: error
    });
  }
}
```

### Patrón 2: Validación Early Return

```typescript
function validateAndProcess(data: unknown) {
  // Validar primero, lanzar errores específicos
  if (!data) {
    throw new PlayerError('PLAYER_INVALID_DATA', {
      reason: 'Data is null or undefined'
    });
  }
  
  if (!isValidFormat(data)) {
    throw new PlayerError('PLAYER_UNSUPPORTED_FORMAT', {
      providedData: data,
      expectedFormat: 'ValidFormat'
    });
  }
  
  // Procesar datos validados
  return process(data);
}
```

### Patrón 3: Error Handler Centralizado

```typescript
class PlayerController {
  private handleError(error: unknown, context?: Record<string, any>) {
    // Convertir a PlayerError si no lo es
    const playerError = error instanceof PlayerError
      ? error
      : new PlayerError('PLAYER_UNKNOWN_999', {
          originalError: error,
          ...context
        });
    
    // Logging
    console.error(`[${playerError.category}] ${playerError.key}:`, {
      message: playerError.message,
      context: playerError.context,
      timestamp: new Date(playerError.timestamp).toISOString()
    });
    
    // Analytics
    this.analytics?.trackError({
      code: playerError.key,
      category: playerError.category,
      message: playerError.message,
      context: playerError.context
    });
    
    // Notificar callbacks
    this.onError?.(playerError);
    
    // UI feedback
    this.showErrorToUser(playerError);
  }
}
```

### Patrón 4: Retry con Error Tracking

```typescript
async function retryableOperation(maxRetries: number = 3) {
  let lastError: PlayerError | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof PlayerError
        ? error
        : new PlayerError('PLAYER_OPERATION_FAILED', {
            originalError: error
          });
      
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, lastError.key);
      
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // Exponential backoff
      }
    }
  }
  
  // Todos los intentos fallaron
  throw new PlayerError('PLAYER_OPERATION_FAILED', {
    attempts: maxRetries,
    lastError: lastError?.key,
    context: lastError?.context
  });
}
```

## 🔍 Debugging con PlayerError

### Inspeccionar Errores en Console

```typescript
try {
  await operation();
} catch (error) {
  if (error instanceof PlayerError) {
    console.group(`PlayerError: ${error.key}`);
    console.log('Category:', error.category);
    console.log('Message:', error.message);
    console.log('Timestamp:', new Date(error.timestamp).toISOString());
    console.log('Context:', JSON.stringify(error.context, null, 2));
    console.groupEnd();
  }
}
```

### Logging Estructurado

```typescript
function logError(error: PlayerError) {
  const logEntry = {
    type: 'error',
    code: error.key,
    category: error.category,
    message: error.message,
    timestamp: error.timestamp,
    context: error.context,
    stack: error.stack
  };
  
  // Enviar a servicio de logging
  logger.error(logEntry);
}
```

### Filtrar por Categoría

```typescript
function handleError(error: PlayerError) {
  switch (error.category) {
    case 'NETWORK':
      handleNetworkError(error);
      break;
    case 'PLAYER':
      handlePlayerError(error);
      break;
    case 'STORAGE':
      handleStorageError(error);
      break;
    default:
      handleGenericError(error);
  }
}
```

## 📊 Analytics y Tracking

### Trackear Errores

```typescript
function trackError(error: PlayerError) {
  analytics.track('player_error', {
    error_code: error.key,
    error_category: error.category,
    error_message: error.message,
    timestamp: error.timestamp,
    // Contexto relevante para analytics
    content_id: error.context?.contentId,
    content_type: error.context?.contentType,
    user_action: error.context?.userAction,
    // Información del dispositivo
    platform: Platform.OS,
    app_version: getAppVersion(),
  });
}
```

### Métricas de Errores

```typescript
class ErrorMetrics {
  private errorCounts = new Map<string, number>();
  
  trackError(error: PlayerError) {
    const count = this.errorCounts.get(error.key) || 0;
    this.errorCounts.set(error.key, count + 1);
  }
  
  getMostCommonErrors(limit: number = 10) {
    return Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }
  
  getErrorsByCategory(category: string) {
    return Array.from(this.errorCounts.entries())
      .filter(([key]) => key.startsWith(category))
      .reduce((sum, [, count]) => sum + count, 0);
  }
}
```

## 🎨 UI Feedback

### Mostrar Errores al Usuario

```typescript
function showErrorToUser(error: PlayerError) {
  // Mensajes amigables según categoría
  const userMessages: Record<string, string> = {
    NETWORK: 'Problema de conexión. Verifica tu internet.',
    PLAYER: 'Error al reproducir el contenido.',
    STORAGE: 'Espacio insuficiente en el dispositivo.',
    DOWNLOAD: 'Error al descargar el contenido.',
    PERMISSION: 'Permisos insuficientes.',
    DEVICE: 'Problema con el dispositivo.',
  };
  
  const message = userMessages[error.category] || 'Ha ocurrido un error.';
  
  // Mostrar toast/alert
  Alert.alert('Error', message, [
    { text: 'Reintentar', onPress: () => retry() },
    { text: 'Cancelar', style: 'cancel' }
  ]);
}
```

### Mensajes Específicos

```typescript
function getUserFriendlyMessage(error: PlayerError): string {
  const messages: Partial<Record<PlayerErrorCodeKey, string>> = {
    NETWORK_CONNECTION_001: 'No hay conexión a internet',
    NETWORK_HTTP_404: 'Contenido no encontrado',
    PLAYER_MEDIA_LOAD_FAILED: 'No se pudo cargar el video',
    PLAYER_DRM_KEY_ERROR: 'Error de protección de contenido',
    STORAGE_SPACE_301: 'Espacio insuficiente en el dispositivo',
    DOWNLOAD_START_FAILED: 'No se pudo iniciar la descarga',
  };
  
  return messages[error.key] || 'Ha ocurrido un error inesperado';
}
```

## ✅ Checklist de Buenas Prácticas

- [ ] Usar `PlayerError` en lugar de `Error` genérico
- [ ] Incluir contexto relevante en cada error
- [ ] Capturar y convertir errores genéricos a `PlayerError`
- [ ] No perder información del error original
- [ ] Usar códigos de error existentes (no inventar nuevos)
- [ ] Propagar errores con contexto adicional cuando sea relevante
- [ ] Implementar logging estructurado de errores
- [ ] Trackear errores en analytics
- [ ] Proporcionar feedback amigable al usuario
- [ ] Documentar nuevos códigos de error cuando se agreguen

## 🚫 Anti-Patrones a Evitar

### ❌ Ignorar Errores Silenciosamente

```typescript
// MAL
try {
  await operation();
} catch (error) {
  // Silencio...
}

// BIEN
try {
  await operation();
} catch (error) {
  const playerError = error instanceof PlayerError 
    ? error 
    : new PlayerError('PLAYER_OPERATION_FAILED', { originalError: error });
  handleError(playerError);
}
```

### ❌ Perder Contexto del Error

```typescript
// MAL
try {
  await loadSource(uri);
} catch (error) {
  throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED');
}

// BIEN
try {
  await loadSource(uri);
} catch (error) {
  throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
    uri,
    originalError: error
  });
}
```

### ❌ Usar Error Genérico

```typescript
// MAL
throw new Error('Failed to load');

// BIEN
throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
  reason: 'Network timeout'
});
```

### ❌ No Validar Tipo de Error

```typescript
// MAL
try {
  await operation();
} catch (error) {
  console.log(error.key); // Puede no existir
}

// BIEN
try {
  await operation();
} catch (error) {
  if (error instanceof PlayerError) {
    console.log(error.key);
  }
}
```

## 📚 Referencia Rápida

### Códigos de Error Más Comunes

| Código | Categoría | Uso |
|--------|-----------|-----|
| `PLAYER_MEDIA_LOAD_FAILED` | PLAYER | Fallo al cargar media |
| `PLAYER_SEEK_FAILED` | PLAYER | Fallo en seek |
| `NETWORK_CONNECTION_001` | NETWORK | Sin conexión |
| `NETWORK_HTTP_404` | NETWORK | Recurso no encontrado |
| `STORAGE_SPACE_301` | STORAGE | Espacio insuficiente |
| `DOWNLOAD_START_FAILED` | DOWNLOAD | Fallo al iniciar descarga |
| `PLAYER_CAST_CONNECTION_FAILED` | PLAYER | Fallo conexión Cast |
| `PLAYER_DRM_KEY_ERROR` | PLAYER | Error DRM |

### Propiedades de PlayerError

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `key` | `PlayerErrorCodeKey` | Código de error específico |
| `category` | `string` | Categoría del error |
| `message` | `string` | Mensaje descriptivo |
| `context` | `Record<string, any>` | Contexto adicional |
| `timestamp` | `number` | Unix timestamp |
| `stack` | `string` | Stack trace |

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Mantenedor**: Player Team
