# Integración con Youbora

Este documento explica cómo configurar y utilizar la integración con Youbora para analíticas de video en el componente Player.

## ¿Qué es Youbora?

Youbora es una plataforma de analíticas especializada en contenido multimedia que proporciona métricas detalladas sobre la reproducción de video, incluyendo:

- **Métricas de reproducción**: Tiempo de visualización, rebuffering, calidad de video
- **Análisis de audiencia**: Comportamiento del usuario, engagement, abandono
- **Rendimiento técnico**: Latencia, errores de reproducción, dispositivos
- **Datos de contenido**: Popularidad, consumo por episodios/temporadas

## Configuración básica

### 1. Activar Youbora en el Player

Para habilitar Youbora, pasa la configuración a través de la prop `youbora`:

```javascript
import { Player } from 'react-native-video';

const MyPlayer = () => {
  const youboraConfig = {
    accountCode: 'tu-codigo-de-cuenta-youbora',
    username: 'usuario-opcional',
    content: {
      id: 'video-123',
      title: 'Mi Video',
      type: 'video',
      isLive: false,
      // ... más campos de contenido
    },
    offline: false,
    userObfuscateIp: true
  };

  return (
    <Player
      youbora={youboraConfig}
      // ... otras props
    />
  );
};
```

### 2. Función de mapeo personalizada

Opcionalmente, puedes proporcionar una función para personalizar cómo se mapean los datos de Youbora:

```javascript
const getYouboraOptions = (data, format) => {
  // Personalizar el mapeo de datos según el formato (mobile/cast)
  return {
    'content.id': data.content?.id,
    'content.title': data.content?.title,
    'user.name': data.username,
    // ... mapeo personalizado
  };
};

<Player
  youbora={youboraConfig}
  getYouboraOptions={getYouboraOptions}
  // ... otras props
/>
```

## Configuración de datos IYoubora

### Campos principales

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `accountCode` | string | ✅ | Código de cuenta de Youbora proporcionado por el servicio |
| `username` | string | ❌ | Identificador del usuario para segmentación de audiencia |
| `content` | YouboraContent | ❌ | Metadatos del contenido multimedia |
| `offline` | boolean | ❌ | Indica si la reproducción es offline (por defecto: false) |
| `userObfuscateIp` | boolean | ❌ | Ofuscar la IP del usuario por privacidad (por defecto: false) |

### Configuración de contenido (YouboraContent)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `transactionCode` | string | Código único de transacción para la sesión | `"txn_abc123"` |
| `id` | string | Identificador único del contenido | `"video_12345"` |
| `type` | string | Tipo de contenido | `"video"`, `"audio"`, `"live"` |
| `title` | string | Título del contenido | `"Episodio 1: El Comienzo"` |
| `program` | string | Nombre del programa o serie | `"Mi Serie Favorita"` |
| `isLive` | boolean | Indica si es contenido en directo | `true` / `false` |
| `playbackType` | string | Tipo de reproducción | `"vod"`, `"live"`, `"dvr"` |
| `tvShow` | string | Nombre del programa de TV | `"Game of Thrones"` |
| `season` | string | Temporada del contenido | `"Temporada 1"` |
| `episodeTitle` | string | Título específico del episodio | `"Winter is Coming"` |
| `channel` | string | Canal o plataforma de distribución | `"HBO"`, `"Netflix"` |
| `customDimension` | YouboraCustomDimensions | Dimensiones personalizadas para análisis | Ver tabla siguiente |

### Dimensiones personalizadas (YouboraCustomDimensions)

Youbora permite hasta 10 dimensiones personalizadas para análisis específicos:

