# Especificación Técnica: Extraer NativeEventBridge

> Generado a partir de task.md el 2026-02-19

## Resumen

Extraer ~400 líneas de handlers de eventos nativos (NativeManager) y binarios (BinaryDownloadService) del QueueManager a una clase independiente `NativeEventBridge` que traduzca formatos de eventos y los propague mediante callbacks tipados.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/QueueManager.ts`: eliminar `setupNativeEventListeners()`, `setupBinaryEventListeners()`, `handleNativeProgressEvent()`, `handleNativeStateEvent()`, `handleNativeCompletedEvent()`, `handleNativeErrorEvent()`, `mapNativeStateToInternal()`. Reemplazar por instanciación de `NativeEventBridge` con callbacks.
- `managers/queue/NativeEventBridge.ts`: **CREAR** — nueva clase que suscribe a eventos de NativeManager y BinaryDownloadService, los traduce y los propaga via callbacks.

**Indirectos:**

- Ninguno — NativeManager y BinaryDownloadService no se modifican.

### Dependencias impactadas

**Internas:**

- `managers/NativeManager.ts`: se consume su método `subscribe()` (sin cambios)
- `services/download/BinaryDownloadService.ts`: se consume su método `subscribe()` (sin cambios)
- `types/native.ts`: se importan `NativeManagerEventType`, `NativeManagerEventCallback`
- `types/download.ts`: se importan `DownloadEventType`, `DownloadEventCallback`

**Externas:**

- Ninguna

### Archivos de configuración

- Ninguno

## 2. Contratos

### Cambios en API pública del QueueManager

| Elemento | Tipo de cambio | Antes | Después |
|----------|---------------|-------|---------|
| `setupNativeEventListeners()` | Eliminado (private) | Método privado en QueueManager | Lógica movida a NativeEventBridge |
| `setupBinaryEventListeners()` | Eliminado (private) | Método privado en QueueManager | Lógica movida a NativeEventBridge |
| `handleNativeProgressEvent()` | Eliminado (private) | Método privado en QueueManager | Lógica dividida: traducción en bridge, procesamiento en QueueManager via callback |
| `handleNativeStateEvent()` | Eliminado (private) | Método privado en QueueManager | Lógica dividida: traducción en bridge, procesamiento en QueueManager via callback |
| `handleNativeCompletedEvent()` | Eliminado (private) | Método privado en QueueManager | Lógica dividida: traducción en bridge, procesamiento en QueueManager via callback |
| `handleNativeErrorEvent()` | Eliminado (private) | Método privado en QueueManager | Lógica dividida: traducción en bridge, procesamiento en QueueManager via callback |
| `mapNativeStateToInternal()` | Eliminado (private) | Método privado en QueueManager | Movido a NativeEventBridge |

**Ningún cambio en la API pública del QueueManager.** Todos los métodos eliminados son `private`.

### Nueva API: NativeEventBridge

```typescript
export interface EventBridgeCallbacks {
  onProgress: (downloadId: string, progressData: NativeProgressData) => void;
  onCompleted: (downloadId: string, fileUri?: string, fileSize?: number) => void;
  onFailed: (downloadId: string, error: { code: string; message: string; timestamp: number }) => void;
  onStateChanged: (downloadId: string, state: DownloadStates, rawState: string, extraData?: Record<string, unknown>) => void;
}

export interface EventBridgeDependencies {
  nativeManager: {
    subscribe: (event: string, callback: (data: unknown) => void) => () => void;
  };
  binaryDownloadService: {
    subscribe: (event: string, callback: (data: unknown) => void) => () => void;
  };
  isBeingRemoved: (downloadId: string) => boolean;
  hasDownload: (downloadId: string) => boolean;
  getDownloadState: (downloadId: string) => DownloadStates | null;
  isPaused: () => boolean;
}

export interface NativeProgressData {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  remainingTime?: number;
}

