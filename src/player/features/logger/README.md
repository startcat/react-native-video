# Documentación del Sistema de Logging del Player

Este documento describe el sistema de logging centralizado para el OTT Player.

## Descripción

El sistema de logging del Player proporciona una solución centralizada y configurable para el registro de eventos, errores y información de depuración. Está diseñado para ser flexible, eficiente y fácil de usar en todos los componentes del reproductor.

## Arquitectura del Sistema

| Componente | Responsabilidad | Archivo |
|------------|-----------------|---------|
| **Logger** | Logger principal con configuración completa | `Logger.ts` |
| **LoggerFactory** | Factory para crear instancias de logger | `LoggerFactory.ts` |
| **LoggerUtils** | Utilidades para formateo y procesamiento | `LoggerUtils.ts` |
| **Types** | Interfaces y enumeraciones del sistema | `types/index.ts` |
| **Constants** | Constantes y configuraciones por defecto | `constants.ts` |

## Niveles de Logging

### LogLevel

Enumeración que define los niveles de logging disponibles:

| Nivel | Valor | Descripción | Uso Recomendado |
|-------|-------|-------------|-----------------|
| `DEBUG` | 0 | Información detallada de depuración | Desarrollo y debugging |
| `INFO` | 1 | Información general del flujo | Eventos importantes |
| `WARN` | 2 | Advertencias que no detienen la ejecución | Situaciones inesperadas |
| `ERROR` | 3 | Errores que requieren atención | Fallos y excepciones |
| `NONE` | 4 | Desactiva todos los logs | Producción silenciosa |

## Configuración del Logger

### LoggerConfig

Interfaz para configurar el comportamiento del logger:

| Propiedad | Tipo | Por Defecto | Descripción |
|-----------|------|-------------|-------------|
| `enabled` | `boolean` | `__DEV__` | Habilita/deshabilita el logging |
| `level` | `LogLevel` | `LogLevel.INFO` | Nivel mínimo de logging |
| `prefix` | `string` | `'[OTTPlayer]'` | Prefijo para todos los mensajes |
| `includeTimestamp` | `boolean` | `true` | Incluye timestamp en los mensajes |
| `includeInstanceId` | `boolean` | `true` | Incluye ID de instancia en los mensajes |
| `useColors` | `boolean` | `__DEV__` | Aplica colores en consola (solo desarrollo) |

## Logger

Clase principal del sistema de logging.

### Constructor

```typescript
constructor(config?: LoggerConfig, instanceId?: number)
```

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `config` | `LoggerConfig` | Configuración opcional del logger |
| `instanceId` | `number` | ID único de la instancia (opcional) |

### Métodos Principales

#### Métodos de Logging por Nivel

| Método | Parámetros | Descripción |
|--------|------------|-------------|
| `debug()` | `component: string, message: string, ...args: any[]` | Log de nivel DEBUG |
| `info()` | `component: string, message: string, ...args: any[]` | Log de nivel INFO |
| `warn()` | `component: string, message: string, ...args: any[]` | Log de nivel WARN |
| `error()` | `component: string, message: string, ...args: any[]` | Log de nivel ERROR |
| `log()` | `level: LogLevel, component: string, message: string, ...args: any[]` | Log genérico con nivel especificado |

#### Métodos de Configuración

| Método | Parámetros | Descripción |
|--------|------------|-------------|
| `updateConfig()` | `config: Partial<LoggerConfig>` | Actualiza la configuración del logger |
| `setEnabled()` | `enabled: boolean` | Habilita/deshabilita el logging |
| `setLevel()` | `level: LogLevel` | Establece el nivel mínimo de logging |
| `setInstanceId()` | `instanceId: number` | Establece el ID de instancia |

#### Métodos de Utilidad

| Método | Retorno | Descripción |
|--------|---------|-------------|
| `forComponent()` | `ComponentLogger` | Crea un logger específico para un componente |

### Formato de Mensajes

El logger genera mensajes con el siguiente formato:

```
[OTTPlayer] HH:MM:SS.mmm #instanceId [LEVEL] [Component] Message
```

**Ejemplo**:
```
[OTTPlayer] 14:30:25.123 #1 [INFO] [CastManager] Cast manager initialized
```

### Colores en Consola

Cuando `useColors` está habilitado (por defecto en desarrollo):

| Nivel | Color | Código |
|-------|-------|--------|
| DEBUG | Cyan | `\x1b[36m` |
| INFO | Green | `\x1b[32m` |
| WARN | Yellow | `\x1b[33m` |
| ERROR | Red | `\x1b[31m` |

## LoggerFactory

Factory para crear instancias preconfiguradas de logger.

### Métodos Estáticos

| Método | Parámetros | Descripción |
|--------|------------|-------------|
| `createDevelopmentLogger()` | `instanceId?: number` | Crea logger optimizado para desarrollo |
| `createProductionLogger()` | `instanceId?: number` | Crea logger optimizado para producción |

### Configuraciones Predefinidas

#### Logger de Desarrollo
```typescript
{
  enabled: true,
  level: LogLevel.DEBUG,
  useColors: true,
  includeTimestamp: true,
  includeInstanceId: true
}
```

#### Logger de Producción
```typescript
{
  enabled: false,
  level: LogLevel.ERROR,
  useColors: false,
  includeTimestamp: false,
  includeInstanceId: true
}
```