| Campo | Tipo | Descripción | Ejemplo de uso |
|-------|------|-------------|----------------|
| `1` | string | Dimensión personalizada 1 | Género del contenido: `"Drama"` |
| `2` | string | Dimensión personalizada 2 | Idioma: `"Español"` |
| `3` | string | Dimensión personalizada 3 | Región: `"Europa"` |
| `4` | string | Dimensión personalizada 4 | Tipo de suscripción: `"Premium"` |
| `5` | string | Dimensión personalizada 5 | Dispositivo: `"Mobile"` |
| `6` | string | Dimensión personalizada 6 | Calidad: `"HD"` |
| `7` | string | Dimensión personalizada 7 | Proveedor CDN: `"Cloudflare"` |
| `8` | string | Dimensión personalizada 8 | Campaña: `"Summer2024"` |
| `9` | string | Dimensión personalizada 9 | Segmento de usuario: `"VIP"` |
| `10` | string | Dimensión personalizada 10 | Contexto: `"Recomendado"` |

## Función getYouboraOptions

### Descripción

La función `getYouboraOptions` permite personalizar cómo se mapean y transforman los datos de Youbora antes de enviarlos al servicio de analíticas.

### Argumentos

| Argumento | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `data` | IYoubora | ✅ | Objeto con la configuración de Youbora pasada al Player |
| `format` | IYouboraSettingsFormat | ❌ | Formato de configuración: `'mobile'` o `'cast'` |

### Valor de retorno

| Tipo | Descripción |
|------|-------------|
| `IMappedYoubora` | Objeto con pares clave-valor donde las claves son strings y los valores son string o number |

### Formatos disponibles

| Formato | Valor | Descripción |
|---------|-------|-------------|
| Mobile | `'mobile'` | Configuración para reproducción en dispositivo móvil |
| Cast | `'cast'` | Configuración para reproducción via Chromecast/AirPlay |

## Mapeo de datos del proyecto

### Transformación de datos de la API

En un proyecto real, los datos provienen de tu API con una estructura específica que debe transformarse al formato que espera Youbora. El siguiente ejemplo muestra cómo mapear datos de contenido de una API a la configuración de Youbora:

```javascript
// Función para convertir cualquier tipo a string (Youbora espera strings)
const paramToString = (param) => {
  return param ? param.toString() : "";
};

// Mapeo de datos de la API al formato Youbora
export const mapYouboraOptions = (data, offline = false) => {
  // Obtener configuración desde el estado global
  const youbora_account_code = getYouboraAccountCode();
  const youbora_transaction_code = getYouboraTransactionCode();
  
  // Dimensiones personalizadas base
  let customDimensions = {
    2: getAnalyticsSessionId(),     // ID de sesión de analíticas
    3: paramToString(data?.id),     // ID interno del contenido
  };

  // Configuración base del contenido
  let content = {
    transactionCode: youbora_transaction_code,
    id: paramToString(data?.external_id),
    title: paramToString(data?.title),
    type: paramToString(data?.mediaType),
    customDimension: customDimensions,
  };

  // Mapeo específico para contenido de series/películas
  if (data?.collection === "media") {
    content = {
      ...content,
      type: data?.season_data ? "series" : "movie",
      program: paramToString(data?.season_data?.series_title),
      isLive: data?.type === "live",
      playbackType: data?.type === "live" ? "live" : "vod",
      tvShow: paramToString(data?.season_data?.series_title),
      season: paramToString(data?.season_data?.season_number),
      episodeTitle: data?.season_data ? paramToString(data?.title) : undefined,
      customDimension: {
        ...customDimensions,
        4: paramToString(data?.season_data?.series_id),
      },
    };
  }

  // Mapeo específico para streams en vivo
  if (data?.collection === "stream") {
    content = {
      ...content,
      isLive: true,
      channel: paramToString(data?.title),
      playbackType: "live",
    };
  }

  const userOid = getUserOid();

  return {
    accountCode: youbora_account_code,
    username: paramToString(userOid),
    userId: paramToString(userOid),
    offline: !!offline,
    content: content,
  };
};
```

### Diferencias entre modo Mobile y Cast

Los adaptadores de Youbora esperan formatos ligeramente diferentes según la plataforma de reproducción. La función `getYouboraOptions` transforma los datos según el formato especificado:

