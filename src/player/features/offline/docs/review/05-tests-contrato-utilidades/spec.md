# Especificación Técnica: Tests de contrato — Utilidades

> Generado a partir de task.md el 2026-02-17

## Resumen

Tests de contrato para 4 módulos de utilidades: `downloadsUtils.ts` (152 líneas), `formatters.ts` (199 líneas), `SpeedCalculator.ts` (117 líneas), `ErrorMapper.ts` (185 líneas). Funciones puras y clases autocontenidas sin dependencias externas.

## 1. Alcance

### Archivos bajo test (NO modificar)

- `utils/downloadsUtils.ts` — `generateDownloadIdFromUri`, `normalizeUri`, `isValidUri`, `calculateRemainingTime`, `ensureDownloadId`
- `utils/formatters.ts` — `formatDownloadSpeed`, `formatRemainingTime`, `formatFileSize`, `formatPercentage`, `formatDownloadProgress`, `formatDuration`
- `utils/SpeedCalculator.ts` — clase `SpeedCalculator`: `addSample`, `getSpeed`, `getEstimatedTimeRemaining`, `clear`, `clearAll`, `getSampleCount`
- `utils/ErrorMapper.ts` — clase `ErrorMapper`: `mapToErrorCode`, `isRetryable`, `getUserMessage`

### Archivos a crear

- `__tests__/utils/downloadsUtils.contract.test.ts`
- `__tests__/utils/formatters.contract.test.ts`
- `__tests__/utils/SpeedCalculator.contract.test.ts`
- `__tests__/utils/ErrorMapper.contract.test.ts`

### Dependencias a mockear

Ninguna. Todas son funciones puras o clases autocontenidas.

**Nota**: `SpeedCalculator` usa `Date.now()` — usar `jest.useFakeTimers()` para tests deterministas.

## 2. Matriz de cobertura

### downloadsUtils (~12 tests)

| # | Función | Caso | Tipo |
|---|---|---|---|
| 1 | generateDownloadIdFromUri | URI válida → ID consistente | normal |
| 2 | generateDownloadIdFromUri | Misma URI → mismo ID siempre | invariante |
| 3 | generateDownloadIdFromUri | URIs diferentes → IDs diferentes | normal |
| 4 | generateDownloadIdFromUri | Limpia protocolo, query, fragment | normal |
| 5 | generateDownloadIdFromUri | URI larga (>100 chars) → trunca con hash | edge |
| 6 | normalizeUri | Normaliza mayúsculas y fragment | normal |
| 7 | normalizeUri | Trim de espacios | edge |
| 8 | isValidUri | http/https → true | normal |
| 9 | isValidUri | String vacío → false | edge |
| 10 | isValidUri | ftp:// → false | edge |
| 11 | calculateRemainingTime | Valores positivos → tiempo correcto | normal |
| 12 | calculateRemainingTime | Velocidad 0 → retorna 0 | edge |
| 13 | ensureDownloadId | Item con ID → mantiene ID | normal |
| 14 | ensureDownloadId | Item sin ID → genera desde URI | normal |

### formatters (~14 tests)

| # | Función | Caso | Tipo |
|---|---|---|---|
| 1 | formatDownloadSpeed | Bytes → B/s | normal |
| 2 | formatDownloadSpeed | KB range | normal |
| 3 | formatDownloadSpeed | MB range | normal |
| 4 | formatDownloadSpeed | 0 → "0 B/s" | edge |
| 5 | formatDownloadSpeed | Negativo → "N/A" | edge |
| 6 | formatRemainingTime | Seconds only | normal |
| 7 | formatRemainingTime | Minutes + seconds | normal |
| 8 | formatRemainingTime | Hours + minutes + seconds | normal |
| 9 | formatRemainingTime | 0 → "N/A" | edge |
| 10 | formatFileSize | Bytes, KB, MB, GB | normal |
| 11 | formatFileSize | 0 → "0 B" | edge |
| 12 | formatPercentage | Normal value | normal |
| 13 | formatPercentage | Boundaries 0 and 100 | edge |
| 14 | formatDownloadProgress | Returns complete object | normal |
| 15 | formatDuration | Milliseconds → formatted | normal |

### SpeedCalculator (~10 tests)

| # | Método | Caso | Tipo |
|---|---|---|---|
| 1 | getSpeed | Sin muestras → 0 | edge |
| 2 | getSpeed | Una muestra → 0 | edge |
| 3 | addSample + getSpeed | Múltiples muestras → velocidad > 0 | normal |
| 4 | getEstimatedTimeRemaining | Con velocidad → tiempo > 0 | normal |
| 5 | getEstimatedTimeRemaining | Sin velocidad → -1 | edge |
| 6 | getEstimatedTimeRemaining | Descarga completa → 0 | edge |
| 7 | clear | Limpia un download | normal |
| 8 | clear | No afecta otros downloads | invariante |
| 9 | clearAll | Limpia todo | normal |
| 10 | getSampleCount | Retorna count correcto | normal |

### ErrorMapper (~12 tests)

| # | Método | Caso | Tipo |
|---|---|---|---|
| 1 | mapToErrorCode | Error de espacio → INSUFFICIENT_SPACE | normal |
| 2 | mapToErrorCode | Error de red → NETWORK_ERROR | normal |
| 3 | mapToErrorCode | Error timeout → TIMEOUT | normal |
| 4 | mapToErrorCode | Error DRM → DRM_ERROR | normal |
| 5 | mapToErrorCode | Error permisos → PERMISSION_DENIED | normal |
| 6 | mapToErrorCode | Error URL → INVALID_URL | normal |
| 7 | mapToErrorCode | Error cancelación → CANCELLED | normal |
| 8 | mapToErrorCode | Error genérico → UNKNOWN | normal |
| 9 | isRetryable | NETWORK_ERROR → true | normal |
| 10 | isRetryable | INSUFFICIENT_SPACE → false | normal |
| 11 | getUserMessage | Cada código → mensaje en castellano | normal |
| 12 | getUserMessage | UNKNOWN → "Error desconocido" | edge |

**Total estimado: ~50 tests**

## 3. Complejidad

- **Nivel**: Baja
- **Justificación**: Funciones puras, sin mocks, sin side effects
- **Tiempo estimado**: 1 hora