export class NativeEventBridge {
  constructor(deps: EventBridgeDependencies, callbacks: EventBridgeCallbacks, logger: Logger);
  setup(): void;
  teardown(): void;
}
```

### Cambios en tipos/interfaces

No se crean nuevos tipos exportados fuera de NativeEventBridge.ts. Los tipos `NativeProgressData`, `EventBridgeCallbacks` y `EventBridgeDependencies` se definen en el mismo archivo.

### Cambios en eventos/callbacks

- **Ninguno** — Los eventos emitidos por el QueueManager (`DownloadEventType.PROGRESS`, `COMPLETED`, `FAILED`, `PAUSED`, `STARTED`, `STATE_CHANGE`) siguen siendo idénticos. La diferencia es que ahora el bridge traduce y el QueueManager emite en los callbacks.

## 3. Flujo de datos

### Antes (actual)

```
NativeManager → subscribe("download_progress") → QueueManager.handleNativeProgressEvent()
                                                   ├── updateDownloadProgress()
                                                   ├── update item.stats
                                                   └── eventEmitter.emit(PROGRESS)

BinaryDownloadService → subscribe(PROGRESS) → QueueManager (inline handler)
                                                ├── normaliza campos
                                                └── → handleNativeProgressEvent()
```

### Después (propuesto)

```
NativeManager → NativeEventBridge.setup() → traduce formato → callbacks.onProgress()
                                                                └── QueueManager (callback)
                                                                     ├── updateDownloadProgress()
                                                                     ├── update item.stats
                                                                     └── eventEmitter.emit(PROGRESS)

BinaryDownloadService → NativeEventBridge.setup() → traduce formato → callbacks.onProgress()
                                                                       └── (mismo callback)