#### Modo Mobile (Reproducción nativa en la app)

```javascript
// Formato para reproducción nativa (iOS/Android)
if (format === "mobile") {
  return {
    accountCode: data?.accountCode,
    username: data?.username,
    userId: data?.userId,
    
    // Campos de contenido con nombres directos
    contentTransactionCode: data?.content?.transactionCode,
    contentId: data?.content?.id,
    contentType: data?.content?.type,
    contentTitle: data?.content?.title,
    program: data?.content?.program,
    contentIsLive: data?.content?.isLive,
    contentPlaybackType: data?.content?.playbackType,
    contentTvShow: data?.content?.tvShow,
    contentSeason: data?.content?.season,
    contentEpisodeTitle: data?.content?.episodeTitle,
    contentChannel: data?.content?.channel,
    
    // Dimensiones personalizadas como extraparamX
    extraparam1: "app",  // Identificador de plataforma
    extraparam2: data?.content?.customDimension?.[2],
    extraparam3: data?.content?.customDimension?.[3],
    extraparam4: data?.content?.customDimension?.[4],
    // ... hasta extraparam10
  };
}
```

#### Modo Cast (Reproducción en Chromecast/AirPlay)

```javascript
// Formato para reproducción en Cast (usa definición web)
if (format === "cast") {
  return {
    accountCode: data?.accountCode,
    username: data?.username,
    userId: data?.userId,
    
    // Campos de contenido con notación de punto
    "content.transactionCode": data?.content?.transactionCode,
    "content.id": data?.content?.id,
    "content.type": data?.content?.type,
    "content.title": data?.content?.title,
    "content.program": data?.content?.program,
    "content.isLive": data?.content?.isLive,
    "content.playbackType": data?.content?.playbackType,
    "content.tvShow": data?.content?.tvShow,
    "content.season": data?.content?.season,
    "content.episodeTitle": data?.content?.episodeTitle,
    "content.channel": data?.content?.channel,
    
    // Dimensiones personalizadas con notación de punto
    "content.customDimension.1": "cast",  // Identificador de plataforma
    "content.customDimension.2": data?.content?.customDimension?.[2],
    "content.customDimension.3": data?.content?.customDimension?.[3],
    "content.customDimension.4": data?.content?.customDimension?.[4],
    // ... hasta content.customDimension.10
  };
}
```

### Principales diferencias entre formatos

| Aspecto | Mobile | Cast |
|---------|--------|------|
| **Estructura de campos** | Nombres directos (`contentId`, `contentTitle`) | Notación de punto (`"content.id"`, `"content.title"`) |
| **Dimensiones personalizadas** | `extraparam1` a `extraparam10` | `"content.customDimension.1"` a `"content.customDimension.10"` |
| **Identificador de plataforma** | `extraparam1: "app"` | `"content.customDimension.1": "cast"` |
| **Adaptador utilizado** | SDK nativo (iOS/Android) | SDK web (JavaScript) |
| **Contexto de reproducción** | Reproductor nativo de la app | Chromecast/AirPlay receiver |

### Ejemplo de implementación completa

```javascript
// Configuración del Player con mapeo personalizado
const MyPlayer = ({ contentData, isOffline }) => {
  // 1. Mapear datos de la API al formato Youbora
  const youboraConfig = mapYouboraOptions(contentData, isOffline);
  
  // 2. Función de transformación según el formato
  const getYouboraOptions = (data, format) => {
    if (!data?.accountCode || !data?.content?.transactionCode) {
      console.warn('Invalid Youbora configuration');
      return {};
    }

    const _format = format || "mobile";
    
    if (_format === "mobile") {
      return {
        accountCode: data.accountCode,
        username: data.username,
        userId: data.userId,
        contentTransactionCode: data.content.transactionCode,
        contentId: data.content.id,
        contentType: data.content.type,
        contentTitle: data.content.title,
        contentIsLive: data.content.isLive,
        extraparam1: "app",
        extraparam2: data.content.customDimension?.[2],
        extraparam3: data.content.customDimension?.[3],
        // ... más campos
      };
    } else if (_format === "cast") {
      return {
        accountCode: data.accountCode,
        username: data.username,
        userId: data.userId,
        "content.transactionCode": data.content.transactionCode,
        "content.id": data.content.id,
        "content.type": data.content.type,
        "content.title": data.content.title,
        "content.isLive": data.content.isLive,
        "content.customDimension.1": "cast",
        "content.customDimension.2": data.content.customDimension?.[2],
        "content.customDimension.3": data.content.customDimension?.[3],
        // ... más campos
      };
    }
    
    return {};
  };

  return (
    <Player
      youbora={youboraConfig}
      getYouboraOptions={getYouboraOptions}
      // ... otras props
    />
  );
};
```