## ComponentLogger

Interfaz para loggers específicos de componentes que simplifican el uso.

### Métodos

| Método | Parámetros | Descripción |
|--------|------------|-------------|
| `debug()` | `message: string, ...args: any[]` | Log de DEBUG (sin especificar componente) |
| `info()` | `message: string, ...args: any[]` | Log de INFO (sin especificar componente) |
| `warn()` | `message: string, ...args: any[]` | Log de WARN (sin especificar componente) |
| `error()` | `message: string, ...args: any[]` | Log de ERROR (sin especificar componente) |
| `log()` | `level: LogLevel, message: string, ...args: any[]` | Log genérico (sin especificar componente) |

## LoggerUtils

Clase de utilidades para procesamiento de logs.

### Métodos Estáticos

| Método | Parámetros | Retorno | Descripción |
|--------|------------|---------|-------------|
| `formatObject()` | `obj: any` | `string` | Formatea objetos para logging (JSON.stringify con fallback) |
| `truncateMessage()` | `message: string, maxLength?: number` | `string` | Trunca mensajes largos (por defecto 500 caracteres) |
| `createSessionId()` | - | `string` | Genera ID único para sesiones de log |

## Ejemplos de Uso

### Uso Básico con Logger

```typescript
import { Logger, LogLevel } from './logger';

// Crear logger con configuración por defecto
const logger = new Logger();

// Logs básicos
logger.info('MyComponent', 'Aplicación iniciada');
logger.debug('MyComponent', 'Estado actual:', { user: 'john', active: true });
logger.warn('MyComponent', 'Configuración no encontrada, usando valores por defecto');
logger.error('MyComponent', 'Error al conectar con el servidor', error);
```

### Uso con Factory

```typescript
import { LoggerFactory } from './logger';

// Logger para desarrollo
const devLogger = LoggerFactory.createDevelopmentLogger(123);

// Logger para producción
const prodLogger = LoggerFactory.createProductionLogger(123);

```

### Uso con ComponentLogger

```typescript
import { Logger } from './logger';

const mainLogger = new Logger();
const componentLogger = mainLogger.forComponent('CastManager');

// Uso simplificado (no necesita especificar componente)
componentLogger.info('Cast manager inicializado correctamente');
componentLogger.debug('Configuración cargada:', config);
componentLogger.error('Error en la inicialización:', error);
```

### Configuración Avanzada

```typescript
import { Logger, LogLevel } from './logger';

const logger = new Logger({
  enabled: true,
  level: LogLevel.INFO,
  prefix: '[OTTPlayer]',
  includeTimestamp: true,
  includeInstanceId: true,
  useColors: true,
}, 42);

// Actualizar configuración dinámicamente
logger.updateConfig({
  level: LogLevel.DEBUG,
});
```

### Uso con LoggerUtils

```typescript
import { LoggerUtils } from './logger';

const complexObject = {
  user: { id: 1, name: 'John' },
  settings: { theme: 'dark', notifications: true }
};

// Formatear objeto para logging
const formattedObj = LoggerUtils.formatObject(complexObject);
logger.info('MyComponent', 'Datos del usuario:', formattedObj);

// Truncar mensajes largos
const longMessage = 'Este es un mensaje muy largo...'.repeat(100);
const truncated = LoggerUtils.truncateMessage(longMessage, 200);
logger.info('MyComponent', truncated);

// Crear ID de sesión
const sessionId = LoggerUtils.createSessionId();
logger.info('MyComponent', `Nueva sesión iniciada: ${sessionId}`);
```

## Consideraciones de Rendimiento

### Filtrado Eficiente
- Los logs se filtran **antes** de procesar el mensaje para máximo rendimiento
- El filtrado por nivel es muy eficiente (comparación numérica)
- El filtrado por componente usa `Array.includes()` optimizado

### Formateo Lazy
- Los objetos complejos solo se formatean si el log va a mostrarse
- El timestamp se calcula solo cuando es necesario
- Los colores se aplican solo en desarrollo

### Configuración Recomendada

#### Desarrollo
```typescript
{
  enabled: true,
  level: LogLevel.DEBUG,
  useColors: true,
  includeTimestamp: true
}
```

#### Producción
```typescript
{
  enabled: false, // o LogLevel.ERROR para errores críticos
  level: LogLevel.ERROR,
  useColors: false,
  includeTimestamp: false
}
```

## Debugging y Troubleshooting

### Problemas Comunes

| Problema | Causa Probable | Solución |
|----------|----------------|----------|
| No aparecen logs | `enabled: false` o nivel muy alto | Verificar configuración y nivel |
| Logs duplicados | Múltiples instancias de logger | Usar singleton o factory |
| Rendimiento lento | Nivel DEBUG en producción | Cambiar a nivel ERROR o deshabilitar |
| Colores no funcionan | `useColors: false` o entorno no compatible | Habilitar solo en desarrollo |

### Verificación de Configuración

```typescript
// Verificar estado actual del logger
console.log('Logger enabled:', logger.config.enabled);
console.log('Logger level:', logger.config.level);

// Test de niveles
logger.debug('Test', 'Debug message');
logger.info('Test', 'Info message');
logger.warn('Test', 'Warning message');
logger.error('Test', 'Error message');
```
