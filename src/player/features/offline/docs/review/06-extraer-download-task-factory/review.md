# Review: Extraer downloadTaskFactory

> Revisión de implementación | 2026-02-17

## 1. Verificación contra Spec

### Funciones extraídas

| Función | Creada | Tests | Estado |
|---|---|---|---|
| `createDownloadTask()` | ✅ | 6 tests | ✅ |
| `extractSubtitlesFromManifest()` | ✅ | 3 tests | ✅ |
| `sortDownloads()` | ✅ | 2 tests | ✅ |
| **Total** | **3** | **11** | ✅ |

### Hooks refactorizados

| Hook | Duplicación eliminada | Import factory | Estado |
|---|---|---|---|
| `useDownloadsManager.ts` | ~100 líneas | ✅ | ✅ |
| `useDownloadsList.ts` | ~100 líneas | ✅ | ✅ |

## 2. Criterios de aceptación

| Criterio | Estado |
|---|---|
| `addDownload()` produce mismo resultado en ambos hooks | ✅ |
| No existe código duplicado de creación de tasks | ✅ |
| `sortDownloads` solo como import, no implementación inline | ✅ |
| Tests Fase A siguen pasando (219/219) | ✅ |
| Tests nuevos de factory (11/11) | ✅ |
| Sin errores de lint | ✅ |

## 3. Invariantes preservados

| Invariante | Estado |
|---|---|
| No modifica interfaz pública de hooks | ✅ |
| No modifica managers ni services | ✅ |
| No cambia comportamiento de addDownload | ✅ |
| Utilidad pura sin side effects | ✅ |

## 4. Calidad de código

### Tests
```
Test Suites: 9 passed, 9 total
Tests:       230 passed, 230 total (219 Fase A + 11 factory)
```

### Lint
```
0 errores, 0 warnings
```

### Diff stats
```
6 files changed, 666 insertions(+), 302 deletions(-)
Net: +364 líneas (factory + tests + docs)
Duplicación eliminada: ~200 líneas
```

## 5. Decisión final

🟢 **LISTO PARA MERGE**

Tarea 06/19 — Fase B: Extracciones de bajo riesgo
ID auditoría: SA-02