### Consideraciones importantes

1. **Conversión de tipos**: Youbora espera principalmente strings, por lo que es importante convertir números y otros tipos usando `paramToString()`.

2. **Validación**: Siempre validar que `accountCode` y `transactionCode` estén presentes antes de configurar Youbora.

3. **Logging**: Incluir logs para debug durante desarrollo para verificar que el mapeo sea correcto.

4. **Identificadores únicos**: Usar `transactionCode` único por sesión para evitar conflictos en las métricas.

5. **Dimensiones personalizadas**: Aprovechar las 10 dimensiones disponibles para análisis específicos del negocio (plataforma, región, tipo de usuario, etc.).

## Ejemplos de implementación

### Configuración básica

```javascript
const youboraConfig = {
  accountCode: 'mi-cuenta-youbora',
  username: 'usuario123',
  content: {
    id: 'serie-123-ep-01',
    title: 'El Primer Episodio',
    program: 'Mi Serie Original',
    type: 'video',
    isLive: false,
    playbackType: 'vod',
    tvShow: 'Mi Serie Original',
    season: 'Temporada 1',
    episodeTitle: 'El Primer Episodio',
    channel: 'Mi Plataforma',
    customDimension: {
      1: 'Drama',
      2: 'Español',
      3: 'España',
      4: 'Premium',
      5: 'Mobile'
    }
  },
  offline: false,
  userObfuscateIp: true
};
```

### Configuración para contenido en directo

```javascript
const liveYouboraConfig = {
  accountCode: 'mi-cuenta-youbora',
  username: 'usuario123',
  content: {
    id: 'live-stream-001',
    title: 'Transmisión en Vivo',
    type: 'live',
    isLive: true,
    playbackType: 'live',
    channel: 'Canal Principal',
    customDimension: {
      1: 'Deportes',
      2: 'Español',
      3: 'En Vivo',
      4: 'Gratuito'
    }
  },
  offline: false
};
```

### Función de mapeo personalizada

```javascript
const getYouboraOptions = (data, format) => {
  const baseMapping = {
    'accountCode': data.accountCode,
    'username': data.username || 'anonymous',
    'content.id': data.content?.id,
    'content.title': data.content?.title,
    'content.duration': data.content?.duration || 0,
    'content.isLive': data.content?.isLive ? 'true' : 'false',
    'content.genre': data.content?.customDimension?.[1],
    'content.language': data.content?.customDimension?.[2],
    'user.obfuscateIp': data.userObfuscateIp ? 'true' : 'false'
  };

  // Configuración específica según formato
  if (format === 'cast') {
    return {
      ...baseMapping,
      'device.type': 'cast',
      'player.name': 'chromecast-player'
    };
  }

  // Configuración para mobile (por defecto)
  return {
    ...baseMapping,
    'device.type': 'mobile',
    'player.name': 'react-native-player'
  };
};
```

### Configuración con análisis avanzado

