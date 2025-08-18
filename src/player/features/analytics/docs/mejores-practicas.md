# Mejores Prácticas y Configuración

## Configuración por Ambientes

### Variables de Entorno

```typescript
// .env.development
ANALYTICS_COMSCORE_C2=DEV_CLIENT_ID
ANALYTICS_ADOBE_SUITE=dev-suite
ANALYTICS_YOUBORA_ACCOUNT=dev-account
ANALYTICS_DEBUG=true

// .env.production  
ANALYTICS_COMSCORE_C2=PROD_CLIENT_ID
ANALYTICS_ADOBE_SUITE=prod-suite
ANALYTICS_YOUBORA_ACCOUNT=prod-account
ANALYTICS_DEBUG=false
```

### Configuración Condicional

```typescript
const getAnalyticsConfig = () => {
    const env = process.env.NODE_ENV;
    
    return {
        plugins: {
            comscore: {
                enabled: env !== 'test',
                config: {
                    c2: process.env.ANALYTICS_COMSCORE_C2,
                    debug: env === 'development'
                }
            },
            adobe: {
                enabled: env === 'production',
                config: {
                    reportSuite: process.env.ANALYTICS_ADOBE_SUITE
                }
            }
        },
        debug: env === 'development'
    };
};
```

## Performance y Optimización

### Lazy Loading de SDKs

```typescript
const createComscorePlugin = async (mediaData: any) => {
    // Cargar SDK solo cuando se necesite
    const { ComscoreStreamingTag } = await import('@comscore/streaming-tag');
    
    return {
        name: 'ComScore',
        onPlay: () => {
            // Usar SDK cargado
        }
    };
};
```

### Throttling de Eventos

```typescript
class PlayerAnalyticsEvents {
    private progressThrottle = throttle((params) => {
        this.executePluginMethod('onProgress', params);
    }, 1000); // Máximo 1 evento por segundo
    
    onProgress(params: ProgressParams): void {
        this.progressThrottle(params);
    }
}
```

### Manejo de Memoria

```typescript
export class ProjectAnalyticsFactory {
    private static pluginCache = new WeakMap();
    
    static createPlugins(mediaData: any, config: any) {
        // Reutilizar plugins cuando sea posible
        if (this.pluginCache.has(mediaData)) {
            return this.pluginCache.get(mediaData);
        }
        
        const plugins = this.createAllPlugins(mediaData, config);
        this.pluginCache.set(mediaData, plugins);
        return plugins;
    }
}
```

## Debugging y Monitoreo

### Logging Estructurado

```typescript
const logger = {
    debug: (plugin: string, event: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Analytics:${plugin}] ${event}`, data);
        }
    },
    
    error: (plugin: string, error: Error) => {
        console.error(`[Analytics:${plugin}] Error:`, error);
        // Enviar a servicio de monitoring en producción
    }
};
```

### Health Checks

```typescript
const healthCheck = {
    checkPlugins: (analytics: PlayerAnalyticsEvents) => {
        const report = analytics.getHealthReport();
        
        if (!report.isHealthy) {
            logger.error('System', new Error('Analytics system unhealthy'));
        }
        
        return report;
    }
};
```

## Seguridad y Privacidad

### Ofuscación de Datos Sensibles

```typescript
const sanitizeMediaData = (mediaData: any) => {
    return {
        ...mediaData,
        // Remover información sensible
        userId: undefined,
        email: undefined,
        personalData: undefined
    };
};
```

### Cumplimiento GDPR

```typescript
class GDPRCompliantFactory extends BaseAnalyticsPluginFactory {
    static createPlugins(mediaData: any, config: any, userConsent?: boolean) {
        if (!userConsent) {
            // Solo plugins que no requieren consentimiento
            return this.createMinimalPlugins(mediaData);
        }
        
        return super.createPlugins(mediaData, config);
    }
}
```

## Testing

### Unit Tests

```typescript
describe('ProjectAnalyticsFactory', () => {
    it('should create comscore plugin with valid data', () => {
        const mediaData = { id: '123', title: 'Test' };
        const plugin = ProjectAnalyticsFactory.createComscorePlugin(mediaData);
        
        expect(plugin).toBeTruthy();
        expect(plugin.name).toBe('ComScore');
    });
});
```

### Integration Tests

```typescript
describe('Analytics Integration', () => {
    it('should track complete playback session', async () => {
        const analytics = new PlayerAnalyticsEvents();
        const mockPlugin = createMockPlugin();
        
        analytics.addPlugin(mockPlugin);
        
        analytics.onPlay();
        analytics.onProgress({ position: 1000, duration: 10000 });
        analytics.onEnd();
        
        expect(mockPlugin.onPlay).toHaveBeenCalled();
        expect(mockPlugin.onEnd).toHaveBeenCalled();
    });
});
```
