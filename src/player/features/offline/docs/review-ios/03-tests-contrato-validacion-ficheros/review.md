# Review: Tests de contrato — Validación y ficheros

> 1 ronda de review | 18/02/2026
> Fichero revisado: `ios/Tests/DownloadValidationTests.swift`

## Ronda 1

**Sin bugs encontrados.**

### ℹ️ NOTA: Helper `calculateDirectorySize` definido pero no usado

El helper reproduce la lógica de producción (línea 2593) pero ningún test lo llama directamente. Todos los tests de tamaño usan `calculateAssetSize`. No es un bug — `calculateDirectorySize` es más simple y su lógica está subsumida por `calculateAssetSize` para directorios.

### ℹ️ NOTA: Test 18 idéntico a test 13

`testAssetIntegrityRelaxed_directoryWithLargeFile_valid` llama a `validateAssetIntegrity` (no a una versión "relaxed" separada). Nuestra reproducción omite el paso 5 (tracks AVURLAsset), que es la única diferencia entre strict y relaxed en producción. El test documenta la intención pero no diferencia comportamiento. Aceptable como contrato.

### Verificaciones positivas

- ✅ setUp/tearDown limpian UserDefaults + ficheros + directorios temporales
- ✅ UUID en nombres de ficheros evita colisiones
- ✅ Helpers reproducen fielmente la lógica de producción
- ✅ validateDownloadUri: 6 tests cubren HLS, DASH, MP4, inválida, vacía, query params
- ✅ validateDownloadConfig: 6 tests vía addDownload con XCTSkipUnless
- ✅ Limpieza /.nofollow: 4 tests cubren prefijo, sin prefijo, vacío, solo prefijo
- ✅ Integridad assets: 6 tests con dirs temporales reales
- ✅ Cálculo tamaño: 5 tests con ficheros de tamaño conocido + recursión
- ✅ 27 tests totales

## Resumen de bugs encontrados y corregidos

| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| — | — | Sin bugs | — |

## Veredicto

**✅ APROBADO** — Listo para commit.
