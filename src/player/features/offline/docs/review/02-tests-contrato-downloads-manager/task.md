# Tarea: Tests de contrato — DownloadsManager

> Tarea 02 de 19 | Fase A: Red de seguridad
> Plan de refactorización de `src/player/features/offline/`

## Contexto

El `DownloadsManager` (1630 líneas) es el orquestador principal del sistema de descargas. Coordina 8+ singletons, maneja eventos de 5 fuentes distintas, aplica políticas globales y expone la API pública que consumen los hooks. Las tareas de Fase D (extracción de DownloadPolicyEngine) y Fase E (romper dependencia circular) modifican directamente este fichero.

**IDs de auditoría cubiertos**: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-011

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual del `DownloadsManager` para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección **3.1.2 DownloadsManager — Tests de contrato**. Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `managers/DownloadsManager.ts` — métodos: `initialize()`, `addDownload()`, `startDownloadNow()`, `removeDownload()`, `pauseDownload()`, `resumeDownload()`, `pauseAll()`, `resumeAll()`, `getDownloads()`, `getDownload()`, `getQueueStats()`, `subscribe()`, `start()`, `stop()`, `updateConfig()`, `getConfig()`, `destroy()`

### Ficheros de test a crear

- `__tests__/offline/managers/DownloadsManager.contract.test.ts`

### Fuera de alcance

- NO modificar código de producción
- NO testear métodos privados directamente
- NO testear la coordinación entre servicios (eso es integración)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|---|---|---|---|---|
| `initialize()` | Marca isInitialized = true | Idempotente (segunda llamada no falla) | — | — |
| `addDownload()` | Delega a queueManager.addDownloadItem | — | Tipo no habilitado → lanza error; sin inicializar → lanza error | — |
| `removeDownload()` | Cancela en servicio si DOWNLOADING, delega a forceRemoveDownload | — | — | — |
| `pauseDownload()` | Delega a downloadService.pauseDownload | — | Error en servicio no corrompe estado | — |
| `resumeDownload()` | Delega a downloadService.resumeDownload (stream) | Binario: remove + add (recreación) | — | — |
| `pauseAll()` / `resumeAll()` | Delega a queueManager y servicios | — | — | — |
| `getQueueStats()` | Retorna stats del queueManager | Cache reciente → no recalcula | — | — |
| `subscribe()` | Retorna función de unsubscribe funcional | — | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas
- [ ] Los tests son independientes entre sí
- [ ] El comando `npx jest __tests__/offline/managers/DownloadsManager.contract.test.ts` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- 06, 11, 12, 17, 18

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: DownloadsManager depende de 8+ singletons; si algún mock es incompleto, el test puede fallar por razones no relacionadas con el código bajo test
- **Mitigación**: mockear todos los singletons exhaustivamente basándose en las interfaces reales

## Estimación

2–3 horas

## Notas

- El DownloadsManager es un singleton. Resetear instancia en cada test.
- La secuencia `add → pause → resume` para binarios implica `removeDownload` + `addDownload` internamente. Testear esta secuencia específicamente.
- `getQueueStats()` tiene un cache de 500ms. Testear que el cache funciona (segunda llamada inmediata no recalcula).
