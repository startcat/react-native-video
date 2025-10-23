# Context System - Sistema de Contexto del Player

## 📋 Propósito

El **PlayerContext** es un contenedor de información compartida y servicios comunes que se pasa a través de toda la instancia del reproductor. Proporciona un punto centralizado para acceder a servicios globales (logger, analytics, configuración) y mantener el estado compartido entre componentes sin necesidad de prop drilling.

## 🎯 Objetivos

1. **Evitar prop drilling**: Pasar servicios comunes sin tener que pasarlos por cada componente
2. **Identificación de instancias**: Cada reproductor tiene un ID único para debugging y analytics
3. **Servicios compartidos**: Logger, analytics, configuración accesibles desde cualquier punto
4. **Extensibilidad**: Fácil agregar nuevos servicios sin modificar interfaces existentes
5. **Testing facilitado**: Fácil mockear servicios inyectados vía contexto
6. **Lifecycle management**: Gestionar servicios que necesitan cleanup

## 🏗️ Arquitectura Actual

```
┌─────────────────────────────────────────────────────────┐
│                   PlayerContext                         │
│  - instanceId: number (único por instancia)            │
│  - logger: Logger (servicio de logging)                │
└─────────────────────────────────────────────────────────┘
                          ↓
                   Usado por
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Flavours (Audio, Video, Cast)              │
│  - Acceden al logger vía context                       │
│  - Usan instanceId para identificación                 │
└─────────────────────────────────────────────────────────┘
```

## 📦 Implementación Actual

### PlayerContext (Clase)

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

### Interface Actual

```typescript
export interface IPlayerInstanceContext {
  getInstanceId(): number;
}
```

## 🚀 Arquitectura Propuesta (Extendida)

### PlayerContext Extendido

```typescript
export class PlayerContext implements IPlayerInstanceContext {
  // === IDENTIFICACIÓN ===
  private static instanceCounter = 0;
  private instanceId: number;
  private instanceName?: string;
  
  // === SERVICIOS CORE ===
  public readonly logger: Logger;
  public readonly analytics?: AnalyticsManager;
  public readonly errorHandler?: ErrorHandler;
  
  // === CONFIGURACIÓN ===
  private config: PlayerConfig;
  private features: FeatureFlags;
  
  // === ESTADO COMPARTIDO ===
  private sharedState: Map<string, any>;
  
  // === MANAGERS (Inyección de Dependencias) ===
  private sourceManager?: SourceManager;
  private progressManager?: ProgressManagerUnified;
  private playbackManager?: PlaybackManager;
  
  // === LIFECYCLE ===
  private isDisposed = false;
  private disposables: Array<() => void> = [];
  
  constructor(options: PlayerContextOptions) {
    this.instanceId = ++PlayerContext.instanceCounter;
    this.instanceName = options.instanceName;
    this.logger = options.logger;
    this.analytics = options.analytics;
    this.errorHandler = options.errorHandler;
    this.config = options.config || {};
    this.features = options.features || {};
    this.sharedState = new Map();
    
    this.logger.setInstanceId(this.instanceId);
    this.logger.info('PlayerContext', 'Created', { instanceName: this.instanceName });
  }
  
  // === GETTERS ===
  
  getInstanceId(): number {
    return this.instanceId;
  }
  
  getInstanceName(): string | undefined {
    return this.instanceName;
  }
  
  getLogger(): Logger {
    return this.logger;
  }
  
  getAnalytics(): AnalyticsManager | undefined {
    return this.analytics;
  }
  
  getConfig<T = any>(key: string, defaultValue?: T): T {
    return this.config[key] ?? defaultValue;
  }
  
  isFeatureEnabled(feature: string): boolean {
    return this.features[feature] ?? false;
  }
  
  // === ESTADO COMPARTIDO ===
  
  setState<T>(key: string, value: T): void {
    this.sharedState.set(key, value);
  }
  
  getState<T>(key: string): T | undefined {
    return this.sharedState.get(key);
  }
  
  clearState(key: string): void {
    this.sharedState.delete(key);
  }
  
  // === MANAGERS (Dependency Injection) ===
  
  setSourceManager(manager: SourceManager): void {
    this.sourceManager = manager;
  }
  
  getSourceManager(): SourceManager | undefined {
    return this.sourceManager;
  }
  
  setProgressManager(manager: ProgressManagerUnified): void {
    this.progressManager = manager;
  }
  
  getProgressManager(): ProgressManagerUnified | undefined {
    return this.progressManager;
  }
  
  setPlaybackManager(manager: PlaybackManager): void {
    this.playbackManager = manager;
  }
  
  getPlaybackManager(): PlaybackManager | undefined {
    return this.playbackManager;
  }
  
  // === ERROR HANDLING ===
  
  handleError(error: PlayerError): void {
    this.logger.error('PlayerContext', 'Error occurred', {
      code: error.key,
      message: error.message,
      context: error.context
    });
    
    this.analytics?.trackError(error);
    this.errorHandler?.handle(error);
  }
  
  // === LIFECYCLE ===
  
  registerDisposable(dispose: () => void): void {
    this.disposables.push(dispose);
  }
  
  dispose(): void {
    if (this.isDisposed) return;
    
    this.logger.info('PlayerContext', 'Disposing');
    
    // Ejecutar todos los disposables
    this.disposables.forEach(dispose => {
      try {
        dispose();
      } catch (error) {
        this.logger.error('PlayerContext', 'Error disposing', { error });
      }
    });
    
    this.sharedState.clear();
    this.isDisposed = true;
  }
}
```

