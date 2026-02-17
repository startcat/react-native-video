# Tarea: Extraer NativeEventBridge

> Tarea 15 de 19 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-03) que el QueueManager contiene ~300 líneas de handlers de eventos nativos y de BinaryDownloadService que traducen formatos de eventos y actualizan el estado interno. Esta lógica de "puente" entre el mundo nativo y el mundo JS es independiente de la orquestación de cola y puede extraerse a una clase dedicada.

**IDs de auditoría relacionados**: SA-03, REQ-023

## Objetivo

Extraer los handlers de eventos nativos y de BinaryDownloadService del QueueManager a una clase independiente `NativeEventBridge` que traduzca eventos y los propague mediante callbacks tipados.

## Alcance

### Código afectado

- `managers/queue/NativeEventBridge.ts` — **CREAR**: nueva clase que suscribe a eventos de NativeManager y BinaryDownloadService, los traduce y los propaga via callbacks
- `managers/QueueManager.ts` — **MODIFICAR**: eliminar `setupNativeEventListeners()` (líneas ~82-117), `setupBinaryEventListeners()` (líneas ~123-179), `handleNativeProgressEvent()`, `handleNativeStateEvent()`, `handleNativeCompletedEvent()`, `handleNativeErrorEvent()` y handlers similares. Reemplazar por instanciación de `NativeEventBridge` con callbacks.

### Fuera de alcance

- NO modificar NativeManager ni BinaryDownloadService
- NO cambiar el formato de los eventos emitidos por el QueueManager
- NO modificar la lógica de actualización de estado (eso está en DownloadStateStore desde tarea 14)

## Requisitos funcionales

1. **[REQ-023]**: Los eventos nativos siguen llegando al QueueManager y actualizando el estado correctamente
2. **[SA-03]**: La lógica de traducción de eventos está encapsulada en NativeEventBridge

## Requisitos técnicos

1. Clase independiente (no singleton)
2. Interfaz pública:
```typescript
export class NativeEventBridge {
  constructor(deps: EventBridgeDependencies, logger: Logger);
  setup(): void;
  teardown(): void;
}

export interface EventBridgeDependencies {
  nativeManager: NativeManager;
  binaryDownloadService: BinaryDownloadService;
  onProgress: (downloadId: string, percent: number, bytesDownloaded: number, totalBytes: number, speed: number) => void;
  onCompleted: (downloadId: string, fileUri?: string, fileSize?: number) => void;
  onFailed: (downloadId: string, error: unknown) => void;
  onPaused: (downloadId: string) => void;
  onResumed: (downloadId: string) => void;
  onStateChanged: (downloadId: string, state: string) => void;
  isBeingRemoved: (downloadId: string) => boolean;
}
```
3. Recibir dependencias por constructor (no importar singletons)
4. `teardown()` debe desuscribir todos los event listeners

## Cambios de contrato

- **Ninguno** — el comportamiento observable del QueueManager debe ser idéntico.

## Criterios de aceptación

### Funcionales
- [ ] Los eventos nativos de progreso, completado, error siguen actualizando el estado de las descargas
- [ ] Los eventos de BinaryDownloadService siguen siendo procesados
- [ ] `setupNativeEventListeners` y `setupBinaryEventListeners` ya no existen en QueueManager
- [ ] `teardown()` desuscribe todos los listeners

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos del NativeEventBridge cubren: progreso, completado, error, pausa, resume, teardown

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida `notifyDownloadProgress`, `notifyDownloadCompleted`, `notifyDownloadFailed`

### Tests nuevos a crear

- `__tests__/offline/managers/queue/NativeEventBridge.test.ts`:
  - Test 1: evento de progreso nativo → callback `onProgress` invocado con datos correctos
  - Test 2: evento de completado nativo → callback `onCompleted` invocado
  - Test 3: evento de error nativo → callback `onFailed` invocado
  - Test 4: evento de BinaryDownloadService progress → callback `onProgress` invocado
  - Test 5: evento de BinaryDownloadService done → callback `onCompleted` invocado
  - Test 6: evento de BinaryDownloadService error → callback `onFailed` invocado
  - Test 7: `isBeingRemoved` retorna true → eventos ignorados
  - Test 8: `teardown()` → listeners desuscriptos (verificar que callbacks no se invocan después)
  - Test 9 — caso límite: evento para download no existente → callback invocado (el QueueManager decide qué hacer)

## Dependencias

### Tareas previas requeridas
- Tarea 14: DownloadStateStore (los callbacks del bridge actualizan el store)

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: que la traducción de formatos de eventos pierda algún campo o caso especial (ej: Android envía `downloadedBytes`, iOS envía `bytesDownloaded`)
- **Mitigación**: copiar la lógica de traducción exactamente como está, sin simplificar. Tests de contrato como red de seguridad.
- **Rollback**: `git revert HEAD`

## Estimación

2 horas

## Notas

- Los handlers nativos en QueueManager tienen lógica de deduplicación (ej: ignorar eventos si `isBeingRemoved`). Esta lógica debe moverse al bridge o exponerse como callback.
- El bridge NO debe emitir eventos directamente al eventEmitter del QueueManager. Solo invoca callbacks. El QueueManager decide si emitir eventos.
- Verificar que el bridge maneja correctamente las diferencias Android/iOS en los nombres de campos de eventos.
