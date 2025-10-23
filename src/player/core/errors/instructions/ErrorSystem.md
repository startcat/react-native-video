# Error System - Sistema de Gestión de Errores

## 📋 Propósito

El **Error System** proporciona un sistema centralizado, tipado y estructurado para la gestión de errores en el reproductor. Reemplaza el uso de errores genéricos de JavaScript con una clase `PlayerError` que incluye códigos de error específicos, categorización automática, contexto adicional y mapeo desde errores nativos.

## 🎯 Objetivos

1. **Tipado fuerte**: Todos los errores tienen códigos específicos definidos en TypeScript
2. **Categorización**: Los errores se agrupan automáticamente por categoría (PLAYER, NETWORK, STORAGE, etc.)
3. **Contexto rico**: Cada error puede incluir información adicional relevante
4. **Mapeo nativo**: Conversión automática de errores nativos (iOS/Android) a códigos PlayerError
5. **Debugging facilitado**: Timestamps y contexto para facilitar el debugging
6. **Consistencia**: Mismo formato de error en toda la aplicación

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    PlayerError                          │
│  (Clase base con tipado y categorización)              │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ usa
┌─────────────────────────────────────────────────────────┐
│              PLAYER_ERROR_CODES                         │
│  (Constante con todos los códigos de error)            │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ compuesto por
┌─────────────────────────────────────────────────────────┐
│              ERROR_DEFINITIONS                          │
│  (Definiciones organizadas por categoría)              │
│  - PLAYER_ERROR_DEFINITIONS                             │
│  - NETWORK_ERROR_DEFINITIONS                            │
│  - STORAGE_ERROR_DEFINITIONS                            │
│  - DOWNLOAD_ERROR_DEFINITIONS                           │
│  - PERMISSION_ERROR_DEFINITIONS                         │
│  - DEVICE_ERROR_DEFINITIONS                             │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ usado por
┌─────────────────────────────────────────────────────────┐
│              VideoErrorMapper                           │
│  (Mapea errores nativos a PlayerError)                 │
└─────────────────────────────────────────────────────────┘
```

## 📦 Componentes

### 1. PlayerError (Clase Principal)

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
- `key`: Código de error específico (ej: `'PLAYER_MEDIA_LOAD_FAILED'`)
- `category`: Categoría extraída del código (ej: `'PLAYER'`)
- `message`: Mensaje descriptivo del error
- `context`: Información adicional relevante al error
- `timestamp`: Momento en que ocurrió el error (Unix timestamp)

### 2. ERROR_DEFINITIONS (Definiciones de Errores)

Objeto que contiene todas las definiciones de errores organizadas por categoría:

```typescript
const ERROR_DEFINITIONS = {
  ...PLAYER_ERROR_DEFINITIONS,
  ...NETWORK_ERROR_DEFINITIONS,
  ...STORAGE_ERROR_DEFINITIONS,
  ...DOWNLOAD_ERROR_DEFINITIONS,
  ...PERMISSION_ERROR_DEFINITIONS,
  ...DEVICE_ERROR_DEFINITIONS,
};
```

### 3. VideoErrorMapper (Mapeo de Errores Nativos)

Convierte errores nativos de iOS (AVPlayer) y Android (ExoPlayer) a códigos PlayerError:

```typescript
function mapNativeErrorToPlayerError(
  nativeError: OnVideoErrorData
): PlayerError
```

## 📂 Estructura de Archivos

```
src/player/core/errors/
├── PlayerError.ts              # Clase PlayerError
├── VideoErrorMapper.ts         # Mapeo de errores nativos
├── types.ts                    # Tipos TypeScript
├── index.ts                    # Exports públicos
├── definitions/                # Definiciones de errores
│   ├── index.ts               # Agregador de definiciones
│   ├── player-errors.ts       # Errores de reproducción
│   ├── network-errors.ts      # Errores de red
│   ├── storage-errors.ts      # Errores de almacenamiento
│   ├── download-errors.ts     # Errores de descargas
│   ├── permissions-errors.ts  # Errores de permisos
│   └── device-errors.ts       # Errores de dispositivo
├── instructions/              # Documentación de diseño
│   └── ErrorSystem.md         # Este archivo
└── docs/                      # Guías de uso
    └── ErrorHandling.md       # Cómo usar el sistema