## 💡 Ideas de Aprovechamiento

### 1. **Dependency Injection de Managers**

En lugar de crear managers en cada flavour, inyectarlos vía contexto:

```typescript
// En PlayerController
const context = new PlayerContext({ logger, analytics });
context.setSourceManager(new SourceManager(config));
context.setProgressManager(new ProgressManagerUnified(config));
context.setPlaybackManager(new PlaybackManager(config));

// En Flavours
const sourceManager = context.getSourceManager();
const progressManager = context.getProgressManager();
```

**Beneficios:**
- ✅ Managers compartidos entre flavours
- ✅ Fácil testing (mockear managers)
- ✅ Lifecycle centralizado

### 2. **Feature Flags**

Activar/desactivar funcionalidades sin cambiar código:

```typescript
// Configuración
const context = new PlayerContext({
  logger,
  features: {
    'dvr-anti-fluctuation': true,
    'cast-reconnection-fix': true,
    'sleep-timer': true,
    'offline-downloads': false,
    'analytics-tracking': true,
  }
});

// Uso en código
if (context.isFeatureEnabled('dvr-anti-fluctuation')) {
  // Usar lógica anti-fluctuación
} else {
  // Usar lógica legacy
}
```

**Beneficios:**
- ✅ A/B testing
- ✅ Rollout gradual de features
- ✅ Debugging (desactivar features problemáticas)

### 3. **Configuración Centralizada**

Almacenar configuración global del player:

```typescript
const context = new PlayerContext({
  logger,
  config: {
    'dvr-window-seconds': 3600,
    'buffer-ahead-seconds': 30,
    'max-retry-attempts': 3,
    'analytics-batch-size': 10,
    'log-level': 'debug',
  }
});

// Uso
const dvrWindow = context.getConfig('dvr-window-seconds', 3600);
const maxRetries = context.getConfig('max-retry-attempts', 3);
```

**Beneficios:**
- ✅ Configuración centralizada
- ✅ Valores por defecto
- ✅ Fácil override por instancia

### 4. **Estado Compartido entre Componentes**

Compartir estado sin prop drilling:

```typescript
// En un componente
context.setState('last-seek-time', 120);
context.setState('playback-quality', 'hd');

// En otro componente
const lastSeek = context.getState<number>('last-seek-time');
const quality = context.getState<string>('playback-quality');
```

**Beneficios:**
- ✅ Sin prop drilling
- ✅ Estado tipado
- ✅ Fácil debugging

### 5. **Error Handling Centralizado**

