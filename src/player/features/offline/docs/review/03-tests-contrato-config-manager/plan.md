# Plan de Implementación: Tests de contrato — ConfigManager

> Generado a partir de spec.md el 2026-02-17

## Resumen

- **Tests totales**: 35
- **Fases**: 3
- **Estimación**: 1 hora
- **Archivo destino**: `src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts`

## Fase 1: Scaffold — mock, helpers, setup (0 tests)

### Objetivo
Crear el archivo de test con el mock de PersistenceService, imports, singleton reset y fake timers.

### Tareas

1. Crear archivo `ConfigManager.contract.test.ts`
2. Mock de `PersistenceService` con `loadDownloadsConfig`, `saveDownloadsConfig`, `clearDownloadsConfig`
3. Import de `ConfigManager` y tipos necesarios
4. `beforeEach`: reset singleton, `jest.useFakeTimers()`, initialize
5. `afterEach`: destroy, `jest.useRealTimers()`
6. Helper `mockedPersistence` via `jest.mocked()`

### Verificación

```bash
npx jest src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts --no-coverage
```

Debe compilar sin errores (0 tests, suite vacía).

## Fase 2: Init + getConfig + updateConfig + updateMultiple (#1–#17)

### Objetivo
Tests para initialize, getConfig, updateConfig y updateMultipleConfig.

### Tests

| # | Describe | Test |
|---|---|---|
| 1 | initialize | carga config por defecto si no hay persistida |
| 2 | initialize | config persistida → la carga y mergea con defaults |
| 3 | initialize | idempotente: segunda llamada no falla |
| 4 | initialize | aplica ConfigManagerConfig parcial |
| 5 | getConfig | retorna config actual |
| 6 | getConfig | retorna copia (no referencia) |
| 7 | updateConfig | actualiza propiedad y emite evento |
| 8 | updateConfig | valor idéntico → no emite evento |
| 9 | updateConfig | valor inválido max_concurrent_downloads → error |
| 10 | updateConfig | valor inválido storage_warning_threshold → error |
| 11 | updateConfig | valor inválido → emite config_validation_failed |
| 12 | updateConfig | sin inicializar → error |
| 13 | updateConfig | persiste tras actualizar (debounce 500ms) |
| 14 | updateMultipleConfig | actualiza múltiples propiedades |
| 15 | updateMultipleConfig | emite evento con property="multiple" |
| 16 | updateMultipleConfig | sin cambios reales → no emite evento |
| 17 | updateMultipleConfig | algún valor inválido → rechaza todo |

### Verificación

```bash
npx jest src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts --no-coverage
```

17 tests passing.

## Fase 3: Convenience + Reset + Subscribe + Destroy (#18–#35)

### Objetivo
Tests para convenience methods, resetToDefaults, clearPersistedConfig, subscribe, getDefaultConfig y destroy.

### Tests

| # | Describe | Test |
|---|---|---|
| 18 | updateStreamQuality | delega a updateConfig |
| 19 | updateNetworkPolicy | delega a updateConfig |
| 20 | updateConcurrentLimit | delega a updateConfig |
| 21 | updateAutoResume | delega a updateConfig |
| 22 | updateStorageThreshold | delega a updateConfig |
| 23 | resetToDefaults | restaura valores por defecto |
| 24 | resetToDefaults | emite evento config_reset |
| 25 | resetToDefaults | sin inicializar → error |
| 26 | clearPersistedConfig | llama a persistenceService.clearDownloadsConfig |
| 27 | clearPersistedConfig | resetea config a defaults |
| 28 | clearPersistedConfig | emite config_reset con reason |
| 29 | subscribe | retorna función de unsubscribe |
| 30 | subscribe | unsubscribe detiene notificaciones |
| 31 | subscribe | "all" suscribe a todos los eventos |
| 32 | subscribe | "all" unsubscribe limpia todos |
| 33 | getDefaultConfig | retorna copia de DEFAULT_CONFIG |
| 34 | destroy | resetea estado y config |
| 35 | destroy | limpia listeners sin error |

### Verificación

```bash
npx jest src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts --no-coverage
```

35 tests passing.

## Verificación final

```bash
# Todos los tests de offline
npx jest src/player/features/offline/__tests__/managers/ --no-coverage

# Lint
npx eslint src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts
```

Esperado: 135 tests passing (41 QM + 59 DM + 35 CM), 0 lint errors.

## Rollback

```bash
rm src/player/features/offline/__tests__/managers/ConfigManager.contract.test.ts
```
