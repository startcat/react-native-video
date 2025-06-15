# Prop `manifests`

## Descripción General

La prop `manifests` es un array de objetos que define las fuentes multimedia que se utilizarán para la reproducción. Cada elemento del array representa una fuente diferente que el reproductor puede utilizar, permitiendo proporcionar múltiples formatos o calidades del mismo contenido.

El reproductor seleccionará automáticamente el mejor manifiesto disponible según el dispositivo y las condiciones de red actuales, priorizando los manifiestos que sean compatibles con la plataforma actual.

## Estructura del Objeto Manifiesto

Cada objeto en el array `manifests` tiene la siguiente estructura:

```typescript
export interface IManifest {
	manifestURL: string;
	isExternal?: boolean;
	thumbnailTrackUrl?: string;
	thumbnailMetadata?: IThumbnailMetadata;
	type: STREAM_FORMAT_TYPE;
	dvr_window_minutes?: number;
	drmConfig?: {
		type: DRM_TYPE;
		licenseAcquisitionURL: string;
		certificateURL?: string;
	};
}
```

### Campos del objeto manifiesto

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `manifestURL` | string | Sí | URL del archivo de manifiesto (HLS, DASH, etc.) que describe el contenido multimedia |
| `type` | STREAM_FORMAT_TYPE | Sí | Tipo de formato del stream (DASH, HLS, MP3, MP4, OTHER) |
| `isExternal` | boolean | No | No lo usamos. Por defecto es `false` |
| `thumbnailTrackUrl` | string | No | URL que apunta a un archivo que contiene información sobre las miniaturas de la línea de tiempo |
| `thumbnailMetadata` | IThumbnailMetadata | No | Objeto con metadatos sobre las miniaturas |
| `dvr_window_minutes` | number | No | Minutos disponibles para retroceder en contenido en directo (DVR). **Importante**: En streams en directo, la funcionalidad DVR solo se habilitará si este campo está informado y es mayor que 0 |
| `drmConfig` | Object | No | Configuración para protección de contenido digital (DRM) |

### Tipos de formato soportados (STREAM_FORMAT_TYPE)

| Valor | Descripción |
|-------|-------------|
| `DASH` | Manifiestos en formato MPEG-DASH |
| `HLS` | Manifiestos en formato HLS (HTTP Live Streaming) |
| `MP3` | Archivos de audio MP3 |
| `MP4` | Archivos de vídeo MP4 |
| `OTHER` | Otros formatos |

