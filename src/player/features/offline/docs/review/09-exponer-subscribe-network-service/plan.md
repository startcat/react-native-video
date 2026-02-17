# Plan de Implementación: Exponer subscribe en NetworkService

> Basado en spec.md (ampliado tras /verify) | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Añadir `onEvent()` a NetworkService y QueueManager, eliminar casting forzado en useNetworkStatus y useDownloadsQueue
- **Fases**: 2
- **Estimación**: 30 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

- [x] Spec revisado y aprobado
- [x] Baseline verificado — 241 tests passing
- [x] Branch creado: `refactor_offline_tasks/09-exponer-subscribe-network-service`

---

## Fases de implementación

### Fase 1: Añadir onEvent() a NetworkService + refactor useNetworkStatus

**Objetivo**: Eliminar casting forzado en useNetworkStatus

**Archivos a modificar**:
- `services/network/NetworkService.ts` — añadir método `onEvent()`
- `hooks/useNetworkStatus.ts` — reemplazar casting por `networkService.onEvent()`

**Cambios específicos**:
1. Añadir método público `onEvent(event: string, callback: (...args: any[]) => void): () => void` al NetworkService
2. En useNetworkStatus: eliminar interfaz `NetworkServiceWithEventEmitter`
3. En useNetworkStatus: reemplazar `as unknown as` + `eventEmitter.on/off` por `networkService.onEvent()`

**Punto de verificación**:
```bash
grep -n "as unknown as" src/player/features/offline/hooks/useNetworkStatus.ts
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 15 minutos

---

### Fase 2: Añadir onEvent() a QueueManager + refactor useDownloadsQueue

**Objetivo**: Eliminar casting forzado en useDownloadsQueue

**Archivos a modificar**:
- `managers/QueueManager.ts` — añadir método `onEvent()`
- `hooks/useDownloadsQueue.ts` — reemplazar casting por `queueManager.onEvent()`

**Cambios específicos**:
1. Añadir método público `onEvent(event: string, callback: (...args: any[]) => void): () => void` al QueueManager
2. En useDownloadsQueue: eliminar interfaz `QueueManagerWithEventEmitter`
3. En useDownloadsQueue: reemplazar `as unknown as` + `eventEmitter.on/off` por `queueManager.onEvent()`

**Punto de verificación**:
```bash
grep -rn "as unknown as.*EventEmitter" src/player/features/offline/
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 15 minutos

---

## Verificación final

```bash
# 1. No queda casting forzado
grep -rn "as unknown as.*EventEmitter" src/player/features/offline/

# 2. Tests de regresión
npx jest src/player/features/offline/__tests__/ --no-coverage

# 3. Lint
npx eslint src/player/features/offline/services/network/NetworkService.ts src/player/features/offline/managers/QueueManager.ts src/player/features/offline/hooks/useNetworkStatus.ts src/player/features/offline/hooks/useDownloadsQueue.ts
```

## Rollback

```bash
git checkout -- src/player/features/offline/services/network/NetworkService.ts src/player/features/offline/managers/QueueManager.ts src/player/features/offline/hooks/useNetworkStatus.ts src/player/features/offline/hooks/useDownloadsQueue.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
