# Tarea: Tests de contrato — CRUD y estado de descargas

> Tarea 1 de 20 | Fase A: Red de seguridad
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` (2929 líneas) es el fichero central del sistema de descargas iOS. Antes de extraer cualquier responsabilidad, necesitamos tests que capturen el comportamiento actual de las operaciones CRUD (add, remove, pause, resume, cancel) y las consultas de estado (getDownloads, getDownload, hasDownload, getStats).

**IDs de auditoría cubiertos**: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-012, REQ-013, REQ-014, REQ-015, REQ-021, REQ-022, REQ-031

## Objetivo

Escribir tests de contrato XCTest que capturen el comportamiento actual de las operaciones CRUD y consultas de estado de `DownloadsModule2` para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en las secciones:
- **3.1.1** — DownloadsModule2: Gestión de estado y operaciones CRUD
- **3.1.2** — DownloadsModule2: Configuración (parcial: `validateDownloadUri`, `setStreamQuality`, `setNetworkPolicy`, `setDownloadLimits`)

Usar ese código como punto de partida. Adaptarlo si es necesario para que:
- Compile y ejecute correctamente en un target XCTest
- Use las dependencias de test del proyecto (XCTest, `@testable import react_native_video`)
- Los mocks reflejen el estado real de las dependencias

**No rediseñar los tests desde cero.** La auditoría ya hizo el análisis. Si el código propuesto tiene errores, corregirlos; si le falta cobertura, ampliarla.

## Alcance

### Código bajo test (NO modificar)

- `ios/Downloads_v2/DownloadsModule2.swift` — métodos: `addDownload()`, `removeDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()`, `pauseAll()`, `resumeAll()`, `cancelAll()`, `getDownloads()`, `getDownload()`, `hasDownload()`, `getStats()`, `setStreamQuality()`, `setNetworkPolicy()`, `setDownloadLimits()`, `validateDownloadUri()`

### Ficheros de test a crear

- `ios/Tests/DownloadsModule2StateTests.swift` — Tests de operaciones CRUD y consultas
- `ios/Tests/DownloadsModule2ConfigTests.swift` — Tests de configuración y validación de URI

### Fuera de alcance

- NO modificar código de producción en esta tarea
- NO refactorizar nada, solo testear el estado actual
- Si el código actual tiene bugs, documentarlos como tests que verifican el comportamiento actual (aunque sea incorrecto), no como tests que fallan
- NO testear persistencia (tarea 02), validación de integridad (tarea 03), ni DRM (tarea 04)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `addDownload()` | Config válida → resolve | Config con campos extra → resolve | Config sin id/uri/title → reject | Siempre resuelve o rechaza, nunca ambos |
| `removeDownload()` | ID existente → resolve | — | ID inexistente → comportamiento actual | — |
| `pauseDownload()` | ID existente → resolve | — | ID inexistente → comportamiento actual | — |
| `resumeDownload()` | ID existente → resolve | — | ID inexistente → comportamiento actual | — |
| `cancelDownload()` | ID existente → resolve | — | ID inexistente → comportamiento actual | — |
| `pauseAll()` | Con descargas activas → resolve | Sin descargas → resolve | — | — |
| `resumeAll()` | Con descargas pausadas → resolve | Sin descargas → resolve | — | — |
| `cancelAll()` | Con descargas → resolve | Sin descargas → resolve | — | — |
| `getDownloads()` | Sin descargas → array vacío | — | — | Siempre devuelve dict con key "downloads" |
| `getDownload()` | ID existente → dict | — | ID inexistente → nil | — |
| `hasDownload()` | ID existente → true | — | ID inexistente → false | Siempre devuelve Bool |
| `getStats()` | Sin descargas → zeros | — | — | Siempre devuelve dict con keys esperadas |
| `setStreamQuality()` | "high" → resolve | — | — | — |
| `setNetworkPolicy()` | Config válida → resolve | — | — | — |
| `setDownloadLimits()` | Config válida → resolve | — | — | — |
| `validateDownloadUri()` | HLS → stream, MP4 → binary | — | URI inválida → isValid=false | Siempre devuelve dict |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas (reflejan dependencias reales, no stubs vacíos)
- [ ] Los tests son independientes entre sí (no dependen de orden de ejecución)
- [ ] El comando `xcodebuild test -scheme react-native-video -only-testing:DownloadsModule2StateTests` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna (las tareas de Fase A no tienen dependencias entre sí)

### Tareas que dependen de esta
- Todas las tareas de Fase B+ que toquen operaciones CRUD o estado de descargas (05, 09, 11, 13, 14)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `DownloadsModule2` hereda de `RCTEventEmitter` que requiere el bridge de React Native. Puede ser necesario mockear el bridge o crear el módulo de forma especial para tests.
- **Mitigación**: Verificar si `DownloadsModule2()` se puede instanciar sin bridge activo. Si no, crear un helper de test que configure el entorno mínimo necesario.

## Estimación

1.5-2.5 horas

## Notas

- Si no existe un target de tests XCTest en el proyecto, esta tarea debe incluir su creación.
- `DownloadsModule2` usa `RCTEventEmitter` que normalmente requiere un bridge RN activo. Los tests pueden necesitar un mock del bridge o ejecutarse como tests de integración en un simulador.
- Los métodos `addDownload` y `removeDownload` requieren `AVAssetDownloadURLSession` que solo funciona en dispositivo real o simulador con red. Los tests de estos métodos pueden necesitar ser más superficiales (verificar reject con config inválida, no el flujo completo).
