# Context Usage - Guía de Uso del Sistema de Contexto

## 📚 Introducción

Esta guía explica cómo usar el **PlayerContext** en tu código. El contexto proporciona acceso centralizado a servicios compartidos, configuración y estado del reproductor.

## 🚀 Inicio Rápido

### Uso Actual (Básico)

```typescript
import { PlayerContext } from '@/player/core/context';
import { Logger } from '@/player/features/logger';

// Crear logger
const logger = new Logger({ level: 'debug' });

// Crear contexto
const context = new PlayerContext(logger);

// Obtener ID de instancia
const instanceId = context.getInstanceId();

// Usar logger
context.logger.info('Component', 'Action performed');
```

### Uso Propuesto (Extendido)

```typescript
import { PlayerContext } from '@/player/core/context';

// Crear contexto con opciones completas
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
```

## 📖 Casos de Uso

### 1. Logging con Contexto

```typescript
// Crear contexto
const context = new PlayerContext({ logger });

// Logging básico
context.logger.info('AudioFlavour', 'Playback started');
context.logger.error('AudioFlavour', 'Failed to load', { uri });

// El logger automáticamente incluye el instanceId
// Output: [Instance #1] [AudioFlavour] Playback started
```

### 2. Identificación de Instancias

```typescript
// Útil cuando hay múltiples players en la app
const context1 = new PlayerContext({ logger, instanceName: 'main-player' });
const context2 = new PlayerContext({ logger, instanceName: 'pip-player' });

console.log(context1.getInstanceId()); // 1
console.log(context2.getInstanceId()); // 2

console.log(context1.getInstanceName()); // "main-player"
console.log(context2.getInstanceName()); // "pip-player"
```

### 3. Dependency Injection de Managers

```typescript
// En PlayerController
const context = new PlayerContext({ logger, analytics });

// Crear e inyectar managers
const sourceManager = new SourceManager(config);
const progressManager = new ProgressManagerUnified(config);

context.setSourceManager(sourceManager);
context.setProgressManager(progressManager);

// En Flavours
const AudioFlavour = ({ context }: { context: PlayerContext }) => {
  // Obtener managers del contexto
  const sourceManager = context.getSourceManager();
  const progressManager = context.getProgressManager();
  
  // Usar managers
  const loadContent = async () => {
    const source = await sourceManager.loadSource(data);
    progressManager.onContentLoaded({ duration: 0, isLive: false });
  };
};
```

### 4. Feature Flags

```typescript
// Configurar features
const context = new PlayerContext({
  logger,
  features: {
    'dvr-anti-fluctuation': true,
    'cast-reconnection-fix': true,
    'sleep-timer': true,
    'offline-downloads': false,
  }
});

// Usar en código
const handleDVRUpdate = (data: PlayerProgressData) => {
  if (context.isFeatureEnabled('dvr-anti-fluctuation')) {
    // Usar nueva lógica anti-fluctuación
    updateWithAntiFluctuation(data);
  } else {
    // Usar lógica legacy
    updateLegacy(data);
  }
};

// A/B Testing
const shouldUseCastFix = context.isFeatureEnabled('cast-reconnection-fix');
if (shouldUseCastFix) {
  applyCastReconnectionFix();
}
```

### 5. Configuración Centralizada

```typescript
// Configurar
const context = new PlayerContext({
  logger,
  config: {
    'dvr-window-seconds': 3600,
    'buffer-ahead-seconds': 30,
    'max-retry-attempts': 3,
    'analytics-batch-size': 10,
    'seek-tolerance-seconds': 2,
  }
});

// Usar configuración
const initializeDVR = () => {
  const dvrWindow = context.getConfig('dvr-window-seconds', 3600);
  const seekTolerance = context.getConfig('seek-tolerance-seconds', 2);
  
  dvrManager.initialize({
    windowSeconds: dvrWindow,
    seekTolerance: seekTolerance,
  });
};

// Override por instancia
const customContext = new PlayerContext({
  logger,
  config: {
    'dvr-window-seconds': 7200, // 2 horas en lugar de 1
  }
});
```

### 6. Estado Compartido

```typescript
// Componente A guarda estado
const ComponentA = ({ context }: { context: PlayerContext }) => {
  const handleSeek = (time: number) => {
    context.setState('last-seek-time', time);
    context.setState('last-seek-timestamp', Date.now());
  };
};

// Componente B lee estado
const ComponentB = ({ context }: { context: PlayerContext }) => {
  const getLastSeek = () => {
    const time = context.getState<number>('last-seek-time');
    const timestamp = context.getState<number>('last-seek-timestamp');
    
    if (time !== undefined && timestamp !== undefined) {
      console.log(`Last seek to ${time}s at ${new Date(timestamp)}`);
    }
  };
};

// Limpiar estado
context.clearState('last-seek-time');
```

