# Plan de Implementación: Tests de contrato — Utilidades

> Generado a partir de spec.md el 2026-02-17

## Resumen

- **Tests totales**: ~50
- **Archivos**: 4 test files
- **Estimación**: 1 hora
- **Sin mocks**: todas funciones puras

## Fase 1: downloadsUtils + formatters

Create `downloadsUtils.contract.test.ts` (~14 tests) and `formatters.contract.test.ts` (~15 tests).

### Verificación
```bash
npx jest src/player/features/offline/__tests__/utils/ --no-coverage
```

## Fase 2: SpeedCalculator + ErrorMapper

Create `SpeedCalculator.contract.test.ts` (~10 tests) and `ErrorMapper.contract.test.ts` (~12 tests).

### Verificación
```bash
npx jest src/player/features/offline/__tests__/utils/ --no-coverage
```

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
npx eslint src/player/features/offline/__tests__/utils/
```
