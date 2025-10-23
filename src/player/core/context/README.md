# Context System - Sistema de Contexto del Player

Sistema centralizado para compartir servicios, configuración y estado entre componentes del reproductor.

## 📚 Documentación

- **[ContextSystem.md](./instructions/ContextSystem.md)** - Diseño, arquitectura y propuestas de extensión
- **[ContextUsage.md](./docs/ContextUsage.md)** - Guía de uso para desarrolladores

## 🚀 Inicio Rápido

### Uso Actual (Básico)

```typescript
import { PlayerContext } from '@/player/core/context';
import { Logger } from '@/player/features/logger';

// Crear contexto
const logger = new Logger({ level: 'debug' });
const context = new PlayerContext(logger);

// Obtener ID único
const instanceId = context.getInstanceId(); // 1, 2, 3...

// Usar logger
context.logger.info('Component', 'Action performed');
```

### Uso Propuesto (Extendido)

```typescript
import { PlayerContext } from '@/player/core/context';

// Crear contexto con servicios completos
const context = new PlayerContext({
  logger: new Logger({ level: 'debug' }),
  analytics: new AnalyticsManager(),
  instanceName: 'main-player',
  config: {
    'dvr-window-seconds': 3600,
    'buffer-ahead-seconds': 30,
  },
  features: {
    'dvr-anti-fluctuation': true,
    'cast-reconnection-fix': true,
  }
});

// Inyectar managers
context.setSourceManager(sourceManager);
context.setProgressManager(progressManager);

// Usar servicios
context.trackEvent('video_started', { contentId: 123 });
context.handleError(playerError);
```

## 🎯 Propósito

1. **Evitar prop drilling** - Servicios accesibles sin pasar props
2. **Identificación única** - Cada player tiene un ID único
3. **Servicios compartidos** - Logger, analytics, configuración
4. **Extensibilidad** - Fácil agregar nuevos servicios
5. **Testing** - Fácil mockear dependencias
6. **Lifecycle** - Gestión centralizada de cleanup

## 📦 Estructura Actual

```
context/
├── PlayerContext.tsx          # Clase principal (40 líneas)
├── types/
│   └── index.ts              # IPlayerInstanceContext
├── index.ts                  # Exports
├── instructions/             # ✅ Documentación de diseño
│   └── ContextSystem.md      # Arquitectura y propuestas
├── docs/                     # ✅ Guías de uso
│   └── ContextUsage.md       # Cómo usar el sistema
└── README.md                 # Este archivo
```

## ✨ Implementación Actual

```typescript
export class PlayerContext implements IPlayerInstanceContext {
  private static instanceCounter = 0;
  private instanceId: number;
  public readonly logger: Logger;
  
  constructor(logger: Logger) {
    this.instanceId = ++PlayerContext.instanceCounter;
    this.logger = logger;
    this.logger.setInstanceId(this.instanceId);
  }
  
  getInstanceId(): number {
    return this.instanceId;
  }
}
```

**Uso actual:**
- ✅ Identificación única de instancias
- ✅ Logger compartido
- ✅ Usado en AudioPlayer

## 💡 Propuestas de Extensión

### 1. Dependency Injection de Managers

```typescript
// Inyectar managers vía contexto
context.setSourceManager(sourceManager);
context.setProgressManager(progressManager);

// Obtener desde flavours
const sourceManager = context.getSourceManager();
```

### 2. Feature Flags

```typescript
// Configurar features
const context = new PlayerContext({
  logger,
  features: {
    'dvr-anti-fluctuation': true,
    'cast-reconnection-fix': true,
  }
});

// Usar en código
if (context.isFeatureEnabled('dvr-anti-fluctuation')) {
  // Nueva implementación
}
```

### 3. Configuración Centralizada

```typescript
// Configurar
const context = new PlayerContext({
  logger,
  config: {
    'dvr-window-seconds': 3600,
    'buffer-ahead-seconds': 30,
  }
});

// Usar
const dvrWindow = context.getConfig('dvr-window-seconds', 3600);
```

### 4. Estado Compartido

```typescript
// Guardar estado
context.setState('last-seek-time', 120);

// Leer estado
const lastSeek = context.getState<number>('last-seek-time');
```

### 5. Error Handling Centralizado

```typescript
// Manejar error
context.handleError(playerError);

// Automáticamente:
// - Logging
// - Analytics
// - Notificación a error handler
```

### 6. Analytics Tracking

```typescript
// Track eventos
context.trackEvent('video_started', {
  contentId: 123,
  quality: 'hd',
});

// Metadata automática: instanceId, timestamp
```

### 7. Lifecycle Management

```typescript
// Registrar cleanup
context.registerDisposable(() => subscription.remove());
context.registerDisposable(() => clearInterval(timer));

// Cleanup automático
context.dispose();
```

### 8. Performance Monitoring

```typescript
// Medir operaciones
const source = await context.measurePerformance(
  'load-source',
  () => sourceManager.loadSource(data)
);

// Automáticamente loggea y trackea duración
```

### 9. Multi-Instance Support

```typescript
// Registro global
PlayerContextRegistry.register(context);

// Obtener todas las instancias
const allPlayers = PlayerContextRegistry.getAll();
console.log(`Active players: ${allPlayers.length}`);
```

### 10. Debugging Helpers

```typescript
// Inspeccionar contexto
context.debug();

// Output: Config, Features, State, Managers
```

## 🎯 Beneficios de la Extensión

1. **Dependency Injection** - Managers inyectados, fácil testing
2. **Feature Flags** - A/B testing y rollout gradual
3. **Configuración Centralizada** - Un solo lugar para config
4. **Estado Compartido** - Sin prop drilling
5. **Error Handling** - Manejo consistente
6. **Analytics** - Tracking simplificado
7. **Lifecycle** - Cleanup automático
8. **Performance** - Monitoreo integrado
9. **Debugging** - Helpers de desarrollo
10. **Multi-Instance** - Soporte para múltiples players

## 📖 Ejemplos

### Ejemplo 1: Uso en Componente

```typescript
const AudioFlavour = ({ context }: { context: PlayerContext }) => {
  const logger = context.getLogger();
  
  useEffect(() => {
    logger.info('AudioFlavour', 'Mounted');
    return () => context.dispose();
  }, []);
  
  const handleLoad = () => {
    logger.info('AudioFlavour', 'Content loaded');
    context.trackEvent('content_loaded');
  };
};
```

### Ejemplo 2: Uso en Manager

```typescript
class SourceManager {
  constructor(private context: PlayerContext) {}
  
  async loadSource(data: SourceData): Promise<ProcessedSource> {
    const logger = this.context.getLogger();
    logger.info('SourceManager', 'Loading source');
    
    try {
      const source = await this.processSource(data);
      this.context.trackEvent('source_loaded', { id: data.id });
      return source;
    } catch (error) {
      this.context.handleError(error as PlayerError);
      throw error;
    }
  }
}
```

## 🔍 Ver Más

- [Documentación completa del sistema](./instructions/ContextSystem.md)
- [Guía de uso detallada](./docs/ContextUsage.md)
- [10 ideas de aprovechamiento](./instructions/ContextSystem.md#ideas-de-aprovechamiento)

---

**Estado**: ✅ Implementado (básico) | 📝 Propuestas de extensión  
**Versión**: 1.0 (actual) | 2.0 (propuesta)