### 7. Error Handling Centralizado

```typescript
// Configurar error handler
const errorHandler = {
  handle: (error: PlayerError) => {
    // Mostrar toast al usuario
    showErrorToast(error);
    
    // Reportar a servicio externo
    reportToSentry(error);
  }
};

const context = new PlayerContext({
  logger,
  analytics,
  errorHandler,
});

// Usar en código
const loadContent = async () => {
  try {
    await sourceManager.loadSource(data);
  } catch (error) {
    const playerError = error instanceof PlayerError 
      ? error 
      : new PlayerError('PLAYER_MEDIA_LOAD_FAILED', { originalError: error });
    
    // El contexto se encarga de:
    // - Logging
    // - Analytics
    // - Notificación al error handler
    context.handleError(playerError);
  }
};
```

### 8. Analytics Tracking

```typescript
// Configurar analytics
const context = new PlayerContext({
  logger,
  analytics: new AnalyticsManager({
    apiKey: 'xxx',
    batchSize: 10,
  })
});

// Track eventos
const handlePlaybackStarted = () => {
  context.trackEvent('video_started', {
    contentId: 123,
    contentType: 'vod',
    quality: 'hd',
  });
};

const handleSeek = (from: number, to: number) => {
  context.trackEvent('seek_performed', {
    from,
    to,
    delta: to - from,
  });
};

// El contexto automáticamente agrega:
// - instanceId
// - instanceName
// - timestamp
```

### 9. Lifecycle Management

```typescript
const AudioFlavour = ({ context }: { context: PlayerContext }) => {
  useEffect(() => {
    // Registrar subscripciones
    const subscription = eventEmitter.on('progress', handleProgress);
    context.registerDisposable(() => subscription.remove());
    
    // Registrar timers
    const timer = setInterval(pollStatus, 1000);
    context.registerDisposable(() => clearInterval(timer));
    
    // Registrar listeners
    const listener = DeviceEventEmitter.addListener('event', handler);
    context.registerDisposable(() => listener.remove());
    
    // Cleanup automático al desmontar
    return () => context.dispose();
  }, [context]);
};
```

### 10. Performance Monitoring

```typescript
// Medir operaciones
const loadSource = async () => {
  const source = await context.measurePerformance(
    'load-source',
    () => sourceManager.loadSource(data)
  );
  
  // Automáticamente loggea y trackea la duración
  return source;
};

// Medir operaciones síncronas
const calculateValues = () => {
  return context.measurePerformance(
    'calculate-slider-values',
    () => progressManager.getSliderValues()
  );
};

// Ver métricas
// Logger: [Performance] load-source { duration: 245.3 }
// Analytics: performance_metric { operation: 'load-source', duration: 245.3 }
```

## 🎯 Patrones Recomendados

### Patrón 1: Contexto en Componentes React

```typescript
interface PlayerComponentProps {
  context: PlayerContext;
  // ... otras props
}

const PlayerComponent: React.FC<PlayerComponentProps> = ({ context }) => {
  const logger = context.getLogger();
  
  useEffect(() => {
    logger.info('PlayerComponent', 'Mounted');
    
    return () => {
      logger.info('PlayerComponent', 'Unmounted');
    };
  }, [logger]);
  
  const handleAction = () => {
    logger.debug('PlayerComponent', 'Action triggered');
    context.trackEvent('action_triggered');
  };
  
  return <View>...</View>;
};
```

### Patrón 2: Contexto en Managers

```typescript
class SourceManager {
  constructor(
    private context: PlayerContext,
    private config: SourceManagerConfig
  ) {}
  
  async loadSource(data: SourceData): Promise<ProcessedSource> {
    const logger = this.context.getLogger();
    logger.info('SourceManager', 'Loading source', { id: data.id });
    
    try {
      const source = await this.context.measurePerformance(
        'source-load',
        () => this.processSource(data)
      );
      
      this.context.trackEvent('source_loaded', {
        sourceId: data.id,
        type: source.type,
      });
      
      return source;
      
    } catch (error) {
      const playerError = new PlayerError('PLAYER_SOURCE_LOAD_FAILED', {
        sourceData: data,
        originalError: error
      });
      
      this.context.handleError(playerError);
      throw playerError;
    }
  }
}
```

### Patrón 3: Feature Flag con Fallback

