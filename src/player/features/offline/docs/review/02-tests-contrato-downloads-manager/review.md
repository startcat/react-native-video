# Review: Tests de contrato — DownloadsManager

> Revisión de implementación | 2026-02-17

## 1. Verificación contra Spec

### Cobertura de requisitos

| # | Requisito (del spec.md) | Estado | Evidencia | Notas |
|---|---|---|---|---|
| 1 | initialize marca isInitialized = true | ✅ | test #1 L212 | |
| 2 | initialize idempotente | ✅ | test #2 L216 | |
| 3 | initialize aplica config parcial | ✅ | test #3 L221 | |
| 4 | initialize inicializa sub-servicios | ✅ | test #4 L228 | |
| 5 | addDownload stream delega a queueManager | ✅ | test #5 L238 | |
| 6 | addDownload binary delega a queueManager | ✅ | test #6 L252 | |
| 7 | addDownload tipo no habilitado → error | ✅ | test #7 L265 | |
| 8 | addDownload sin inicializar → error | ✅ | test #8 L272 | |
| 9 | addDownload retorna ID | ✅ | test #9 L282 | |
| 10 | startDownloadNow delega a downloadService | ✅ | test #10 L294 | |
| 11 | startDownloadNow sin inicializar → error | ✅ | test #11 L305 | |
| 12 | removeDownload cancela si DOWNLOADING | ✅ | test #12 L319 | |
| 13 | removeDownload llama forceRemoveDownload | ✅ | test #13 L336 | |
| 14 | removeDownload limpia nativeManager siempre | ✅ | test #14 L350 | |
| 15 | removeDownload no falla si no existe | ✅ | test #15 L360 | |
| 16 | removeDownload elimina binario completado | ✅ | test #16 L366 | |
| 17 | pauseDownload delega a downloadService | ✅ | test #17 L386 | |
| 18 | pauseDownload item no existe → error | ✅ | test #18 L397 | |
| 19 | resumeDownload stream delega | ✅ | test #19 L407 | |
| 20 | resumeDownload binary recreación | ✅ | test #20 L418 | Verifica remove + add |
| 21 | resumeDownload item no existe → error | ✅ | test #21 L447 | |
| 22 | pauseAll marca isPaused = true | ✅ | test #22 L457 | |
| 23 | pauseAll delega a queueManager | ✅ | test #23 L463 | |
| 24 | pauseAll pausa binarios activos | ✅ | test #24 L469 | |
| 25 | pauseAll detiene procesamiento nativo | ✅ | test #25 L491 | |
| 26 | pauseAll sin inicializar → error | ✅ | test #26 L497 | |
| 27 | resumeAll marca isPaused = false | ✅ | test #27 L510 | |
| 28 | resumeAll limpia huérfanas | ✅ | test #28 L520 | |
| 29 | resumeAll delega a queueManager | ✅ | test #29 L526 | |
| 30 | resumeAll inicia procesamiento nativo | ✅ | test #30 L532 | |
| 31 | start marca isProcessing = true | ✅ | test #31 L542 | |
| 32 | start delega a queueManager.start | ✅ | test #32 L548 | |
| 33 | start inicia procesamiento nativo | ✅ | test #33 L554 | |
| 34 | stop llama pauseAll | ✅ | test #34 L564 | |
| 35 | getDownloads delega a queueManager | ✅ | test #35 L576 | |
| 36 | getDownloads filtra por perfil | ✅ | test #36 L587 | |
| 37 | getDownloads retorna [] si no inicializado | ✅ | test #37 L601 | |
| 38 | getDownload delega a queueManager | ✅ | test #38 L616 | |
| 39 | getDownload retorna null si no inicializado | ✅ | test #39 L626 | |
| 40 | getActiveDownloads filtra DOWNLOADING/PREPARING | ✅ | test #40 L654 | |
| 41 | getQueuedDownloads filtra QUEUED | ✅ | test #41 L661 | |
| 42 | getCompletedDownloads filtra COMPLETED | ✅ | test #42 L668 | |
| 43 | getFailedDownloads filtra FAILED | ✅ | test #43 L675 | |
| 44 | getQueueStats retorna stats | ✅ | test #44 L686 | |
| 45 | getQueueStats cache funciona | ✅ | test #45 L711 | Verifica 1 sola llamada |
| 46 | getQueueStats sin inicializar → stats vacías | ✅ | test #46 L736 | |
| 47 | subscribe retorna unsubscribe | ✅ | test #47 L756 | |
| 48 | unsubscribe no lanza error | ✅ | test #48 L762 | |
| 49 | updateConfig propaga a queueManager | ✅ | test #49 L772 | |
| 50 | getConfig retorna copia | ✅ | test #50 L783 | |
| 51 | enable/disable tipos propaga a downloadService | ✅ | test #51 L791 | |
| 52 | getState retorna copia | ✅ | test #52 L811 | |
| 53 | isInitialized refleja estado real | ✅ | test #53 L819 | |
| 54 | isProcessing delega a queueManager | ✅ | test #54 L827 | |
| 55 | isPaused delega a queueManager | ✅ | test #55 L851 | |
| 56 | cleanupOrphanedDownloads delega | ✅ | test #56 L879 | |
| 57 | cleanupOrphanedDownloads sin inicializar → error | ✅ | test #57 L888 | |
| 58 | destroy marca isInitialized = false | ✅ | test #58 L901 | |
| 59 | destroy limpia listeners | ✅ | test #59 L909 | |