Manejar errores de forma consistente:

```typescript
// En cualquier parte del código
try {
  await operation();
} catch (error) {
  const playerError = error instanceof PlayerError 
    ? error 
    : new PlayerError('PLAYER_OPERATION_FAILED', { originalError: error });
  
  context.handleError(playerError);
}

// El contexto se encarga de:
// - Logging
// - Analytics
// - Notificación a error handler
// - UI feedback
```

**Beneficios:**
- ✅ Manejo consistente
- ✅ Logging automático
- ✅ Analytics automático

### 6. **Analytics Tracking Simplificado**

Track eventos desde cualquier punto:

```typescript
// En PlayerContext
trackEvent(event: string, data?: Record<string, any>): void {
  this.analytics?.track(event, {
    instanceId: this.instanceId,
    instanceName: this.instanceName,
    timestamp: Date.now(),
    ...data
  });
}

// Uso
context.trackEvent('video_started', {
  contentId: 123,
  contentType: 'vod'
});

context.trackEvent('seek_performed', {
  from: 60,
  to: 120
});
```

**Beneficios:**
- ✅ Tracking consistente
- ✅ Metadata automática (instanceId, timestamp)
- ✅ Fácil debugging

### 7. **Lifecycle Management**

Gestionar cleanup de recursos:

```typescript
// Registrar recursos que necesitan cleanup
const subscription = eventEmitter.on('event', handler);
context.registerDisposable(() => subscription.remove());

const timer = setInterval(poll, 1000);
context.registerDisposable(() => clearInterval(timer));

// Al destruir el player
context.dispose(); // Limpia todo automáticamente
```

**Beneficios:**
- ✅ No memory leaks
- ✅ Cleanup automático
- ✅ Código más limpio

### 8. **Performance Monitoring**

Medir performance de operaciones:

```typescript
// En PlayerContext
measurePerformance<T>(
  operation: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const start = performance.now();
  
  const result = fn();
  
  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start;
      this.logger.debug('Performance', operation, { duration });
      this.analytics?.trackPerformance(operation, duration);
    });
  }
  
  const duration = performance.now() - start;
  this.logger.debug('Performance', operation, { duration });
  this.analytics?.trackPerformance(operation, duration);
  
  return result;
}

// Uso
const source = await context.measurePerformance(
  'load-source',
  () => sourceManager.loadSource(data)
);
```

**Beneficios:**
- ✅ Performance tracking automático
- ✅ Identificar bottlenecks
- ✅ Analytics de performance

### 9. **Debugging Helpers**

Facilitar debugging en desarrollo:

```typescript
// En PlayerContext
debug(): void {
  if (!__DEV__) return;
  
  console.group(`PlayerContext #${this.instanceId}`);
  console.log('Instance Name:', this.instanceName);
  console.log('Config:', this.config);
  console.log('Features:', this.features);
  console.log('Shared State:', Object.fromEntries(this.sharedState));
  console.log('Managers:', {
    source: !!this.sourceManager,
    progress: !!this.progressManager,
    playback: !!this.playbackManager,
  });
  console.groupEnd();
}

// Uso
context.debug(); // Imprime todo el estado del contexto
```

**Beneficios:**
- ✅ Debugging rápido
- ✅ Visibilidad del estado
- ✅ Solo en desarrollo

### 10. **Multi-Instance Support**

Gestionar múltiples instancias del player:

```typescript
// Registro global de instancias
class PlayerContextRegistry {
  private static instances = new Map<number, PlayerContext>();
  
  static register(context: PlayerContext): void {
    this.instances.set(context.getInstanceId(), context);
  }
  
  static unregister(instanceId: number): void {
    this.instances.delete(instanceId);
  }
  
  static get(instanceId: number): PlayerContext | undefined {
    return this.instances.get(instanceId);
  }
  
  static getAll(): PlayerContext[] {
    return Array.from(this.instances.values());
  }
}

// Uso
const context = new PlayerContext({ logger });
PlayerContextRegistry.register(context);

