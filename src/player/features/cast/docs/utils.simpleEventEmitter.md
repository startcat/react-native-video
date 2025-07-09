# SimpleEventEmitter - utils/SimpleEventEmitter.ts

Este documento describe la clase `SimpleEventEmitter`, una implementación personalizada del patrón EventEmitter para el sistema Cast.

## Índice

- [Descripción General](#descripción-general)
- [Propiedades de la Clase](#propiedades-de-la-clase)
- [Métodos de Suscripción](#métodos-de-suscripción)
- [Métodos de Emisión](#métodos-de-emisión)
- [Métodos de Gestión](#métodos-de-gestión)
- [Métodos de Información](#métodos-de-información)
- [Métodos de Configuración](#métodos-de-configuración)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Notas Técnicas](#notas-técnicas)

---

## Descripción General

`SimpleEventEmitter` es una implementación ligera y personalizada del patrón EventEmitter, diseñada específicamente para el sistema Cast. Proporciona funcionalidad completa de eventos incluyendo suscripción, emisión, gestión de listeners y protección contra memory leaks.

### Importación

```typescript
import { SimpleEventEmitter, EventEmitter } from '../utils/SimpleEventEmitter';
import type { EventListener } from '../types';
```

---

## Propiedades de la Clase

### Propiedades Privadas

| Propiedad      | Tipo                                      | Valor Inicial | Descripción                               |
|----------------|-------------------------------------------|---------------|-------------------------------------------|
| `events`       | `{ [key: string]: EventListener[] }`     | `{}`          | Almacena los listeners por evento         |
| `maxListeners` | `number`                                  | `10`          | Límite máximo de listeners por evento     |

---

## Métodos de Suscripción

### `on(event: string, listener: EventListener): this`

Agrega un listener a un evento específico.

**Parámetros:**
| Parámetro  | Tipo            | Obligatorio | Descripción                                    |
|------------|-----------------|-------------|------------------------------------------------|
| `event`    | `string`        | ✅          | Nombre del evento                              |
| `listener` | `EventListener` | ✅          | Función callback que se ejecutará              |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- ⚠️ **Advertencia de Memory Leak:** Si se excede `maxListeners`, muestra una advertencia en consola
- 🔗 **Encadenable:** Permite encadenar múltiples llamadas

**Ejemplo:**
```typescript
const emitter = new SimpleEventEmitter();

emitter
  .on('data', (data) => console.log('Datos recibidos:', data))
  .on('error', (error) => console.error('Error:', error));
```

### `once(event: string, listener: EventListener): this`

Agrega un listener que se ejecuta solo una vez.

**Parámetros:**
| Parámetro  | Tipo            | Obligatorio | Descripción                                    |
|------------|-----------------|-------------|------------------------------------------------|
| `event`    | `string`        | ✅          | Nombre del evento                              |
| `listener` | `EventListener` | ✅          | Función callback que se ejecutará una vez      |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- 🔄 **Auto-eliminación:** Se remueve automáticamente después de ejecutarse
- 🎯 **Una sola ejecución:** Garantiza que el listener solo se ejecute una vez

**Ejemplo:**
```typescript
emitter.once('ready', () => {
  console.log('Sistema listo - solo se ejecuta una vez');
});
```

### `prependListener(event: string, listener: EventListener): this`

Agrega un listener al principio de la lista de listeners.

**Parámetros:**
| Parámetro  | Tipo            | Obligatorio | Descripción                                    |
|------------|-----------------|-------------|------------------------------------------------|
| `event`    | `string`        | ✅          | Nombre del evento                              |
| `listener` | `EventListener` | ✅          | Función callback que se ejecutará              |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- ⬆️ **Prioridad alta:** Se ejecuta antes que los listeners agregados con `on()`
- 🔗 **Encadenable:** Permite encadenamiento de métodos

**Ejemplo:**
```typescript
emitter.on('event', () => console.log('Segundo'));
emitter.prependListener('event', () => console.log('Primero'));
// Salida: "Primero", "Segundo"
```

### `prependOnceListener(event: string, listener: EventListener): this`

Agrega un listener al principio que se ejecuta solo una vez.

**Parámetros:**
| Parámetro  | Tipo            | Obligatorio | Descripción                                    |
|------------|-----------------|-------------|------------------------------------------------|
| `event`    | `string`        | ✅          | Nombre del evento                              |
| `listener` | `EventListener` | ✅          | Función callback que se ejecutará una vez      |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- ⬆️ **Prioridad alta:** Se ejecuta antes que otros listeners
- 🔄 **Auto-eliminación:** Se remueve después de ejecutarse una vez

---

## Métodos de Emisión

### `emit(event: string, ...args: any[]): boolean`

Emite un evento, ejecutando todos los listeners asociados.

**Parámetros:**
| Parámetro | Tipo      | Obligatorio | Descripción                                    |
|-----------|-----------|-------------|------------------------------------------------|
| `event`   | `string`  | ✅          | Nombre del evento a emitir                     |
| `...args` | `any[]`   | ❌          | Argumentos a pasar a los listeners             |

**Retorna:** `boolean` - `true` si había listeners, `false` si no

**Características:**
- 🛡️ **Protección de errores:** Los errores en listeners no afectan otros listeners
- 📋 **Copia de seguridad:** Crea copia del array de listeners para evitar modificaciones concurrentes
- 🔄 **Propagación completa:** Ejecuta todos los listeners incluso si uno falla

**Ejemplo:**
```typescript
// Emitir evento sin datos
emitter.emit('ready');

// Emitir evento con datos
emitter.emit('data', { id: 1, name: 'video.mp4' });

// Emitir evento con múltiples argumentos
emitter.emit('progress', 50, 100, 'downloading');
```

---

## Métodos de Gestión

### `off(event: string, listener: EventListener): this`

Remueve un listener específico de un evento.

**Parámetros:**
| Parámetro  | Tipo            | Obligatorio | Descripción                                    |
|------------|-----------------|-------------|------------------------------------------------|
| `event`    | `string`        | ✅          | Nombre del evento                              |
| `listener` | `EventListener` | ✅          | Función listener a remover                     |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- 🎯 **Remoción específica:** Solo remueve el listener exacto
- 🧹 **Limpieza automática:** Elimina el evento si no quedan listeners
- 🔗 **Encadenable:** Permite encadenamiento de métodos

**Ejemplo:**
```typescript
const handler = (data) => console.log(data);
emitter.on('data', handler);
emitter.off('data', handler); // Remueve solo este handler específico
```

### `removeAllListeners(event?: string): this`

Remueve todos los listeners de un evento específico o de todos los eventos.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `event`   | `string` | ❌          | Nombre del evento (opcional)                   |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- 🗑️ **Limpieza completa:** Remueve todos los listeners del evento especificado
- 🌍 **Limpieza global:** Si no se especifica evento, limpia todos los eventos
- ⚡ **Operación rápida:** Elimina directamente el evento del objeto

**Ejemplo:**
```typescript
// Remover todos los listeners de un evento específico
emitter.removeAllListeners('data');

// Remover todos los listeners de todos los eventos
emitter.removeAllListeners();
```

---

## Métodos de Información

### `listeners(event: string): EventListener[]`

Obtiene una copia de todos los listeners de un evento.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `event`   | `string` | ✅          | Nombre del evento                              |

**Retorna:** `EventListener[]` - Array con copia de los listeners

**Características:**
- 📋 **Copia segura:** Retorna copia del array, no referencia directa
- 🛡️ **Protección:** Las modificaciones al array retornado no afectan los listeners reales

**Ejemplo:**
```typescript
const dataListeners = emitter.listeners('data');
console.log(`Evento 'data' tiene ${dataListeners.length} listeners`);
```

### `listenerCount(event: string): number`

Obtiene el número de listeners de un evento.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `event`   | `string` | ✅          | Nombre del evento                              |

**Retorna:** `number` - Número de listeners registrados

**Ejemplo:**
```typescript
const count = emitter.listenerCount('data');
console.log(`Hay ${count} listeners para el evento 'data'`);
```

### `eventNames(): string[]`

Obtiene todos los nombres de eventos registrados.

**Parámetros:** Ninguno

**Retorna:** `string[]` - Array con nombres de todos los eventos

**Ejemplo:**
```typescript
const events = emitter.eventNames();
console.log('Eventos disponibles:', events); // ['data', 'error', 'ready']
```

---

## Métodos de Configuración

### `setMaxListeners(n: number): this`

Establece el máximo número de listeners por evento.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                                    |
|-----------|----------|-------------|------------------------------------------------|
| `n`       | `number` | ✅          | Nuevo límite máximo de listeners               |

**Retorna:** `this` - Instancia del EventEmitter para encadenamiento

**Características:**
- ⚠️ **Prevención de Memory Leaks:** Ayuda a detectar posibles memory leaks
- 🔗 **Encadenable:** Permite encadenamiento de métodos

**Ejemplo:**
```typescript
emitter.setMaxListeners(20); // Aumentar el límite a 20 listeners
```

### `getMaxListeners(): number`

Obtiene el máximo número de listeners configurado.

**Parámetros:** Ninguno

**Retorna:** `number` - Límite máximo actual de listeners

**Ejemplo:**
```typescript
const maxListeners = emitter.getMaxListeners();
console.log(`Límite actual: ${maxListeners} listeners por evento`);
```

---

## Ejemplos de Uso

### Ejemplo Básico

```typescript
import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';

const castEmitter = new SimpleEventEmitter();

// Suscribirse a eventos
castEmitter.on('stateChange', (newState) => {
  console.log('Estado cambiado a:', newState);
});

castEmitter.on('error', (error) => {
  console.error('Error en Cast:', error);
});

// Emitir eventos
castEmitter.emit('stateChange', 'CONNECTED');
castEmitter.emit('error', new Error('Conexión fallida'));
```

### Ejemplo con Listeners de Una Vez

```typescript
const emitter = new SimpleEventEmitter();

// Listener que se ejecuta solo una vez
emitter.once('initialized', () => {
  console.log('Sistema inicializado');
});

// Este listener se ejecutará múltiples veces
emitter.on('progress', (percent) => {
  console.log(`Progreso: ${percent}%`);
});

emitter.emit('initialized'); // Se ejecuta
emitter.emit('initialized'); // No se ejecuta (ya se removió)

emitter.emit('progress', 25); // Se ejecuta
emitter.emit('progress', 50); // Se ejecuta
```

### Ejemplo con Prioridad de Listeners

```typescript
const emitter = new SimpleEventEmitter();

// Agregar listeners normales
emitter.on('event', () => console.log('Listener 2'));
emitter.on('event', () => console.log('Listener 3'));

// Agregar listener con prioridad (se ejecuta primero)
emitter.prependListener('event', () => console.log('Listener 1'));

emitter.emit('event');
// Salida:
// "Listener 1"
// "Listener 2" 
// "Listener 3"
```

### Ejemplo con Gestión de Listeners

```typescript
const emitter = new SimpleEventEmitter();

// Función handler reutilizable
const dataHandler = (data) => {
  console.log('Datos procesados:', data);
};

const errorHandler = (error) => {
  console.error('Error capturado:', error);
};

// Agregar listeners
emitter.on('data', dataHandler);
emitter.on('error', errorHandler);
emitter.on('data', (data) => console.log('Backup handler:', data));

console.log('Listeners de data:', emitter.listenerCount('data')); // 2
console.log('Eventos disponibles:', emitter.eventNames()); // ['data', 'error']

// Remover listener específico
emitter.off('data', dataHandler);
console.log('Listeners de data después:', emitter.listenerCount('data')); // 1

// Remover todos los listeners de un evento
emitter.removeAllListeners('error');
console.log('Eventos después:', emitter.eventNames()); // ['data']
```

### Ejemplo con Configuración Avanzada

```typescript
const emitter = new SimpleEventEmitter();

// Configurar límite de listeners
emitter.setMaxListeners(5);

// Agregar múltiples listeners
for (let i = 1; i <= 3; i++) {
  emitter.on('test', () => console.log(`Handler ${i}`));
}

console.log('Límite actual:', emitter.getMaxListeners()); // 5
console.log('Listeners actuales:', emitter.listenerCount('test')); // 3

// Agregar más listeners - aún dentro del límite
emitter.on('test', () => console.log('Handler 4'));
emitter.on('test', () => console.log('Handler 5'));

// Este provocará una advertencia
emitter.on('test', () => console.log('Handler 6'));
// Advertencia: "Possible memory leak detected. 6 listeners added to event "test"..."
```

---

## Notas Técnicas

### Características de la Implementación

1. **Protección contra Memory Leaks:**
   - Advertencias automáticas cuando se excede `maxListeners`
   - Limpieza automática de eventos vacíos

2. **Seguridad en Concurrencia:**
   - Copia del array de listeners antes de emitir para evitar modificaciones concurrentes
   - Manejo seguro de errores en listeners individuales

3. **Compatibilidad:**
   - Exporta alias `EventEmitter` para compatibilidad con Node.js EventEmitter
   - API similar a EventEmitter estándar

4. **Rendimiento:**
   - Implementación ligera sin dependencias externas
   - Optimizada para casos de uso del sistema Cast

### Tipo EventListener

```typescript
type EventListener = (...args: any[]) => void;
```

El tipo `EventListener` representa cualquier función que puede actuar como callback de evento.

### Alias de Compatibilidad

```typescript
export { SimpleEventEmitter as EventEmitter };
```

Permite usar `EventEmitter` como alias de `SimpleEventEmitter` para compatibilidad con código que espera la nomenclatura estándar.

### Casos de Uso en el Sistema Cast

1. **Eventos de Estado:** Cambios de conexión, estado de reproducción
2. **Eventos de Progreso:** Actualizaciones de tiempo, buffer
3. **Eventos de Error:** Errores de conexión, carga, reproducción
4. **Eventos de Control:** Comandos de reproducción, volumen

La clase `SimpleEventEmitter` proporciona una base sólida y confiable para el manejo de eventos en todo el sistema Cast, con protecciones integradas y una API familiar.
