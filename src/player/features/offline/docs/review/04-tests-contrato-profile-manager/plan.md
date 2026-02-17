# Plan de Implementación: Tests de contrato — ProfileManager

> Generado a partir de spec.md el 2026-02-17

## Resumen

- **Tests totales**: 33
- **Fases**: 2 (scaffold + all tests — simple enough for 2 phases)
- **Estimación**: 45 minutos
- **Archivo destino**: `src/player/features/offline/__tests__/managers/ProfileManager.contract.test.ts`

## Fase 1: Scaffold + Init + Profile CRUD (#1–#11)

### Tareas

1. Crear archivo con imports, helpers, singleton reset
2. No mocks needed (ProfileManager has no external deps)
3. Helper `createMockDownloadItem` for filtering tests
4. Tests #1–#11: initialize, setActiveProfile, getActiveProfile, hasActiveProfile, getActiveProfileId, isChildProfile

### Verificación

```bash
npx jest src/player/features/offline/__tests__/managers/ProfileManager.contract.test.ts --no-coverage
```

11 tests passing.

## Fase 2: Filtering + Config + Subscribe + Destroy (#12–#33)

### Tareas

1. Tests #12–#16: shouldShowContent
2. Tests #17–#21: canDownload, canDownloadContent
3. Tests #22–#24: filterByActiveProfile
4. Tests #25–#27: setProfileFiltering, setActiveProfileRequired
5. Tests #28–#30: subscribe
6. Tests #31–#33: getContextStats, destroy

### Verificación

```bash
npx jest src/player/features/offline/__tests__/managers/ProfileManager.contract.test.ts --no-coverage
```

33 tests passing.

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/managers/ --no-coverage
npx eslint src/player/features/offline/__tests__/managers/ProfileManager.contract.test.ts
```

Esperado: 168 tests passing (41 QM + 59 DM + 35 CM + 33 PM), 0 lint errors.

## Rollback

```bash
rm src/player/features/offline/__tests__/managers/ProfileManager.contract.test.ts
```