### Estructura de IThumbnailMetadata

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tileDuration` | number | Duración de cada tile en segundos |
| `thumbnailDuration` | number | Duración total de la pista de miniaturas |
| `url` | string | URL de la imagen de miniaturas |
| `width` | number | Ancho de cada miniatura |
| `height` | number | Alto de cada miniatura |
| `imageWidth` | number | Ancho total de la imagen de miniaturas |
| `imageHeight` | number | Alto total de la imagen de miniaturas |

## Configuración DRM

El campo `drmConfig` permite configurar la protección de contenido digital (DRM) para el stream:

```typescript
drmConfig?: {
	type: DRM_TYPE;
	licenseAcquisitionURL: string;
	certificateURL?: string;
}
```

### Campos de drmConfig

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `type` | DRM_TYPE | Sí | Tipo de sistema DRM a utilizar |
| `licenseAcquisitionURL` | string | Sí | URL del servidor de licencias DRM donde se obtendrán las licencias |
| `certificateURL` | string | No | URL donde se encuentra el certificado (principalmente para FairPlay) |

### Tipos de DRM soportados (DRM_TYPE)

| Valor | Descripción | Compatibilidad Axinom |
|-------|-------------|----------------------|
| `WIDEVINE` | Sistema DRM de Google, ampliamente utilizado en Android y navegadores | ✅ Totalmente compatible |
| `PLAYREADY` | Sistema DRM de Microsoft, utilizado en Windows | ✅ Totalmente compatible |
| `CLEARKEY` | Implementación simple de DRM, definida en la especificación EME | ✅ Compatible |
| `FAIRPLAY` | Sistema DRM de Apple, exclusivo para dispositivos iOS/macOS | ✅ Totalmente compatible |

## Ejemplo de configuración

```javascript
manifests: [
  {
    // Manifiesto DASH con protección Widevine
    manifestURL: 'https://example.com/stream.mpd',
    type: STREAM_FORMAT_TYPE.DASH,
    drmConfig: {
      type: DRM_TYPE.WIDEVINE,
      licenseAcquisitionURL: 'https://license.example.com/widevine'
    }
  },
  {
    // Manifiesto HLS con protección FairPlay para dispositivos iOS
    manifestURL: 'https://example.com/stream.m3u8',
    type: STREAM_FORMAT_TYPE.HLS,
    drmConfig: {
      type: DRM_TYPE.FAIRPLAY,
      licenseAcquisitionURL: 'https://license.example.com/fairplay',
      certificateURL: 'https://license.example.com/fairplay-cert'
    }
  },
  {
    // Versión sin DRM para fallback
    manifestURL: 'https://example.com/stream-clear.m3u8',
    type: STREAM_FORMAT_TYPE.HLS
  }
]
```

## Selección de manifiesto

El reproductor seleccionará automáticamente el manifiesto más adecuado siguiendo este orden de prioridad:

1. Compatibilidad con la plataforma actual (iOS, Android)
2. Formato preferido (DASH en android y HLS en iOS)
3. Disponibilidad de DRM adecuado para la plataforma

Esta lógica se implementa internamente a través de la función `getBestManifest` que analiza los manifiestos disponibles y selecciona el más apropiado para las condiciones actuales.

## Proveedores DRM

El componente Player ha sido probado y optimizado para trabajar con [Axinom DRM](https://www.axinom.com/digital-rights-management/) como proveedor de soluciones DRM. Este proveedor ofrece una solución completa para la protección de contenidos multimedia en todas las plataformas soportadas por el Player.

Para más información sobre la implementación específica con Axinom, puedes consultar la [documentación oficial de Axinom DRM](https://www.axinom.com/products/digital-rights-management/).

## Personalización del Source URI

El componente Player permite personalizar la generación de URLs para los manifiestos mediante la prop `getSourceUri`. Esta prop te permite sobrescribir la función interna `getVideoSourceUri` que procesa las URLs de los manifiestos antes de pasarlas al reproductor.

### Función `getSourceUri`

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `manifest` | IManifest | El objeto manifiesto seleccionado para la reproducción |
| `dvrWindowMinutes` | number (opcional) | Minutos disponibles para DVR, si aplica |
| `liveStartProgramTimestamp` | number (opcional) | Timestamp de inicio del programa en directo, si aplica |

#### Valor de retorno

| Tipo | Descripción |
|------|-------------|
| string | La URL final que se utilizará para el manifiesto |

### Comportamiento predeterminado

Si no se proporciona la prop `getSourceUri`, el Player utilizará su función interna `getVideoSourceUri` que realiza las siguientes operaciones:

1. Convierte la URL del manifiesto en una URI absoluta
2. Procesa los parámetros de consulta existentes en la URL
3. Maneja parámetros específicos para contenido DVR (`start` y `end`)
4. Añade timestamps de inicio para contenido en directo con DVR

### Cuándo personalizar

Deberías considerar proporcionar tu propia implementación de `getSourceUri` cuando:

- Tu servidor de streaming requiere parámetros de URL específicos
- Necesitas manipular dinámicamente las URLs de los manifiestos
- Tienes lógica personalizada para manejar ventanas DVR o timestamps de inicio
- Requieres añadir tokens de seguridad o parámetros de autenticación

### Ejemplo de implementación personalizada

```javascript
const customGetSourceUri = (manifest, dvrWindowMinutes, liveStartProgramTimestamp) => {
  let uri = manifest.manifestURL;
  
  // Añadir un token de seguridad
  uri += (uri.includes('?') ? '&' : '?') + 'token=mi-token-seguro';
  
  // Lógica personalizada para DVR
  if (dvrWindowMinutes && dvrWindowMinutes > 0) {
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (dvrWindowMinutes * 60);
    
    uri += `&dvr_start=${startTime}&dvr_end=${now}`;
  }
  
  return uri;
};

// Uso en el Player
<Player
  manifests={manifests}
  getSourceUri={customGetSourceUri}
  {...otrosProps}
/>
```

Este enfoque te permite mantener total control sobre la construcción de las URLs para tus manifiestos mientras sigues aprovechando todas las demás funcionalidades del Player.
