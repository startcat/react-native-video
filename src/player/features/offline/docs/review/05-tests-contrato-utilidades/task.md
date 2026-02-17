# Tarea: Tests de contrato — Utilidades

> Tarea 05 de 19 | Fase A: Red de seguridad
> Plan de refactorización de `src/player/features/offline/`

## Contexto

Las utilidades del sistema (`downloadsUtils.ts`, `formatters.ts`, `SpeedCalculator.ts`, `ErrorMapper.ts`) son funciones puras y clases autocontenidas que no dependen de singletons ni módulos nativos. Son las unidades más fáciles de testear y proporcionan la base para validar que las extracciones de Fase B (RetryManager usa ErrorMapper) y Fase C (eliminación de getStats duplicado usa SpeedCalculator) no rompen nada.

**IDs de auditoría cubiertos**: REQ-019, REQ-020, REQ-021, REQ-022

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual de las utilidades para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección **3.1.5 Utilidades — Tests de contrato**. Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `utils/downloadsUtils.ts` — funciones: `generateDownloadIdFromUri()`, `normalizeUri()`, `isValidUri()`, `calculateRemainingTime()`, `ensureDownloadId()`, `simpleHash()`
- `utils/formatters.ts` — funciones: `formatDownloadSpeed()`, `formatRemainingTime()`, `formatFileSize()`, `formatPercentage()`, `formatDownloadProgress()`, `formatDuration()`
- `utils/SpeedCalculator.ts` — clase: `SpeedCalculator` — métodos: `addSample()`, `getSpeed()`, `getEstimatedTimeRemaining()`, `clear()`, `clearAll()`
- `utils/ErrorMapper.ts` — clase: `ErrorMapper` — métodos: `mapError()`, `isRetryable()`, `getUserMessage()`

### Ficheros de test a crear

- `__tests__/offline/utils/downloadsUtils.contract.test.ts`
- `__tests__/offline/utils/formatters.contract.test.ts`
- `__tests__/offline/utils/SpeedCalculator.contract.test.ts`
- `__tests__/offline/utils/ErrorMapper.contract.test.ts`

### Fuera de alcance

- NO modificar código de producción
- NO testear constantes ni tipos (no tienen comportamiento)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|---|---|---|---|---|
| `generateDownloadIdFromUri()` | URI válida → hash consistente | String vacío → no crash | — | Misma URI → mismo ID siempre |
| `normalizeUri()` | URI con mayúsculas → normalizada | — | — | — |
| `isValidUri()` | URI http/https → true | String vacío → false | null/undefined → false (no crash) | — |
| `calculateRemainingTime()` | Valores positivos → tiempo correcto | Velocidad 0 → retorna 0 | — | — |
| `formatDownloadSpeed()` | 1024 → KB/s; 1M → MB/s | 0 → string válida | — | — |
| `formatRemainingTime()` | 3661 → formato legible | 0 → string válida | — | — |
| `formatFileSize()` | Bytes → KB/MB/GB según magnitud | 0 → string válida | — | — |
| `formatPercentage()` | 0.75 → "75%" | 0 y 1 → extremos válidos | — | — |
| `SpeedCalculator.addSample()` | Añade muestra | — | — | — |
| `SpeedCalculator.getSpeed()` | Con muestras → velocidad > 0 | Sin muestras → 0 | — | — |
| `SpeedCalculator.clear()` | Limpia un download | — | — | No afecta otros downloads |
| `ErrorMapper.mapError()` | Error de espacio → NO_SPACE_LEFT | Error genérico → UNKNOWN | — | — |
| `ErrorMapper.isRetryable()` | NETWORK_ERROR → true | NO_SPACE_LEFT → false | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] No se requieren mocks (funciones puras)
- [ ] Los tests son independientes entre sí
- [ ] El comando `npx jest __tests__/offline/utils/` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- 07 (RetryManager usa ErrorMapper), 13 (eliminación de getStats duplicado)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: mínimo. Son funciones puras sin efectos secundarios.
- **Mitigación**: —

## Estimación

1–2 horas

## Notas

- `SpeedCalculator` usa `Date.now()` internamente. Si los tests son sensibles al tiempo, usar `jest.useFakeTimers()`.
- `ErrorMapper` es una clase estática. No necesita instanciación.
- Los formatters pueden tener diferencias de formato según locale. Testear con matchers flexibles (`toContain` en lugar de `toBe`).
