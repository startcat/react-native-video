# Analytics Plugins en Playlists - Guía de Uso

## ⚠️ Problema: Estado Congelado en Plugins

Cuando se usan plugins de analytics (ComScore, Adobe, etc.) en playlists, es **crítico** crear **nuevas instancias** para cada item. Reutilizar la misma instancia causa errores de estado congelado (frozen/immutable).

**Root Cause:** Los plugins como ComScore **NO tienen métodos `reset()` o `destroy()`**, por lo que su estado interno se congela y no puede reutilizarse entre diferentes items de la playlist.

### ❌ Incorrecto: Reutilizar instancia

```typescript
// ❌ MAL: Misma instancia para todos los items
const comscorePlugin = new ComscorePlugin(config);

const playlist: PlaylistItem[] = [
    {
        id: 'item-1',
        analytics: {
            analyticsConfig: [comscorePlugin]  // ❌ Misma instancia
        }
    },
    {
        id: 'item-2',
        analytics: {
            analyticsConfig: [comscorePlugin]  // ❌ Misma instancia = ERROR!
        }
    }
];
```

**Resultado:** Errores de frozen state:
```
ERROR: You attempted to set the key `currentState` with the value `"initialized"` 
on an object that is meant to be immutable and has been frozen.
```

### ✅ Correcto: Nueva instancia por item

```typescript
// ✅ BIEN: Nueva instancia para cada item
const playlist: PlaylistItem[] = [
    {
        id: 'item-1',
        analytics: {
            analyticsConfig: [
                new ComscorePlugin(config1)  // ✅ Nueva instancia
            ]
        }
    },
    {
        id: 'item-2',
        analytics: {
            analyticsConfig: [
                new ComscorePlugin(config2)  // ✅ Nueva instancia
            ]
        }
    }
];
```

## 🎯 Solución Recomendada: Factory Function en PlaylistItem

La forma **más práctica y segura** es crear nuevas instancias de plugins para cada item usando una factory function:

### Opción 1: Factory simple

```typescript
function createAnalyticsPlugins(item: PlaylistItem): PlayerAnalyticsPlugin[] {
    return [
        new ComscorePlugin({
            contentId: item.id,
            title: item.metadata?.title,
            // ... configuración específica del item
        })
    ];
}

const playlist: PlaylistItem[] = items.map(item => ({
    ...item,
    analytics: {
        analyticsConfig: createAnalyticsPlugins(item)
    }
}));
```

### Opción 2: Factory con configuración global

```typescript
interface AnalyticsConfig {
    comscorePublisherId: string;
    adobeTrackingServer: string;
    // ... otras configs globales
}

function createAnalyticsPlugins(
    item: PlaylistItem, 
    globalConfig: AnalyticsConfig
): PlayerAnalyticsPlugin[] {
    const plugins: PlayerAnalyticsPlugin[] = [];
    
    // ComScore
    if (globalConfig.comscorePublisherId) {
        plugins.push(new ComscorePlugin({
            publisherId: globalConfig.comscorePublisherId,
            contentId: item.id,
            title: item.metadata?.title,
            duration: item.duration,
            // ... más configuración
        }));
    }
    
    // Adobe Analytics
    if (globalConfig.adobeTrackingServer) {
        plugins.push(new AdobePlugin({
            trackingServer: globalConfig.adobeTrackingServer,
            contentId: item.id,
            // ... más configuración
        }));
    }
    
    return plugins;
}

// Uso:
const globalConfig: AnalyticsConfig = {
    comscorePublisherId: 'your-publisher-id',
    adobeTrackingServer: 'your-tracking-server'
};

const playlist: PlaylistItem[] = items.map(item => ({
    ...item,
    analytics: {
        analyticsConfig: createAnalyticsPlugins(item, globalConfig)
    }
}));
```

### Opción 3: Factory con tipos específicos

