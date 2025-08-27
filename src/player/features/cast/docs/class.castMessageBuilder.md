# Clase CastMessageBuilder - CastMessageBuilder.ts

Este documento describe la clase `CastMessageBuilder`, responsable de construir mensajes Cast de forma consistente y validada para su uso con Google Cast SDK. **Ahora integrada con el sistema Logger del player.**

## Índice

- [Descripción General](#descripción-general)
- [Constructor](#constructor)
- [Propiedades](#propiedades)
- [Métodos Públicos](#métodos-públicos)
- [Métodos Privados](#métodos-privados)
- [Sistema de Logging](#sistema-de-logging)
- [Tipos y Interfaces](#tipos-y-interfaces)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Casos de Uso](#casos-de-uso)
- [Notas Técnicas](#notas-técnicas)

---

## Descripción General

`CastMessageBuilder` es una clase utilitaria que construye mensajes Cast válidos y consistentes. Maneja la validación de configuración, generación de IDs únicos, procesamiento de metadata y construcción del mensaje final compatible con Google Cast SDK.

**✨ Nueva integración con Logger:** La clase ahora utiliza el sistema Logger centralizado del player para logging consistente y configurable.

### Importación

```typescript
import { CastMessageBuilder } from './CastMessageBuilder';
import type { 
    CastMessageConfig,
    MessageBuilderConfig,
    CastContentMetadata
} from './types';
import { LoggerConfigBasic, LogLevel } from '../../logger';
```

---

## Constructor

### `new CastMessageBuilder(config?)`

Crea una nueva instancia del constructor de mensajes Cast con Logger integrado.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `MessageBuilderConfig & LoggerConfigBasic` | ❌ | Configuración del builder y logger |

**Configuración por defecto:**
```typescript
{
    // MessageBuilder config
    enableYoubora: true,
    enableAds: true,
    defaultStartPosition: 0,
    debugMode: true,
    
    // Logger config
    enabled: true,
    level: LogLevel.DEBUG,
    prefix: '📡 Cast Feature'
}
```

**Ejemplo con Logger:**
```typescript
const builder = new CastMessageBuilder({
    enableYoubora: true,
    debugMode: true,
    // Logger configuration
    enabled: true,
    level: LogLevel.INFO,
    instanceId: 'cast-builder-1'
});
```

---

## Propiedades

### Propiedades Privadas

| Propiedad    | Tipo                     | Descripción                               |
|--------------|--------------------------|-------------------------------------------|
| `config`     | `MessageBuilderConfig & LoggerConfigBasic` | Configuración del builder y logger |
| `instanceId` | `number`                 | ID único de la instancia para logging    |
| `playerLogger` | `Logger`               | Instancia del Logger principal            |
| `currentLogger` | `ComponentLogger`      | Logger específico del componente          |

---

## Sistema de Logging

### Configuración del Logger

La clase integra el sistema Logger centralizado del player con las siguientes características:

**Configuración automática:**
```typescript
{
    enabled: true,                    // Logger habilitado por defecto
    prefix: '📡 Cast Feature',        // Prefijo identificativo
    level: LogLevel.DEBUG,            // Nivel de logging por defecto
    useColors: true,                  // Colores en consola
    includeLevelName: false,          // Sin nombre de nivel
    includeTimestamp: true,           // Con timestamp
    includeInstanceId: true           // Con ID de instancia
}
```

**Niveles de logging disponibles:**
- `LogLevel.ERROR` - Solo errores críticos
- `LogLevel.WARN` - Advertencias y errores
- `LogLevel.INFO` - Información general
- `LogLevel.DEBUG` - Información detallada (por defecto)

### Métodos de Logging

| Método | Descripción | Ejemplo |
|--------|-------------|---------|
| `currentLogger.info()` | Información general | `CastMessageBuilder initialized` |
| `currentLogger.debug()` | Información detallada | `Building Cast message for VOD content` |
| `currentLogger.warn()` | Advertencias | `Missing poster URL, using default` |
| `currentLogger.error()` | Errores | `Invalid source URI provided` |

### Ejemplo de Logs

```
[2024-01-15 10:30:45] 📡 Cast Feature [CastMessageBuilder#1] CastMessageBuilder initialized: {"enableYoubora":true,"debugMode":true}
[2024-01-15 10:30:46] 📡 Cast Feature [CastMessageBuilder#1] Building Cast message for content: "Mi Video"
[2024-01-15 10:30:46] 📡 Cast Feature [CastMessageBuilder#1] Generated content ID: "content_123_1642248646"
```

---

## Propiedades (Continuación)

| Propiedad    | Tipo                     | Descripción                               |
|--------------|--------------------------|-------------------------------------------|
| `config`     | `MessageBuilderConfig`   | Configuración actual del builder          |
| `debugMode`  | `boolean`                | Modo debug para logging detallado         |

---

## Métodos Públicos

### `buildCastMessage(config: CastMessageConfig): any`

Construye un mensaje Cast completo a partir de la configuración proporcionada.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración del mensaje Cast a construir     |

**Retorna:** `any` - Mensaje Cast completo listo para enviar

**Características:**
- ✅ **Validación completa** de la configuración de entrada
- 🔑 **Generación de ID único** para el contenido
- 📋 **Procesamiento de metadata** con valores por defecto
- ⏰ **Cálculo de posición inicial** basado en tipo de contenido
- 🎯 **Detección de tipo MIME** automática
- 🛡️ **Manejo de errores** con logging detallado

**Ejemplo:**
```typescript
const message = builder.buildCastMessage({
    source: { uri: 'https://example.com/video.m3u8' },
    manifest: manifestData,
    drm: drmConfig,
    youbora: youboraConfig,
    metadata: {
        id: 'video-123',
        title: 'Mi Video',
        isLive: false,
        startPosition: 60
    }
});
```

### `updateConfig(newConfig: Partial<MessageBuilderConfig>): void`

Actualiza la configuración del builder.

**Parámetros:**
| Parámetro   | Tipo                              | Obligatorio | Descripción                                    |
|-------------|-----------------------------------|-------------|------------------------------------------------|
| `newConfig` | `Partial<MessageBuilderConfig>`   | ✅          | Configuración parcial a fusionar               |

**Características:**
- 🔄 **Fusión inteligente** con configuración existente
- 🐛 **Actualización de modo debug** automática
- 📝 **Logging** de cambios de configuración

**Ejemplo:**
```typescript
builder.updateConfig({
    debugMode: true,
    defaultStartPosition: 120
});
```

### `getConfig(): MessageBuilderConfig`

Obtiene una copia de la configuración actual del builder.

**Parámetros:** Ninguno

**Retorna:** `MessageBuilderConfig` - Copia de la configuración actual

**Características:**
- 📋 **Copia segura** - No permite modificación directa
- 🔒 **Inmutabilidad** de la configuración interna

**Ejemplo:**
```typescript
const currentConfig = builder.getConfig();
console.log('Configuración actual:', currentConfig);
```

### `resetConfig(): void`

Resetea la configuración del builder a los valores por defecto.

**Parámetros:** Ninguno

**Características:**
- 🔄 **Restauración completa** a `DEFAULT_MESSAGE_CONFIG`
- 📝 **Logging** del reset
- 🐛 **Recalibración** del modo debug

**Ejemplo:**
```typescript
builder.resetConfig();
console.log('Configuración reseteada a valores por defecto');
```

---

## Métodos Privados

### `validateConfig(config: CastMessageConfig): void`

Valida la configuración del mensaje Cast antes de procesarla.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración a validar                        |

**Validaciones realizadas:**
- ✅ **Source URI obligatorio** y válido
- ✅ **Manifest obligatorio**
- ✅ **Metadata obligatorio**
- 🌐 **URL válida** con protocolo HTTP/HTTPS

**Errores que puede lanzar:**
- `"Source URI is required"`
- `"Manifest is required"`
- `"Metadata is required"`
- `"Invalid source URI: [url]"`

### `generateContentId(config: CastMessageConfig): string`

Genera un ID único para el contenido basado en su configuración.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración del contenido                    |

**Retorna:** `string` - ID único generado

**Algoritmo:**
1. Usa `metadata.id` si está disponible
2. Genera hash del URI + timestamp
3. Garantiza unicidad y trazabilidad

### `buildMetadata(metadata: CastContentMetadata): CastContentMetadata`

Procesa y completa la metadata con valores por defecto.

**Parámetros:**
| Parámetro  | Tipo                  | Obligatorio | Descripción                                    |
|------------|-----------------------|-------------|------------------------------------------------|
| `metadata` | `CastContentMetadata` | ✅          | Metadata a procesar                            |

**Retorna:** `CastContentMetadata` - Metadata completa con valores por defecto

**Procesamiento realizado:**
- 📝 **Truncamiento** de títulos y descripciones largos
- 🖼️ **Poster por defecto** si no se proporciona
- ⏰ **Posición inicial** basada en configuración
- 🔄 **Normalización** de banderas booleanas

### `calculateStartPosition(config: CastMessageConfig): number`

Calcula la posición de inicio apropiada para el contenido.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración del contenido                    |

**Retorna:** `number` - Posición de inicio en segundos

**Lógica aplicada:**
- 🔴 **Live:** Siempre desde posición 0
- 📺 **DVR:** Usa `startPosition` del metadata o 0
- 📹 **VOD:** Usa `startPosition` del metadata o configuración por defecto

### `getMimeType(uri: string): string`

Detecta el tipo MIME basado en la URL del contenido.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `uri`     | `string` | ✅          | URL del contenido                              |

**Retorna:** `string` - Tipo MIME detectado

**Tipos soportados:**
- 🎬 **HLS:** `.m3u8` o `hls` → `application/x-mpegURL`
- 🎥 **DASH:** `.mpd` o `dash` → `application/dash+xml`
- 🎵 **MP3:** `.mp3` → `audio/mpeg`
- 📺 **MP4:** `.mp4` → `video/mp4`
- 🌐 **WEBM:** `.webm` → `video/webm`
- 📱 **Por defecto:** DASH

### `getContentType(metadata: CastContentMetadata): CastContentType`

Determina el tipo de contenido basado en la metadata.

**Parámetros:**
| Parámetro  | Tipo                  | Obligatorio | Descripción                                    |
|------------|-----------------------|-------------|------------------------------------------------|
| `metadata` | `CastContentMetadata` | ✅          | Metadata del contenido                         |

**Retorna:** `CastContentType` - Tipo de contenido (VOD, LIVE, DVR)

**Lógica:**
- 🔴 **Live + DVR:** `CastContentType.DVR`
- 🔴 **Live:** `CastContentType.LIVE`
- 📹 **Por defecto:** `CastContentType.VOD`

### `isValidUrl(url: string): boolean`

Valida si una URL es correcta y utilizable.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `url`     | `string` | ✅          | URL a validar                                  |

**Retorna:** `boolean` - `true` si la URL es válida

**Validaciones:**
- ✅ **Formato URL válido** usando constructor URL
- 🌐 **Protocolo HTTP/HTTPS** requerido

### `truncateString(str: string, maxLength: number): string`

Trunca un string a la longitud especificada.

**Parámetros:**
| Parámetro   | Tipo     | Obligatorio | Descripción                                    |
|-------------|----------|-------------|------------------------------------------------|
| `str`       | `string` | ✅          | String a truncar                               |
| `maxLength` | `number` | ✅          | Longitud máxima permitida                      |

**Retorna:** `string` - String truncado con "..." si es necesario

### `hashString(str: string): string`

Genera un hash simple de un string.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `str`     | `string` | ✅          | String a hashear                               |

**Retorna:** `string` - Hash hexadecimal del string

**Algoritmo:**
- 🔢 **Hash simple** usando operaciones bit a bit
- 📈 **Conversión a 32-bit** integer
- 🔤 **Formato hexadecimal** en output

### `log(message: string, data?: any): void`

Sistema de logging interno condicionado por modo debug.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `message` | `string` | ✅          | Mensaje a loggear                              |
| `data`    | `any`    | ❌          | Datos adicionales opcionales                   |

### `logError(message: string, error: any): void`

Sistema de logging de errores (siempre activo).

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `message` | `string` | ✅          | Mensaje de error                               |
| `error`   | `any`    | ✅          | Objeto de error                                |

---

## Tipos y Interfaces

### `MessageBuilderConfig`

```typescript
interface MessageBuilderConfig {
    debugMode?: boolean;
    defaultStartPosition?: number;
    enableValidation?: boolean;
    maxTitleLength?: number;
    maxDescriptionLength?: number;
}
```

### `CastMessageConfig`

```typescript
interface CastMessageConfig {
    source: { uri: string };
    manifest: any;
    drm?: any;
    youbora?: any;
    metadata: CastContentMetadata;
}
```

### `CastContentMetadata`

```typescript
interface CastContentMetadata {
    id?: string;
    title?: string;
    description?: string;
    poster?: string;
    squaredPoster?: string;
    isLive?: boolean;
    isDVR?: boolean;
    startPosition?: number;
    liveStartDate?: number;
    adTagUrl?: string;
    hasNext?: boolean;
}
```

---

## Ejemplos de Uso

### Ejemplo Básico

```typescript
import { CastMessageBuilder } from './CastMessageBuilder';

// Crear builder con configuración por defecto
const builder = new CastMessageBuilder();

// Construir mensaje para contenido VOD
const message = builder.buildCastMessage({
    source: { uri: 'https://example.com/video.m3u8' },
    manifest: manifestData,
    metadata: {
        id: 'video-123',
        title: 'Mi Película',
        description: 'Una excelente película de acción',
        poster: 'https://example.com/poster.jpg',
        isLive: false,
        startPosition: 120
    }
});

console.log('Mensaje Cast construido:', message);
```

### Ejemplo con Contenido Live

```typescript
const builder = new CastMessageBuilder({
    debugMode: true,
    enableValidation: true
});

const liveMessage = builder.buildCastMessage({
    source: { uri: 'https://live.example.com/stream.m3u8' },
    manifest: liveManifest,
    metadata: {
        id: 'live-sports',
        title: 'Partido en Vivo',
        description: 'Final de la Copa Mundial',
        isLive: true,
        isDVR: false,
        liveStartDate: Date.now()
    }
});
```

### Ejemplo con Contenido DVR

```typescript
const dvrMessage = builder.buildCastMessage({
    source: { uri: 'https://dvr.example.com/recording.mpd' },
    manifest: dvrManifest,
    metadata: {
        id: 'dvr-recording',
        title: 'Programa Grabado',
        isLive: true,
        isDVR: true,
        startPosition: 300 // Empezar en el minuto 5
    }
});
```

### Ejemplo con Configuración Personalizada

```typescript
const customBuilder = new CastMessageBuilder({
    debugMode: true,
    defaultStartPosition: 0,
    maxTitleLength: 50,
    maxDescriptionLength: 200
});

// Actualizar configuración dinámicamente
customBuilder.updateConfig({
    defaultStartPosition: 30
});

// Construir mensaje
const message = customBuilder.buildCastMessage(config);

// Obtener configuración actual
const currentConfig = customBuilder.getConfig();
console.log('Configuración actual:', currentConfig);

// Resetear si es necesario
customBuilder.resetConfig();
```

### Ejemplo con Manejo de Errores

```typescript
const builder = new CastMessageBuilder({ debugMode: true });

try {
    const message = builder.buildCastMessage({
        source: { uri: 'invalid-url' }, // URL inválida
        manifest: null, // Manifest nulo
        metadata: null // Metadata nulo
    });
} catch (error) {
    console.error('Error construyendo mensaje:', error.message);
    // Posibles errores:
    // - "Source URI is required"
    // - "Manifest is required" 
    // - "Metadata is required"
    // - "Invalid source URI: invalid-url"
}
```

---

## Casos de Uso

### 1. **Reproducción de VOD**
```typescript
// Contenido de video bajo demanda con posición específica
const vodMessage = builder.buildCastMessage({
    source: { uri: 'https://cdn.example.com/movie.m3u8' },
    manifest: vodManifest,
    metadata: {
        title: 'Película de Acción',
        startPosition: 180, // Comenzar en minuto 3
        isLive: false
    }
});
```

### 2. **Streaming en Vivo**
```typescript
// Contenido en vivo sin DVR
const liveMessage = builder.buildCastMessage({
    source: { uri: 'https://live.example.com/channel1.m3u8' },
    manifest: liveManifest,
    metadata: {
        title: 'Canal de Noticias 24/7',
        isLive: true,
        isDVR: false,
        liveStartDate: Date.now()
    }
});
```

### 3. **Contenido con DRM**
```typescript
const protectedMessage = builder.buildCastMessage({
    source: { uri: 'https://secure.example.com/protected.mpd' },
    manifest: manifestWithDrm,
    drm: {
        type: 'widevine',
        licenseUrl: 'https://license.example.com/widevine'
    },
    metadata: {
        title: 'Contenido Premium',
        isLive: false
    }
});
```

### 4. **Integración con Analytics**
```typescript
const messageWithAnalytics = builder.buildCastMessage({
    source: { uri: 'https://content.example.com/video.m3u8' },
    manifest: manifest,
    youbora: {
        accountCode: 'YOUR_ACCOUNT',
        username: 'user123',
        contentTitle: 'Mi Video'
    },
    metadata: {
        title: 'Video con Analytics',
        isLive: false
    }
});
```

### 5. **Configuración de Debug**
```typescript
// Builder para desarrollo con logging detallado
const debugBuilder = new CastMessageBuilder({
    debugMode: true,
    enableValidation: true,
    maxTitleLength: 100
});

const debugMessage = debugBuilder.buildCastMessage(config);
// Logs detallados en consola:
// "[Cast] [MessageBuilder] Building cast message { sourceUri: '...', ... }"
// "[Cast] [MessageBuilder] Cast message built successfully { contentId: '...', ... }"
```

---

## Notas Técnicas

### Características de la Implementación

1. **Generación de IDs Únicos:**
   - Prioriza `metadata.id` si está disponible
   - Genera hash basado en URI + timestamp como fallback
   - Garantiza unicidad y trazabilidad

2. **Manejo de Tipos de Contenido:**
   - **VOD:** Posición inicial configurable
   - **Live:** Siempre desde posición 0
   - **DVR:** Posición inicial desde metadata

3. **Detección de Tipos MIME:**
   - Análisis de extensiones de archivo
   - Soporte para HLS, DASH, MP3, MP4, WEBM
   - Fallback inteligente a DASH

4. **Validación Robusta:**
   - Validación de URLs con constructor URL nativo
   - Verificación de campos obligatorios
   - Manejo de errores descriptivo

5. **Logging Inteligente:**
   - Logging condicional basado en `debugMode`
   - Logging de errores siempre activo
   - Información estructurada para debugging

### Rendimiento y Seguridad

- **Inmutabilidad:** Las configuraciones son copiadas, no referenciadas
- **Validación temprana:** Errores detectados antes del procesamiento
- **Manejo de errores:** Try-catch completo con logging detallado
- **Memory-safe:** No hay referencias colgantes o memory leaks

### Integración con el Sistema Cast

- **Compatible** con `getSourceMessageForCast` existente
- **Extiende funcionalidad** sin romper compatibilidad
- **Configurable** para diferentes entornos (dev/prod)
- **Trazeable** con IDs únicos y logging estructurado

La clase `CastMessageBuilder` proporciona una interfaz robusta y confiable para la construcción de mensajes Cast, con validación integrada, manejo de errores y configurabilidad avanzada.
