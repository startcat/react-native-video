# Tarea: Tests de contrato — DRM y DataStructures

> Tarea 4 de 20 | Fase A: Red de seguridad
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`ContentKeyManager.swift` (772 líneas) gestiona DRM FairPlay y persiste claves en disco. Los DataStructures (`VideoSource`, `DRMParams`, `TextTrack`, `YouboraParams`, `Chapter`) parsean `NSDictionary` de React Native. Antes de extraer `ContentKeyPersistence`, `FPSCertificateProvider` y corregir NC-006 (force unwrap en YouboraParams), necesitamos tests que capturen el comportamiento actual.

**IDs de auditoría cubiertos**: REQ-020, REQ-025, REQ-026, REQ-027, PARSE-001, PARSE-002, PARSE-003, PARSE-004, STATE-001, STATE-002

## Objetivo

Escribir tests de contrato XCTest que capturen el comportamiento actual de la persistencia de claves DRM, el enum `DownloadState`, la serialización de `DownloadInfo`, y el parseo de DataStructures desde `NSDictionary`.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en las secciones:
- **3.1.5** — ContentKeyManager: Persistencia de claves
- **3.1.6** — DownloadState: Enum
- **3.1.8** — DataStructures: Parseo de NSDictionary
- **3.1.9** — DownloadInfo: Serialización

Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `ios/Managers/ContentKeyManager.swift` — funciones: `writePersistableContentKey()`, `deletePeristableContentKey()`, `deleteAllPeristableContentKeys()`, propiedad `contentKeyDirectory`
- `ios/Downloads_v2/DownloadsModule2.swift` — enum `DownloadState`, struct `DownloadInfo`, función `createDownloadInfoDict()`
- `ios/Video/DataStructures/VideoSource.swift` — init desde NSDictionary
- `ios/Video/DataStructures/DRMParams.swift` — init desde NSDictionary
- `ios/Video/DataStructures/TextTrack.swift` — init desde NSDictionary
- `ios/Video/DataStructures/YouboraParams.swift` — init desde NSDictionary
- `ios/Video/DataStructures/Chapter.swift` — init desde NSDictionary

### Ficheros de test a crear

- `ios/Tests/ContentKeyPersistenceTests.swift` — Tests de persistencia de claves FairPlay
- `ios/Tests/DownloadStateTests.swift` — Tests del enum DownloadState
- `ios/Tests/DataStructureParsingTests.swift` — Tests de parseo de DataStructures
- `ios/Tests/DownloadInfoSerializationTests.swift` — Tests de serialización

### Fuera de alcance

- NO modificar código de producción
- NO testear CRUD (tarea 01), persistencia UserDefaults (tarea 02), ni validación (tarea 03)
- NO testear la obtención de certificados FPS ni solicitudes de CKC al KSM (requieren red real)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `writePersistableContentKey()` | Write → read → datos coinciden | — | — | — |
| `deletePeristableContentKey()` | Write → delete → not exists | Delete sin write → no crash | — | — |
| `deleteAllPeristableContentKeys()` | Write 3 → deleteAll → none exist | — | — | — |
| `DownloadState.stringValue` | Todos los casos → string no vacío | — | — | Roundtrip, unicidad |
| `VideoSource(NSDictionary)` | Dict completo → campos correctos | nil dict → defaults | id como Int → String | — |
| `DRMParams(NSDictionary)` | Dict completo → campos correctos | nil dict → all nil | Con headers → parsea | — |
| `TextTrack(NSDictionary)` | Dict completo → campos correctos | Con index explícito → usa index | — | — |
| `YouboraParams(NSDictionary)` | Dict completo → campos correctos | — | Sin contentIsLive → **CRASH** (documenta NC-006) | — |
| `Chapter(NSDictionary)` | Dict completo → campos correctos | nil dict → defaults | — | — |
| `createDownloadInfoDict()` | Completed → progress 100 | Downloading 45% → progress 45 | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/struct tiene al menos: caso normal, caso límite, caso error
- [ ] Los tests de ContentKey usan directorio temporal, no el directorio real de claves
- [ ] El test de YouboraParams sin `contentIsLive` está comentado con nota explicando NC-006 (force unwrap crash)
- [ ] Los tests son independientes entre sí
- [ ] El comando `xcodebuild test` para estos tests pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- Tarea 10 (fix force unwrap YouboraParams NC-006)
- Tarea 15 (extraer DownloadDRMManager)
- Tarea 16 (extraer ContentKeyPersistence + FPSCertificateProvider)
- Tarea 19 (refactorizar ContentKeyManager)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `ContentKeyManager` es un singleton. Los tests deben tener cuidado de no contaminar estado entre tests.
- **Mitigación**: Usar directorio temporal para claves. No tocar el singleton directamente; testear la lógica de persistencia de forma aislada (como hace la sección 3.1.5 de la auditoría).

## Estimación

1-2 horas

## Notas

- El test de `YouboraParams` sin `contentIsLive` documenta el bug NC-006 (force unwrap crash). Debe estar comentado con una nota clara explicando que es un bug conocido que se corregirá en la tarea 10.
- Los tests de `ContentKeyPersistence` crean un directorio temporal y escriben/leen ficheros `.key` directamente, sin pasar por el singleton `ContentKeyManager`.
- Los DataStructures son structs simples con init desde `NSDictionary`. Son los tests más directos de esta tarea.