```typescript
type ContentType = 'VOD' | 'LIVE' | 'TUDUM';

function createAnalyticsPlugins(
    item: PlaylistItem,
    contentType: ContentType
): PlayerAnalyticsPlugin[] {
    const baseConfig = {
        contentId: item.id,
        title: item.metadata?.title,
        duration: item.duration
    };
    
    // Configuración específica por tipo
    switch (contentType) {
        case 'TUDUM':
            return [
                new ComscorePlugin({
                    ...baseConfig,
                    contentType: 'advertisement',
                    // ... config específica de TUDUM
                })
            ];
            
        case 'LIVE':
            return [
                new ComscorePlugin({
                    ...baseConfig,
                    contentType: 'live',
                    isLive: true,
                    // ... config específica de LIVE
                })
            ];
            
        case 'VOD':
        default:
            return [
                new ComscorePlugin({
                    ...baseConfig,
                    contentType: 'video',
                    // ... config específica de VOD
                })
            ];
    }
}
```

## 🔍 Detección de Problemas

El sistema detecta automáticamente cuando se reutilizan plugins y muestra un warning:

```
WARN  [useVideoAnalytics] ⚠️ Content changed (item-1 → item-2) but plugins may be reused.
This can cause frozen state errors. Ensure each playlist item has NEW plugin instances.
Plugins: ComscorePlugin
```

Si ves este warning, **debes crear nuevas instancias** de plugins para cada item.

## 🛠️ Solución para Código Existente

Si ya tienes código que reutiliza plugins, puedes refactorizarlo así:

### Antes:
```typescript
const comscorePlugin = createComscorePlugin(globalConfig);

// Agregar a todos los items
items.forEach(item => {
    item.analytics = {
        analyticsConfig: [comscorePlugin]  // ❌ Reutilizado
    };
});
```

### Después:
```typescript
// Crear función factory
const createPlugins = (item) => [
    createComscorePlugin({
        ...globalConfig,
        contentId: item.id,
        title: item.metadata?.title
    })
];

// Aplicar a cada item
items.forEach(item => {
    item.analytics = {
        analyticsConfig: createPlugins(item)  // ✅ Nueva instancia
    };
});
```

## 📚 Ejemplo Completo

```typescript
import { PlaylistItem, PlayerAnalyticsPlugin } from 'react-native-video';
import { ComscorePlugin } from '@your-company/comscore-plugin';

// 1. Definir configuración global
const ANALYTICS_CONFIG = {
    comscorePublisherId: 'your-publisher-id',
    comscoreAppName: 'YourApp',
    comscoreAppVersion: '1.0.0'
};

// 2. Crear factory function
function createAnalyticsPlugins(item: PlaylistItem): PlayerAnalyticsPlugin[] {
    return [
        new ComscorePlugin({
            publisherId: ANALYTICS_CONFIG.comscorePublisherId,
            applicationName: ANALYTICS_CONFIG.comscoreAppName,
            applicationVersion: ANALYTICS_CONFIG.comscoreAppVersion,
            
            // Datos específicos del contenido
            contentId: item.id,
            contentTitle: item.metadata?.title || 'Unknown',
            contentDuration: item.duration || 0,
            contentType: item.type === 'TUDUM' ? 'advertisement' : 'video',
            
            // Metadata adicional
            customLabels: {
                category: item.metadata?.category,
                language: item.metadata?.language,
                // ... más metadata
            }
        })
    ];
}

// 3. Crear playlist con plugins únicos
const createPlaylist = (items: any[]): PlaylistItem[] => {
    return items.map(item => ({
        id: item.id,
        type: item.type,
        resolvedSources: item.resolvedSources,
        metadata: item.metadata,
        
        // ✅ Nueva instancia de plugins para cada item
        analytics: {
            analyticsConfig: createAnalyticsPlugins(item)
        }
    }));
};

// 4. Uso
const rawItems = fetchContentItems();
const playlist = createPlaylist(rawItems);

// 5. Pasar al Player
<Player
    playlist={playlist}
    playlistConfig={{
        autoNext: true,
        repeatMode: PlaylistRepeatMode.OFF
    }}
    // ... otras props
/>
```

## ⚡ Resumen

- ✅ **Siempre** crear nuevas instancias de plugins para cada item
- ✅ Usar factory functions para mantener el código DRY
- ✅ Configuración global + datos específicos del item
- ❌ **Nunca** reutilizar la misma instancia de plugin
- ❌ **Nunca** ignorar el warning de reutilización

Siguiendo estas prácticas, evitarás errores de frozen state y tendrás analytics funcionando correctamente en toda tu playlist.