// Desde cualquier parte
const allPlayers = PlayerContextRegistry.getAll();
console.log(`Active players: ${allPlayers.length}`);
```

**Beneficios:**
- ✅ Gestión de múltiples players
- ✅ Debugging global
- ✅ Analytics agregado

## 📂 Estructura Propuesta

```
context/
├── PlayerContext.ts           # Clase principal extendida
├── PlayerContextRegistry.ts   # Registro global de instancias
├── types/
│   ├── index.ts              # Interfaces y tipos
│   ├── IPlayerContext.ts     # Interface principal
│   └── PlayerContextOptions.ts # Opciones de configuración
├── utils/
│   ├── FeatureFlags.ts       # Gestión de feature flags
│   └── PerformanceMonitor.ts # Monitoreo de performance
├── instructions/
│   └── ContextSystem.md      # Este archivo
├── docs/
│   └── ContextUsage.md       # Guía de uso
└── README.md                  # Resumen
```

## ✅ Reglas de Uso

### ✅ LO QUE SE DEBE HACER:

1. **Crear contexto al inicio del player**
   ```typescript
   const context = new PlayerContext({ logger, analytics, config });
   ```

2. **Pasar contexto a componentes que lo necesiten**
   ```typescript
   <AudioFlavour context={context} />
   ```

3. **Usar contexto para servicios compartidos**
   ```typescript
   context.getLogger().info('Component', 'Action');
   context.trackEvent('event_name', data);
   ```

4. **Registrar disposables para cleanup**
   ```typescript
   context.registerDisposable(() => cleanup());
   ```

5. **Disponer el contexto al destruir el player**
   ```typescript
   useEffect(() => {
     return () => context.dispose();
   }, []);
   ```

### ❌ LO QUE NO SE DEBE HACER:

1. **NO mutar el contexto desde componentes**
   ```typescript
   // ❌ MAL
   context.logger = newLogger;
   
   // ✅ BIEN
   // El logger es readonly
   ```

2. **NO crear múltiples contextos para la misma instancia**
   ```typescript
   // ❌ MAL
   const context1 = new PlayerContext({ logger });
   const context2 = new PlayerContext({ logger });
   
   // ✅ BIEN
   const context = new PlayerContext({ logger });
   // Reusar el mismo contexto
   ```

3. **NO almacenar estado mutable directamente**
   ```typescript
   // ❌ MAL
   context.currentTime = 120;
   
   // ✅ BIEN
   context.setState('current-time', 120);
   ```

4. **NO olvidar disponer el contexto**
   ```typescript
   // ❌ MAL
   // Sin cleanup
   
   // ✅ BIEN
   useEffect(() => {
     return () => context.dispose();
   }, []);
   ```

## 🔄 Flujo de Datos

```
PlayerController crea PlayerContext
         ↓
Inyecta Managers (Source, Progress, Playback)
         ↓
Pasa Context a Flavours
         ↓
Flavours usan servicios del Context
         ↓
Context gestiona lifecycle y cleanup
```

## 📊 Beneficios de la Extensión

1. **Dependency Injection**: Managers inyectados, fácil testing
2. **Feature Flags**: A/B testing y rollout gradual
3. **Configuración Centralizada**: Un solo lugar para config
4. **Estado Compartido**: Sin prop drilling
5. **Error Handling**: Manejo consistente
6. **Analytics**: Tracking simplificado
7. **Lifecycle**: Cleanup automático
8. **Performance**: Monitoreo integrado
9. **Debugging**: Helpers de desarrollo
10. **Multi-Instance**: Soporte para múltiples players

## 🔍 Próximos Pasos

1. **Extender PlayerContext** con servicios propuestos
2. **Implementar FeatureFlags** system
3. **Crear PlayerContextRegistry** para multi-instance
4. **Agregar Performance Monitoring**
5. **Documentar patrones de uso** en docs/
6. **Migrar flavours** para usar contexto extendido
7. **Testing** del sistema de contexto

---

**Versión**: 2.0 (Propuesta)  
**Fecha**: 2025-01-23  
**Estado**: 📝 Diseño - Pendiente de implementación
