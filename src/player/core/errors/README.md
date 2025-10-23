# Error System - Sistema de Gestión de Errores

Sistema centralizado, tipado y estructurado para la gestión de errores en el reproductor.

## 📚 Documentación

- **[ErrorSystem.md](./instructions/ErrorSystem.md)** - Diseño, arquitectura y reglas del sistema
- **[ErrorHandling.md](./docs/ErrorHandling.md)** - Guía de uso para desarrolladores

## 🚀 Inicio Rápido

### Uso Básico

```typescript
import { PlayerError } from '@/player/core/errors';

// Lanzar un error
throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
  uri: 'https://example.com/video.m3u8',
  reason: 'Network timeout'
});

// Capturar y manejar
try {
  await loadMedia();
} catch (error) {
  if (error instanceof PlayerError) {
    console.error(`[${error.category}] ${error.key}:`, error.message);
  }
}
```

### Mapeo de Errores Nativos

```typescript
import { mapNativeErrorToPlayerError } from '@/player/core/errors';

function handleNativeError(nativeError: OnVideoErrorData) {
  const playerError = mapNativeErrorToPlayerError(nativeError);
  onError?.(playerError);
}
```

## 🏷️ Categorías de Errores

- **PLAYER_*** - Errores de reproducción (media, DRM, Cast, AirPlay, etc.)
- **NETWORK_*** - Errores de red (HTTP, conectividad, timeouts)
- **STORAGE_*** - Errores de almacenamiento (espacio, permisos, I/O)
- **DOWNLOAD_*** - Errores de descargas (inicio, progreso, validación)
- **PERMISSION_*** - Errores de permisos (storage, micrófono, Cast)
- **DEVICE_*** - Errores de dispositivo (memoria, batería, hardware)

## 📦 Estructura

```
errors/
├── PlayerError.ts              # Clase principal
├── VideoErrorMapper.ts         # Mapeo de errores nativos
├── types.ts                    # Tipos TypeScript
├── index.ts                    # Exports públicos
├── definitions/                # Definiciones de errores
│   ├── player-errors.ts       # 348 líneas - Errores de reproducción
│   ├── network-errors.ts      # 115 líneas - Errores de red
│   ├── storage-errors.ts      # Errores de almacenamiento
│   ├── download-errors.ts     # Errores de descargas
│   ├── permissions-errors.ts  # Errores de permisos
│   └── device-errors.ts       # Errores de dispositivo
├── instructions/              # Documentación de diseño
│   └── ErrorSystem.md         # Arquitectura y reglas
└── docs/                      # Guías de uso
    └── ErrorHandling.md       # Cómo usar el sistema
```

## ✨ Características

- ✅ **Tipado fuerte** - TypeScript valida todos los códigos
- ✅ **Autocompletado** - IDE sugiere códigos disponibles
- ✅ **Categorización** - Errores agrupados automáticamente
- ✅ **Contexto rico** - Información adicional en cada error
- ✅ **Mapeo nativo** - Conversión automática iOS/Android
- ✅ **Timestamps** - Momento exacto del error
- ✅ **Stack traces** - Debugging facilitado

## 🎯 Ejemplos Comunes

### Validación de Parámetros

```typescript
if (!manifests || manifests.length === 0) {
  throw new PlayerError('PLAYER_SOURCE_NO_MANIFESTS_PROVIDED', {
    providedManifests: manifests
  });
}
```

### Operaciones Asíncronas

```typescript
try {
  await loadContent(uri);
} catch (error) {
  throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
    uri,
    originalError: error
  });
}
```

### Propagación con Contexto

```typescript
try {
  await transport.seek(time);
} catch (error) {
  throw new PlayerError('PLAYER_SEEK_FAILED', {
    targetTime: time,
    currentTime: getCurrentTime(),
    originalError: error
  });
}
```

## 📊 Códigos de Error Más Usados

| Código | Descripción |
|--------|-------------|
| `PLAYER_MEDIA_LOAD_FAILED` | Fallo al cargar media |
| `PLAYER_SEEK_FAILED` | Fallo en seek |
| `NETWORK_CONNECTION_001` | Sin conexión a internet |
| `NETWORK_HTTP_404` | Recurso no encontrado |
| `STORAGE_SPACE_301` | Espacio insuficiente |
| `DOWNLOAD_START_FAILED` | Fallo al iniciar descarga |
| `PLAYER_CAST_CONNECTION_FAILED` | Fallo conexión Cast |
| `PLAYER_DRM_KEY_ERROR` | Error de DRM |

## 🔍 Ver Más

- [Documentación completa del sistema](./instructions/ErrorSystem.md)
- [Guía de uso detallada](./docs/ErrorHandling.md)
- [Definiciones de errores](./definitions/)

---

**Estado**: ✅ Implementado y en uso  
**Versión**: 1.0
