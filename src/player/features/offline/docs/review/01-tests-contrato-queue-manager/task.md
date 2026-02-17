# Tarea: Tests de contrato — QueueManager

> Tarea 01 de 19 | Fase A: Red de seguridad
> Plan de refactorización de `src/player/features/offline/`

## Contexto

El `QueueManager` es el componente más grande del sistema (2645 líneas) y el que más responsabilidades concentra: cola de descargas, procesamiento/scheduling, reintentos, eventos nativos, persistencia, estadísticas y locks. Todas las tareas de refactorización de las Fases B–E tocan directa o indirectamente este fichero. Sin tests de contrato que capturen su comportamiento actual, cualquier extracción es un salto al vacío.

**IDs de auditoría cubiertos**: REQ-001, REQ-002, REQ-003, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-018, REQ-026

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual del `QueueManager` para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección **3.1.1 QueueManager — Tests de contrato**. Usar ese código como punto de partida. Adaptarlo si es necesario para que:

- Compile y ejecute correctamente
- Use las dependencias de test del proyecto (Jest)
- Los mocks reflejen el estado real de las dependencias

**No rediseñar los tests desde cero.** La auditoría ya hizo el análisis. Si el código propuesto tiene errores, corregirlos; si le falta cobertura, ampliarla.

## Alcance

### Código bajo test (NO modificar)

- `managers/QueueManager.ts` — métodos: `addDownloadItem()`, `removeDownload()`, `forceRemoveDownload()`, `pauseDownload()`, `resumeDownload()`, `pauseAll()`, `resumeAll()`, `getAllDownloads()`, `getDownload()`, `getQueueStats()`, `subscribe()`, `subscribeToDownload()`, `notifyDownloadProgress()`, `notifyDownloadCompleted()`, `notifyDownloadFailed()`, `notifyDownloadPaused()`, `notifyDownloadResumed()`, `setMaxConcurrent()`, `reorderQueue()`, `clearQueue()`, `clearByState()`

### Ficheros de test a crear

- `__tests__/offline/managers/QueueManager.contract.test.ts`

### Fuera de alcance

- NO modificar código de producción en esta tarea
- NO refactorizar nada, solo testear el estado actual
- NO testear métodos privados directamente (solo a través de la API pública)
- Si el código actual tiene bugs, documentarlos como tests que verifican el comportamiento actual (aunque sea incorrecto), no como tests que fallan

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|---|---|---|---|---|
| `addDownloadItem()` | Añadir item válido → retorna ID, emite QUEUED | Item duplicado → retorna ID existente | Sin inicializar → lanza error | Persiste tras añadir |
| `removeDownload()` | Eliminar con 1 perfil → elimina completamente | Eliminar con 2+ perfiles → solo quita perfil | Item no existe → lanza error | Emite REMOVED solo si se elimina completamente |
| `forceRemoveDownload()` | Eliminar sin considerar perfiles | Item no existe → no lanza error | — | — |
| `pauseDownload()` | DOWNLOADING → PAUSED | Estado no es DOWNLOADING → no cambia | — | — |
| `resumeDownload()` | PAUSED → QUEUED | — | — | — |
| `pauseAll()` | Pausa todas las DOWNLOADING | No afecta QUEUED ni COMPLETED | — | — |
| `getAllDownloads()` | Retorna copias profundas | Cola vacía → array vacío | — | Mutación externa no afecta estado interno |
| `getQueueStats()` | Stats correctas con mezcla de estados | Cola vacía → todos los contadores a 0 | — | — |
| `subscribe()` | Recibe eventos, unsubscribe funciona | — | — | — |
| `notifyDownloadProgress()` | Actualiza progreso y emite PROGRESS | — | Item no existe → silencioso | — |
| `notifyDownloadCompleted()` | Cambia a COMPLETED, emite COMPLETED | — | — | progressPercent = 100 |
| `notifyDownloadFailed()` | FAILED tras agotar reintentos | Deduplicación si ya FAILED | — | Emite FAILED |
| `setMaxConcurrent()` | Actualiza límite | — | Valor ≤ 0 → lanza error | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas (reflejan dependencias reales, no stubs vacíos)
- [ ] Los tests son independientes entre sí (no dependen de orden de ejecución)
- [ ] El comando `npx jest __tests__/offline/managers/QueueManager.contract.test.ts` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna (las tareas de Fase A no tienen dependencias entre sí)

### Tareas que dependen de esta
- Todas las tareas de Fase B+ que toquen QueueManager: 06, 07, 08, 10, 13, 14, 15, 16, 18, 19

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que un mock no refleje la dependencia real y el test pase pero no valide nada
- **Mitigación**: verificar que los mocks se basan en el comportamiento real de las dependencias (PersistenceService, NativeManager, NetworkService, etc.)

## Estimación

2–3 horas

## Notas

- El QueueManager es un singleton. Cada test debe resetear la instancia (`QueueManager.instance = undefined`) para evitar estado compartido.
- La dependencia circular con DownloadsManager requiere un mock cuidadoso de `downloadsManager.startDownloadNow()`.
- Algunos métodos acceden a `this.downloadQueue` (Map privado). Para setup de tests, puede ser necesario acceder via `queueManager['downloadQueue']` con `@ts-ignore`.
- Los event listeners nativos (`setupNativeEventListeners`, `setupBinaryEventListeners`) se configuran durante `initialize()`. Los mocks de `nativeManager.subscribe()` y `binaryDownloadService.subscribe()` deben retornar funciones de cleanup.
