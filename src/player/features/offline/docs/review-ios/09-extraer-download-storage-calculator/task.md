# Tarea: Extraer DownloadStorageCalculator.swift

> Tarea 9 de 20 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene ~180 líneas de lógica de cálculo de espacio con cache TTL e información del sistema. Esta lógica consulta múltiples fuentes de datos (activeDownloads, asset paths, bookmarks, FileManager) y tiene su propio mecanismo de cache con TTL de 30 segundos. Extraerla reduce la complejidad del módulo principal.

**IDs de auditoría relacionados**: SA-01, REQ-032, REQ-033

## Objetivo

Extraer la lógica de cálculo de espacio de almacenamiento y la información del sistema a `DownloadStorageCalculator.swift`, incluyendo el mecanismo de cache TTL.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `calculateTotalDownloadsSize()` (líneas 2491-2590), `getSystemInfoDict()` (líneas 1900-1956), `invalidateDownloadSpaceCache()` (línea 2618), propiedades `cachedDownloadSpace`, `downloadSpaceCacheTime`, `DOWNLOAD_SPACE_CACHE_TTL`
- `ios/Downloads_v2/DownloadStorageCalculator.swift` — **nuevo fichero**

### Fuera de alcance

- NO cambiar la lógica de cálculo (aunque consulte múltiples fuentes redundantes)
- NO simplificar la triple persistencia (CI-001) en esta tarea

## Requisitos funcionales

1. **[REQ-032]**: Calcular espacio total ocupado por descargas con cache TTL
2. **[REQ-033]**: Obtener información del sistema (espacio total, disponible, rutas)

## Requisitos técnicos

1. Clase `DownloadStorageCalculator` en `ios/Downloads_v2/`
2. Interfaz pública según sección A4 de `02-propuesta-segmentacion.md`
3. Depende de `DownloadFileManager` y `DownloadPersistenceManager`
4. Cache TTL interno (30 segundos por defecto, configurable)
5. `DownloadsModule2` crea instancia y delega

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `calculateTotalDownloadsSize()` y `getSystemInfoDict()` están en `DownloadStorageCalculator`
- [ ] Cache TTL funciona correctamente (segunda llamada dentro de 30s devuelve valor cacheado)
- [ ] `invalidateCache()` fuerza recálculo en la siguiente llamada
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: cálculo con ficheros reales, cache hit/miss, invalidación, getSystemInfo

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — `testGetStats` valida que las estadísticas siguen funcionando

### Tests nuevos a crear

- `ios/Tests/DownloadStorageCalculatorTests.swift`:
  - `testCalculateSize_withFiles_returnsCorrectTotal`: Dir con ficheros conocidos → suma correcta
  - `testCalculateSize_empty_returnsZero`: Sin ficheros → 0
  - `testCache_secondCallWithinTTL_returnsCached`: Dos llamadas rápidas → mismo resultado sin recálculo
  - `testInvalidateCache_forcesRecalculation`: Invalidar → siguiente llamada recalcula
  - `testGetSystemInfo_containsExpectedKeys`: Dict tiene totalSpace, availableSpace, downloadsSize, etc.

## Dependencias

### Tareas previas requeridas
- Tarea 06 (DownloadPersistenceManager): para asset paths
- Tarea 07 (DownloadFileManager): para calculateDirectorySize

### Tareas que dependen de esta
- Ninguna directa

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `calculateTotalDownloadsSize()` es una función compleja (~100 líneas) que consulta múltiples fuentes. Puede ser difícil extraerla sin pasar demasiados parámetros.
- **Mitigación**: Pasar las dependencias como parámetros del método (no del init) para mantener flexibilidad
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas

## Notas

- La constante `DOWNLOAD_SPACE_CACHE_TTL` ya se habrá movido a `DownloadConstants` en la tarea 05. Aquí se usa desde ahí.
- `getSystemInfoDict()` usa `FileManager.default.attributesOfFileSystem` que puede fallar en simulador. Los tests deben manejar este caso.
