# Review: Exponer subscribe en NetworkService

> Revisión de implementación | 2026-02-17

## 1. Verificación contra Spec

### Cobertura de requisitos

| # | Requisito (del spec.md) | Estado | Evidencia | Notas |
|---|---|---|---|---|
| 1 | `useNetworkStatus` no usa casting forzado | ✅ | `grep "as unknown as" → 0 resultados` | Interfaz `NetworkServiceWithEventEmitter` eliminada |
| 2 | `NetworkService.onEvent()` existe | ✅ | `NetworkService.ts:436` | Método público añadido |
| 3 | `useDownloadsQueue` no usa casting forzado | ✅ | `grep "as unknown as" → 0 resultados` | Interfaz `QueueManagerWithEventEmitter` eliminada (alcance ampliado tras /verify) |
| 4 | `QueueManager.onEvent()` existe | ✅ | `QueueManager.ts:1069` | Método público añadido (alcance ampliado tras /verify) |
| 5 | Tests de contrato siguen pasando | ✅ | 241/241 passing | Sin regresiones |

**Resumen**: 5 de 5 requisitos completados (100%)

## 2. Invariantes preservados

| Invariante | Estado | Verificación |
|---|---|---|
| Suscripción a eventos de red funcional | ✅ Preservado | `onEvent()` delega al mismo eventEmitter |
| Suscripción a eventos de cola funcional | ✅ Preservado | `onEvent()` delega al mismo eventEmitter |
| Cleanup de suscripciones en useEffect | ✅ Preservado | Funciones `unsubscribe` retornadas en cleanup |

## 3. Calidad de código

### Lint
```
0 errores, 0 warnings
```
Resultado: ✅

### Tests
```
Test Suites: 10 passed, 10 total
Tests:       241 passed, 241 total
```
Resultado: ✅ Pass (241 tests)

## 4. Resumen de cambios

```
ARCHIVOS MODIFICADOS: 4
ARCHIVOS CREADOS: 0
ARCHIVOS ELIMINADOS: 0
LÍNEAS AÑADIDAS: ~46
LÍNEAS ELIMINADAS: ~32
```

### Por categoría

**Lógica de negocio**: `NetworkService.ts`, `QueueManager.ts` (añadido `onEvent()`)
**Hooks**: `useNetworkStatus.ts`, `useDownloadsQueue.ts` (eliminado casting forzado)

## 5. Deuda técnica

Ninguna introducida.

## 6. Checklist pre-merge

- [x] Todos los tests pasan (241/241)
- [x] Sin errores de lint
- [x] Sin casting forzado restante (`grep` = 0 resultados)
- [x] Branch actualizado con refactor_offline

## 7. Decisión final

### Evaluación

- ✅ Todos los tests pasan
- ✅ Sin errores de lint
- ✅ Todos los requisitos del spec implementados
- ✅ Invariantes preservados
- ✅ Alcance ampliado tras /verify (QueueManager + useDownloadsQueue)

### Estado

🟢 **LISTO PARA MERGE**

Tarea 09/19 — Fase B: Extracciones de bajo riesgo
ID auditoría: SA-05