```

## 🏷️ Categorías de Errores

### 1. PLAYER_* (Errores de Reproducción)

Errores relacionados con la reproducción de contenido multimedia:
- Carga de media (`PLAYER_MEDIA_LOAD_FAILED`)
- Decodificación (`PLAYER_MEDIA_DECODE_ERROR`)
- Formatos no soportados (`PLAYER_UNSUPPORTED_FORMAT`)
- DRM (`PLAYER_DRM_KEY_ERROR`)
- Casting (`PLAYER_CAST_CONNECTION_FAILED`)
- AirPlay (`PLAYER_AIRPLAY_NOT_AVAILABLE`)
- Analytics (`PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED`)
- Sources (`PLAYER_SOURCE_NO_MANIFESTS_PROVIDED`)
- Event Handlers (`PLAYER_EVENT_HANDLER_LOAD_FAILED`)

### 2. NETWORK_* (Errores de Red)

Errores relacionados con conectividad y peticiones HTTP:
- Conectividad (`NETWORK_CONNECTION_001`)
- HTTP 4XX (`NETWORK_HTTP_404`, `NETWORK_HTTP_401`)
- HTTP 5XX (`NETWORK_HTTP_500`, `NETWORK_HTTP_503`)
- Timeouts (`NETWORK_CONNECTION_002`)
- SSL/TLS (`NETWORK_CONNECTION_004`)

### 3. STORAGE_* (Errores de Almacenamiento)

Errores relacionados con almacenamiento local:
- Espacio insuficiente (`STORAGE_SPACE_301`)
- Permisos (`STORAGE_PERMISSION_401`)
- Lectura/Escritura (`STORAGE_ASYNC_001`, `STORAGE_ASYNC_002`)
- Contenido no encontrado (`STORAGE_SECURE_106`)

### 4. DOWNLOAD_* (Errores de Descargas)

Errores específicos del sistema de descargas:
- Inicio de descarga (`DOWNLOAD_START_FAILED`)
- Descarga en progreso (`DOWNLOAD_IN_PROGRESS_ERROR`)
- Validación (`DOWNLOAD_VALIDATION_FAILED`)
- Almacenamiento (`DOWNLOAD_STORAGE_ERROR`)

### 5. PERMISSION_* (Errores de Permisos)

Errores relacionados con permisos del sistema:
- Almacenamiento (`PERMISSION_STORAGE_DENIED`)
- Micrófono (`PERMISSION_MICROPHONE_DENIED`)
- Cast (`PERMISSION_CAST_DENIED`)

### 6. DEVICE_* (Errores de Dispositivo)

Errores relacionados con el estado del dispositivo:
- Memoria (`DEVICE_INSUFFICIENT_MEMORY`)
- Batería (`DEVICE_BATTERY_LOW`)
- Almacenamiento (`DEVICE_STORAGE_FULL`)
- Hardware (`DEVICE_HARDWARE_ERROR`)

## 🎨 Convenciones de Nomenclatura

### Formato de Códigos de Error

```
<CATEGORIA>_<DESCRIPCION>_[NUMERO]
```

**Ejemplos:**
- `PLAYER_MEDIA_LOAD_FAILED` - Error de carga de media
- `NETWORK_HTTP_404` - Error HTTP 404
- `STORAGE_SPACE_301` - Espacio insuficiente
- `DOWNLOAD_START_FAILED` - Fallo al iniciar descarga

### Reglas:

1. **MAYÚSCULAS**: Todos los códigos en mayúsculas
2. **SNAKE_CASE**: Separación con guiones bajos
3. **CATEGORÍA PRIMERO**: Siempre empieza con la categoría
4. **DESCRIPTIVO**: Nombre claro y específico
5. **NÚMEROS OPCIONALES**: Para códigos HTTP o subcategorías

## ✅ Reglas de Uso

### ✅ LO QUE SE DEBE HACER:

1. **Usar PlayerError para todos los errores del player**
   ```typescript
   throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
     uri: source.uri,
     reason: 'Network timeout'
   });
   ```

2. **Incluir contexto relevante**
   ```typescript
   throw new PlayerError('PLAYER_SOURCE_NO_MANIFEST_FOUND', {
     availableManifests: manifests,
     isCast: true,
     isLive: false
   });
   ```

3. **Capturar y convertir errores genéricos**
   ```typescript
   try {
     await loadSource();
   } catch (error) {
     if (error instanceof PlayerError) {
       throw error;
     }
     throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED', {
       originalError: error
     });
   }
   ```

4. **Usar el mapper para errores nativos**
   ```typescript
   const playerError = mapNativeErrorToPlayerError(nativeError);
   ```

5. **Propagar errores con contexto adicional**
   ```typescript
   try {
     await operation();
   } catch (error) {
     throw new PlayerError('PLAYER_OPERATION_FAILED', {
       operation: 'seek',
       targetTime: 120,
       originalError: error
     });
   }
   ```

### ❌ LO QUE NO SE DEBE HACER:

1. **NO usar Error genérico**
   ```typescript
   // ❌ MAL
   throw new Error('Failed to load media');
   
   // ✅ BIEN
   throw new PlayerError('PLAYER_MEDIA_LOAD_FAILED');
   ```

2. **NO crear códigos de error ad-hoc**
   ```typescript
   // ❌ MAL
   throw new PlayerError('SOME_RANDOM_ERROR' as any);
   
   // ✅ BIEN
   throw new PlayerError('PLAYER_UNKNOWN_999');
   ```

3. **NO omitir contexto importante**
   ```typescript
   // ❌ MAL
   throw new PlayerError('PLAYER_SOURCE_NO_MANIFEST_FOUND');
   
   // ✅ BIEN
   throw new PlayerError('PLAYER_SOURCE_NO_MANIFEST_FOUND', {
     availableManifests: manifests,
     isCast: true
   });
   ```

4. **NO perder información del error original**
   ```typescript
   // ❌ MAL
   try {
     await operation();
   } catch (error) {
     throw new PlayerError('PLAYER_OPERATION_FAILED');
   }
   
   // ✅ BIEN
   try {
     await operation();
   } catch (error) {
     throw new PlayerError('PLAYER_OPERATION_FAILED', {
       originalError: error
     });
   }
   ```

5. **NO ignorar errores silenciosamente**
   ```typescript
   // ❌ MAL
   try {
     await operation();
   } catch (error) {
     console.log('Error occurred');
   }
   
   // ✅ BIEN
   try {
     await operation();
   } catch (error) {
     const playerError = error instanceof PlayerError 
       ? error 
       : new PlayerError('PLAYER_OPERATION_FAILED', { originalError: error });
     onError?.(playerError);
     throw playerError;
   }
   ```

## 🔄 Flujo de Errores

### 1. Error Nativo (iOS/Android)

```
Native Error (ExoPlayer/AVPlayer)
         ↓