```

### Estado global afectado

- Ninguno — el bridge no tiene estado propio más allá de las referencias a unsubscribe functions.

### Persistencia

- Sin impacto — la persistencia sigue siendo responsabilidad del QueueManager via DownloadStateStore.

### Comunicación entre módulos

- `NativeEventBridge` → `QueueManager`: via callbacks tipados (onProgress, onCompleted, onFailed, onStateChanged)
- `NativeManager` → `NativeEventBridge`: via subscribe/unsubscribe (sin cambios en NativeManager)
- `BinaryDownloadService` → `NativeEventBridge`: via subscribe/unsubscribe (sin cambios en BinaryDownloadService)

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
|----------------|-----------|------------|
| Ninguno | — | API pública del QueueManager no cambia |

### Impacto en rendimiento

- **Ninguno** — se añade una capa de indirección (callback) pero es despreciable.

### Casos edge problemáticos

- **Diferencias Android/iOS en campos de eventos**: Android envía `downloadedBytes`, iOS envía `bytesDownloaded`. NativeManager ya normaliza esto en `handleDownloadProgress()` (línea 406). El bridge debe mantener la normalización de campos de BinaryDownloadService (`bytesWritten` vs `bytesDownloaded`).
- **Binary error handler accede a `this.store.getRaw()` y `this.handleDownloadFailure()`**: El handler de errores de binarios (líneas 174-186) accede directamente al store y llama a `handleDownloadFailure`. Esto debe convertirse en un callback `onFailed` que el QueueManager implemente.
- **`handleNativeProgressEvent` tiene lógica compleja de estado**: El handler de progreso (líneas 2061-2263) contiene ~200 líneas de lógica que incluye: filtrado por `isPaused`, verificación de `isBeingRemoved`, promoción de estado QUEUED→DOWNLOADING, cálculos de bytes/speed/remainingTime, throttling de emisión. **Decisión clave**: ¿cuánta de esta lógica va al bridge vs queda en el callback del QueueManager?
- **`handleNativeStateEvent` emite eventos y re-procesa cola**: El handler de estado (líneas 2266-2348) no solo traduce estados sino que emite eventos específicos y llama a `startProcessing()`/`processQueue()`. Esta lógica de orquestación debe quedarse en el QueueManager.

## 5. Decisiones de diseño

### ¿Qué lógica va al bridge vs qué queda en QueueManager?

**En el bridge (traducción pura):**
1. Normalización de campos de eventos (Android vs iOS, BinaryDownloadService vs NativeManager)
2. Extracción de downloadId de formatos variados (`downloadId`, `id`, `taskId`)
3. Mapeo de estados nativos a `DownloadStates` (`mapNativeStateToInternal`)
4. Parsing de errores en formato variado (string, object, nested)
5. Filtrado de eventos para downloads siendo eliminados (`isBeingRemoved`)
6. Filtrado de eventos cuando el sistema está pausado (`isPaused`)

**En el QueueManager (callbacks):**
1. Actualización de estado en DownloadStateStore
2. Cálculos de bytes, speed, remainingTime
3. Throttling de emisión de eventos de progreso
4. Emisión de eventos a suscriptores
5. Re-procesamiento de cola cuando se libera un slot
6. Lógica de retry (handleDownloadFailure)
7. Promoción de estado QUEUED→DOWNLOADING al recibir progreso

### Justificación

El bridge es un **traductor de formatos** y **filtro de ruido**. No debe conocer el estado interno del QueueManager (store, currentlyDownloading, lastProgressEventTime). Los callbacks reciben datos ya normalizados y el QueueManager decide qué hacer con ellos.

## 6. Estrategias

### Testing

- **Unitarios**: Tests del NativeEventBridge con mocks de NativeManager y BinaryDownloadService. Verificar que los callbacks se invocan con datos correctamente normalizados.
- **Integración**: Tests de contrato existentes del QueueManager (`QueueManager.contract.test.ts`) deben seguir pasando sin cambios.
- **Manual**: No requerido — los tests de contrato cubren el comportamiento observable.

### Tests nuevos (`NativeEventBridge.test.ts`)

1. Evento de progreso nativo → callback `onProgress` invocado con datos normalizados
2. Evento de completado nativo → callback `onCompleted` invocado con fileUri y fileSize
3. Evento de error nativo → callback `onFailed` invocado con código y mensaje parseados
4. Evento de estado nativo → callback `onStateChanged` invocado con estado mapeado
5. Evento de progreso binario → callback `onProgress` invocado (normalización bytesWritten→bytesDownloaded)
6. Evento de completado binario → callback `onCompleted` invocado (normalización taskId→downloadId)
7. Evento de error binario → callback `onFailed` invocado (normalización taskId→downloadId)
8. `isBeingRemoved` retorna true → callbacks NO invocados
9. `isPaused` retorna true → callback `onProgress` NO invocado (otros sí)
10. `teardown()` → listeners desuscriptos (callbacks no se invocan después de teardown)
11. Evento con downloadId ausente → callback NO invocado (error logueado)
12. `mapNativeStateToInternal` mapea correctamente todos los estados conocidos

### Rollback

1. `git revert HEAD` — revierte el commit de la tarea
2. Los tests de contrato verifican que el rollback restaura el comportamiento correcto

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: N/A

## 7. Complejidad estimada

- **Nivel**: Media
- **Justificación**: La lógica a extraer es compleja (~400 líneas) pero bien delimitada. La dificultad principal es decidir correctamente qué lógica va al bridge vs al callback, y asegurar que la normalización de campos no pierde ningún caso especial.
- **Tiempo estimado**: 2 horas

## 8. Preguntas sin resolver

### Técnicas

- [x] ¿Cuánta lógica del `handleNativeProgressEvent` va al bridge? → **Decisión**: Solo normalización de campos y filtrado de ruido. Los cálculos de bytes/speed/remainingTime y el throttling quedan en el QueueManager.
- [x] ¿El bridge debe manejar el caso de binary error que accede al store? → **Decisión**: No. El bridge invoca `onFailed(downloadId, error)` y el QueueManager busca el item en el store y llama a `handleDownloadFailure`.

### De negocio

- Ninguna

### De rendimiento

- Ninguna — la indirección es despreciable

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