```javascript
const advancedYouboraConfig = {
  accountCode: 'mi-cuenta-youbora',
  username: getUserId(), // Función que obtiene ID del usuario
  content: {
    transactionCode: generateTransactionId(), // Generar ID único
    id: content.id,
    title: content.title,
    program: content.series?.name,
    type: content.type,
    isLive: content.isLive,
    playbackType: content.isLive ? 'live' : 'vod',
    tvShow: content.series?.name,
    season: content.season?.name,
    episodeTitle: content.title,
    channel: content.channel?.name,
    customDimension: {
      1: content.genre,
      2: content.language,
      3: getUserRegion(),
      4: getUserSubscriptionType(),
      5: getDeviceType(),
      6: content.quality,
      7: getCDNProvider(),
      8: getCurrentCampaign(),
      9: getUserSegment(),
      10: getRecommendationContext()
    }
  },
  offline: !isOnline(),
  userObfuscateIp: shouldObfuscateIP()
};
```

## Integración con eventos del Player

Youbora se integra automáticamente con los eventos del Player para capturar métricas:

### Eventos capturados automáticamente

- **onPlay**: Inicio de reproducción
- **onPause**: Pausa de reproducción
- **onSeek**: Búsqueda en el contenido
- **onEnd**: Finalización de reproducción
- **onError**: Errores de reproducción
- **onProgress**: Progreso de reproducción
- **onBuffering**: Eventos de buffering

### Métricas recopiladas

- **Tiempo de visualización**: Duración total vista
- **Tasa de abandono**: Porcentaje de usuarios que abandonan
- **Calidad de reproducción**: Resolución y bitrate
- **Errores**: Tipos y frecuencia de errores
- **Rendimiento**: Tiempo de inicio, rebuffering
- **Dispositivo**: Información del dispositivo y navegador

## Consideraciones de privacidad

### Ofuscación de IP

```javascript
const youboraConfig = {
  // ... otras configuraciones
  userObfuscateIp: true // Ofuscar IP para cumplir GDPR
};
```

### Datos de usuario

- **Minimizar datos personales**: Solo incluir datos necesarios para análisis
- **Anonimización**: Usar IDs anónimos cuando sea posible
- **Consentimiento**: Asegurar consentimiento del usuario para analíticas

## Troubleshooting

### Problemas comunes

**1. Datos no aparecen en Youbora**
- Verificar que `accountCode` sea correcto
- Comprobar conectividad de red
- Revisar configuración de firewall/proxy

**2. Métricas incorrectas**
- Validar formato de datos en `content`
- Verificar que `isLive` coincida con el tipo de contenido
- Comprobar función `getYouboraOptions` si se usa

**3. Errores de configuración**
- Verificar tipos de datos (string, boolean, number)
- Asegurar que campos obligatorios estén presentes
- Revisar formato de `customDimension`

### Debug

```javascript
// Habilitar logs de debug (solo desarrollo)
const getYouboraOptions = (data, format) => {
  console.log('Youbora data:', data);
  console.log('Youbora format:', format);
  
  const mapped = {
    // ... mapeo
  };
  
  console.log('Mapped Youbora options:', mapped);
  return mapped;
};
```

## Mejores prácticas

### 1. Configuración de contenido

- **IDs únicos**: Usar identificadores únicos y consistentes
- **Metadatos completos**: Proporcionar toda la información disponible
- **Dimensiones personalizadas**: Usar para análisis específicos del negocio

### 2. Rendimiento

- **Datos mínimos**: Solo incluir datos necesarios
- **Caché**: Cachear configuraciones que no cambian
- **Lazy loading**: Cargar configuración solo cuando sea necesario

### 3. Mantenimiento

- **Versionado**: Mantener consistencia en estructura de datos
- **Documentación**: Documentar dimensiones personalizadas
- **Monitoreo**: Verificar regularmente que los datos lleguen correctamente

## Enlaces útiles

- [Documentación oficial de Youbora](https://youbora.nicepeopleatwork.com/)
- [API Reference de Youbora](https://youbora.nicepeopleatwork.com/docs/)
- [Guía de implementación](https://youbora.nicepeopleatwork.com/implementation-guide/)