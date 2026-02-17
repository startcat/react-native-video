# Tarea: Tests de contrato — Validación y ficheros

> Tarea 3 de 20 | Fase A: Red de seguridad
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene lógica de validación de configuración, validación de integridad de assets descargados, y operaciones de ficheros (cálculo de tamaño, limpieza de paths `/.nofollow`). Antes de extraer `DownloadValidator` y `DownloadFileManager`, necesitamos tests que capturen este comportamiento.

**IDs de auditoría cubiertos**: REQ-002, REQ-029, CI-004, SA-06

## Objetivo

Escribir tests de contrato XCTest que capturen el comportamiento actual de la validación de configuración, validación de integridad de assets, cálculo de tamaño de ficheros y limpieza de paths para que sirvan como red de seguridad durante la extracción.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección:
- **3.1.4** — DownloadsModule2: Validación y ficheros

Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `ios/Downloads_v2/DownloadsModule2.swift` — funciones: `validateDownloadConfig()`, `validateAssetIntegrity()`, `validateAssetIntegrityRelaxed()`, `validateDownloadUri()`, `calculateAssetSize()`, `calculateDirectorySize()`, manejo inline de `/.nofollow`

### Ficheros de test a crear

- `ios/Tests/DownloadValidationTests.swift` — Tests de validación y operaciones de ficheros

### Fuera de alcance

- NO modificar código de producción
- NO testear CRUD (tarea 01), persistencia (tarea 02), ni DRM (tarea 04)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `validateDownloadConfig()` | Dict con id+uri+title → true | Dict con campos extra → true | Dict sin id → false, vacío → false | Siempre devuelve Bool |
| `validateAssetIntegrity()` | Dir con ficheros >1MB → valid | Dir vacío → invalid | Path inexistente → invalid | — |
| `validateAssetIntegrityRelaxed()` | Dir con ficheros → valid | Dir vacío → invalid | — | Menos estricta que la normal |
| `validateDownloadUri()` | HLS → (true, stream) | MP4 → (true, binary) | URI inválida → (false, _) | — |
| `calculateAssetSize()` | Fichero 1KB → 1024 | Dir con 3 ficheros → suma | — | Siempre >= 0 |
| `calculateDirectorySize()` | Dir con ficheros → suma correcta | Dir vacío → 0 | — | — |
| Limpieza `/.nofollow` | Path con prefijo → limpio | Path sin prefijo → sin cambio | Path vacío → vacío | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función tiene al menos: caso normal, caso límite, caso error
- [ ] Los tests crean ficheros temporales para validación de integridad y cálculo de tamaño
- [ ] Los tests limpian ficheros temporales en `tearDown()`
- [ ] Los tests son independientes entre sí
- [ ] El comando `xcodebuild test -scheme react-native-video -only-testing:DownloadValidationTests` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- Tarea 07 (extraer DownloadFileManager)
- Tarea 08 (extraer DownloadValidator)
- Tarea 14 (extraer DownloadSessionDelegate)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Las funciones de validación e integridad son privadas. Necesitan acceso vía `@testable import` o test indirecto.
- **Mitigación**: Testear la lógica de forma aislada reproduciendo el patrón (como hace la sección 3.1.4 de la auditoría) en vez de llamar a los métodos privados directamente.

## Estimación

1-2 horas

## Notas

- Los tests de `calculateAssetSize` y `calculateDirectorySize` necesitan crear directorios temporales con ficheros de tamaño conocido.
- El test de limpieza `/.nofollow` reproduce la lógica inline actual para verificar que la centralización futura (en `DownloadFileManager.cleanPath()`) produce los mismos resultados.