```typescript
const handleOperation = () => {
  const useNewImplementation = context.isFeatureEnabled('new-feature');
  
  if (useNewImplementation) {
    try {
      return newImplementation();
    } catch (error) {
      context.logger.warn('Feature', 'New implementation failed, falling back', {
        error
      });
      return legacyImplementation();
    }
  }
  
  return legacyImplementation();
};
```

### Patrón 4: Configuración con Validación

```typescript
const initializePlayer = () => {
  const dvrWindow = context.getConfig('dvr-window-seconds', 3600);
  const bufferAhead = context.getConfig('buffer-ahead-seconds', 30);
  
  // Validar configuración
  if (dvrWindow < 0 || dvrWindow > 7200) {
    context.logger.warn('Config', 'Invalid DVR window, using default', {
      provided: dvrWindow,
      default: 3600
    });
    dvrWindow = 3600;
  }
  
  // Usar configuración validada
  player.configure({ dvrWindow, bufferAhead });
};
```

### Patrón 5: Estado Compartido con Tipos

```typescript
// Definir tipos de estado
interface SharedState {
  'last-seek-time': number;
  'playback-quality': 'sd' | 'hd' | '4k';
  'is-buffering': boolean;
  'current-program': EPGProgram | null;
}

// Helper tipado
function getTypedState<K extends keyof SharedState>(
  context: PlayerContext,
  key: K
): SharedState[K] | undefined {
  return context.getState<SharedState[K]>(key);
}

function setTypedState<K extends keyof SharedState>(
  context: PlayerContext,
  key: K,
  value: SharedState[K]
): void {
  context.setState(key, value);
}

// Uso
setTypedState(context, 'playback-quality', 'hd');
const quality = getTypedState(context, 'playback-quality'); // 'sd' | 'hd' | '4k' | undefined
```

## 🔍 Debugging

### Inspeccionar Contexto

```typescript
// En desarrollo
if (__DEV__) {
  context.debug();
}

// Output:
// PlayerContext #1
//   Instance Name: main-player
//   Config: { dvr-window-seconds: 3600, ... }
//   Features: { dvr-anti-fluctuation: true, ... }
//   Shared State: { last-seek-time: 120, ... }
//   Managers: { source: true, progress: true, playback: true }
```

### Logging Estructurado

```typescript
const logger = context.getLogger();

// Diferentes niveles
logger.debug('Component', 'Debug info', { data });
logger.info('Component', 'Info message', { data });
logger.warn('Component', 'Warning', { data });
logger.error('Component', 'Error occurred', { error });

// Con contexto rico
logger.info('AudioFlavour', 'Playback started', {
  contentId: 123,
  contentType: 'vod',
  startPosition: 0,
  instanceId: context.getInstanceId(),
  instanceName: context.getInstanceName(),
});
```

### Tracking de Eventos

```typescript
// Track con metadata automática
context.trackEvent('video_started', {
  contentId: 123,
  quality: 'hd',
});

// El contexto agrega automáticamente:
// {
//   contentId: 123,
//   quality: 'hd',
//   instanceId: 1,
//   instanceName: 'main-player',
//   timestamp: 1706012345678
// }
```

## 📊 Multi-Instance Support

### Registro de Instancias

```typescript
import { PlayerContextRegistry } from '@/player/core/context';

// Crear y registrar
const context = new PlayerContext({ logger, instanceName: 'main' });
PlayerContextRegistry.register(context);

// Obtener instancia específica
const mainPlayer = PlayerContextRegistry.get(1);

// Obtener todas las instancias
const allPlayers = PlayerContextRegistry.getAll();
console.log(`Active players: ${allPlayers.length}`);

// Cleanup
PlayerContextRegistry.unregister(context.getInstanceId());
```

### Debugging Global

```typescript
// Ver todas las instancias activas
const debugAllPlayers = () => {
  const players = PlayerContextRegistry.getAll();
  
  console.group('Active Players');
  players.forEach(context => {
    console.log(`#${context.getInstanceId()}: ${context.getInstanceName()}`);
  });
  console.groupEnd();
};

// Disponer todas las instancias
const disposeAllPlayers = () => {
  const players = PlayerContextRegistry.getAll();
  players.forEach(context => context.dispose());
};
```

## ✅ Checklist de Buenas Prácticas

- [ ] Crear contexto al inicio del player
- [ ] Pasar contexto a componentes que lo necesiten
- [ ] Usar logger del contexto en lugar de console.log
- [ ] Registrar disposables para cleanup
- [ ] Disponer contexto al destruir el player
- [ ] Usar feature flags para nuevas funcionalidades
- [ ] Centralizar configuración en el contexto
- [ ] Trackear eventos importantes
- [ ] Manejar errores vía context.handleError()
- [ ] Usar estado compartido para evitar prop drilling

## 🚫 Anti-Patrones a Evitar

### ❌ Mutar Servicios del Contexto

```typescript
// MAL
context.logger = newLogger;