**Resumen**: 59 de 59 requisitos completados (100%)

### Requisitos no implementados

Ninguno.

### Exclusiones documentadas (del spec)

| Método | Razón |
|---|---|
| `clearCompleted` / `clearFailed` | TODO stubs en producción (no-op) |
| `getSystemState` | Concern de integración, no contrato |

## 2. Invariantes preservados

| Invariante | Estado | Verificación |
|---|---|---|
| Singleton reset entre tests | ✅ Preservado | `beforeEach` resetea `instance = undefined` |
| Mocks independientes entre tests | ✅ Preservado | `jest.clearAllMocks()` en `beforeEach` |
| No modifica código de producción | ✅ Preservado | Solo archivo de test creado |
| Tests existentes (QueueManager) siguen pasando | ✅ Preservado | 41/41 QM + 59/59 DM = 100 total |

## 3. Calidad de código

### Lint

```
npx eslint DownloadsManager.contract.test.ts → 0 errores, 0 warnings
```

Resultado: ✅

### Type check

```
npx tsc --noEmit --skipLibCheck → errores pre-existentes en Player.tsx (no relacionados)
```

Resultado: ✅ (sin errores nuevos)

### Tests

```
Test Suites: 2 passed, 2 total
Tests:       100 passed, 100 total (59 DM + 41 QM)
Time:        0.369 s
```

Resultado: ✅ Pass (100 tests)

### Build

No aplica — solo se creó un archivo de test.

## 4. Resumen de cambios

```
ARCHIVOS CREADOS: 3
ARCHIVOS ELIMINADOS: 0
LÍNEAS AÑADIDAS: ~1577
LÍNEAS ELIMINADAS: ~119 (structure.md pre-existente, no relacionado)
```

### Por categoría

- **Tests**: `__tests__/managers/DownloadsManager.contract.test.ts` (913 líneas)
- **Documentación**: `docs/review/02-tests-contrato-downloads-manager/spec.md` (322 líneas)
- **Documentación**: `docs/review/02-tests-contrato-downloads-manager/plan.md` (342 líneas)

## 5. Deuda técnica

| Ubicación | Descripción | Prioridad |
|---|---|---|
| test L14 | `getDownloadType` mock usa string `"STREAM"` en vez de enum (jest.mock scope limitation) | Baja |
| test L101 | `filterByActiveProfile` mock usa `DownloadItem[]` type annotation dentro de factory | Baja |

## 6. Checklist de documentación

- [x] spec.md generado y verificado
- [x] plan.md generado
- [x] Tests numerados (#1–#59) para trazabilidad
- [ ] README — no aplica
- [ ] CHANGELOG — se actualizará al final de Fase A

## 7. Checklist pre-merge

- [x] Todos los tests pasan (100/100)
- [x] Sin errores de lint
- [x] Sin errores de tipos nuevos
- [x] Commits con mensajes descriptivos
- [x] Branch actualizado con refactor_offline
- [x] Sin conflictos de merge

## 8. Notas de release

### Para PR/MR

```markdown
## Descripción
Tests de contrato para DownloadsManager (59 tests) — red de seguridad para refactorización

## Cambios principales
- 59 tests cubriendo toda la API pública del DownloadsManager
- 9 dependencias mockeadas exhaustivamente
- Cobertura de delegación, errores, edge cases y cache

## Breaking changes
Ninguno

## Testing realizado
- 59 tests nuevos passing
- 41 tests existentes (QueueManager) sin regresión
- Lint clean
- TypeScript clean (sin errores nuevos)

## Rollback
rm src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts
```

## 9. Decisión final

### Evaluación

**Criterios evaluados**:
- ✅ Todos los tests pasan (100/100)
- ✅ Sin errores de TypeScript nuevos
- ✅ Sin errores de lint
- ✅ Todos los requisitos del spec implementados (59/59)
- ✅ Invariantes preservados
- ✅ No modifica código de producción

### Estado

🟢 **LISTO PARA MERGE**

Todo verificado, sin issues pendientes. 59 tests de contrato capturan el comportamiento actual del DownloadsManager como red de seguridad para la refactorización.