VideoErrorMapper.mapNativeErrorToPlayerError()
         ↓
    PlayerError
         ↓
Event Handler (onError)
         ↓
PlayerController
         ↓
Analytics / UI
```

### 2. Error de Aplicación

```
Operation Fails
         ↓
throw new PlayerError(code, context)
         ↓
Catch Block
         ↓
Error Handler / Callback
         ↓
PlayerController
         ↓
Analytics / UI
```

## 📊 Beneficios

1. **Tipado fuerte**: TypeScript valida todos los códigos de error
2. **Autocompletado**: IDE sugiere códigos de error disponibles
3. **Categorización automática**: Fácil filtrar por tipo de error
4. **Debugging mejorado**: Contexto y timestamps facilitan el debugging
5. **Analytics**: Fácil trackear errores por categoría y código
6. **Mantenibilidad**: Definiciones centralizadas y organizadas
7. **Consistencia**: Mismo formato en toda la aplicación
8. **Mapeo nativo**: Conversión automática de errores de plataforma

## 🔍 Extensibilidad

### Agregar Nuevos Errores

1. **Identificar la categoría** (PLAYER, NETWORK, STORAGE, etc.)
2. **Agregar definición** en el archivo correspondiente:
   ```typescript
   // En definitions/player-errors.ts
   export const PLAYER_ERROR_DEFINITIONS = {
     // ... errores existentes
     PLAYER_NEW_ERROR_CODE: {
       message: "Description of the new error.",
     },
   };
   ```
3. **TypeScript automáticamente** incluirá el nuevo código en `PlayerErrorCodeKey`
4. **Usar el nuevo código**:
   ```typescript
   throw new PlayerError('PLAYER_NEW_ERROR_CODE', { context });
   ```

### Agregar Nueva Categoría

1. **Crear archivo** en `definitions/` (ej: `custom-errors.ts`)
2. **Definir errores**:
   ```typescript
   export const CUSTOM_ERROR_DEFINITIONS = {
     CUSTOM_ERROR_001: {
       message: "Custom error description.",
     },
   };
   ```
3. **Agregar a index**:
   ```typescript
   // En definitions/index.ts
   import { CUSTOM_ERROR_DEFINITIONS } from "./custom-errors";
   
   export const ERROR_DEFINITIONS = {
     ...CUSTOM_ERROR_DEFINITIONS,
     // ... otras definiciones
   };
   ```

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Estado**: ✅ Implementado y en uso