// BIEN
// Los servicios son readonly, crear nuevo contexto si es necesario
```

### ❌ Crear Múltiples Contextos para la Misma Instancia

```typescript
// MAL
const context1 = new PlayerContext({ logger });
const context2 = new PlayerContext({ logger });

// BIEN
const context = new PlayerContext({ logger });
// Reusar el mismo contexto
```

### ❌ No Disponer el Contexto

```typescript
// MAL
const context = new PlayerContext({ logger });
// Sin cleanup

// BIEN
useEffect(() => {
  const context = new PlayerContext({ logger });
  return () => context.dispose();
}, []);
```

### ❌ Almacenar Estado Mutable Directamente

```typescript
// MAL
context.currentTime = 120;

// BIEN
context.setState('current-time', 120);
```

### ❌ No Usar Feature Flags para Código Experimental

```typescript
// MAL
// Código nuevo directamente en producción
const result = newExperimentalFeature();

// BIEN
const result = context.isFeatureEnabled('experimental-feature')
  ? newExperimentalFeature()
  : stableFeature();
```

## 📚 Ejemplos Completos

### Ejemplo 1: AudioFlavour con Contexto

```typescript
interface AudioFlavourProps {
  context: PlayerContext;
  source: ProcessedSource;
}

const AudioFlavour: React.FC<AudioFlavourProps> = ({ context, source }) => {
  const logger = context.getLogger();
  const videoRef = useRef<Video>(null);
  
  useEffect(() => {
    logger.info('AudioFlavour', 'Mounted', {
      sourceId: source.id,
      instanceId: context.getInstanceId(),
    });
    
    // Registrar cleanup
    context.registerDisposable(() => {
      logger.info('AudioFlavour', 'Cleanup');
    });
    
    return () => context.dispose();
  }, []);
  
  const handleLoad = useCallback(() => {
    logger.info('AudioFlavour', 'Content loaded');
    context.trackEvent('content_loaded', {
      sourceId: source.id,
      type: source.type,
    });
  }, [logger, context, source]);
  
  const handleError = useCallback((error: OnVideoErrorData) => {
    const playerError = mapNativeErrorToPlayerError(error);
    context.handleError(playerError);
  }, [context]);
  
  return (
    <Video
      ref={videoRef}
      source={{ uri: source.uri }}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};
```

### Ejemplo 2: PlayerController con Contexto Extendido

```typescript
class PlayerController {
  private context: PlayerContext;
  private sourceManager: SourceManager;
  private progressManager: ProgressManagerUnified;
  
  constructor(options: PlayerControllerOptions) {
    // Crear contexto
    this.context = new PlayerContext({
      logger: new Logger({ level: options.logLevel }),
      analytics: new AnalyticsManager(options.analytics),
      instanceName: options.instanceName,
      config: options.config,
      features: options.features,
    });
    
    // Crear managers
    this.sourceManager = new SourceManager(this.context, options.source);
    this.progressManager = new ProgressManagerUnified(this.context, options.progress);
    
    // Inyectar managers en contexto
    this.context.setSourceManager(this.sourceManager);
    this.context.setProgressManager(this.progressManager);
    
    // Registrar en registry
    PlayerContextRegistry.register(this.context);
  }
  
  async loadContent(data: SourceData): Promise<void> {
    try {
      const source = await this.context.measurePerformance(
        'load-content',
        () => this.sourceManager.loadSource(data)
      );
      
      this.context.trackEvent('content_load_started', {
        sourceId: data.id,
      });
      
      // ... continuar con carga
      
    } catch (error) {
      this.context.handleError(error as PlayerError);
      throw error;
    }
  }
  
  dispose(): void {
    PlayerContextRegistry.unregister(this.context.getInstanceId());
    this.context.dispose();
  }
}
```

## 🔍 Ver Más

- [Documentación del sistema](../instructions/ContextSystem.md)
- [Arquitectura propuesta](../instructions/ContextSystem.md#arquitectura-propuesta-extendida)
- [Ideas de aprovechamiento](../instructions/ContextSystem.md#ideas-de-aprovechamiento)

---

**Versión**: 2.0 (Propuesta)  
**Fecha**: 2025-01-23  
**Mantenedor**: Player Team
