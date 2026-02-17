# Tarea: Tests de contrato — Utilidades DRM y licencias

> Tarea 02 de 22 | Fase A: Red de seguridad
> Plan de refactorización de Android Native Module

## Contexto

El paquete `license/internal/utils/` contiene utilidades puras para DRM que se usan en las tareas de licencia (AsyncTask) y en `DownloadsModule2`. La cola de licencias DRM (`enqueueLicenseDownload`, `processNextLicenseDownload`) se extraerá a `DrmLicenseQueue`. Necesitamos tests que capturen el comportamiento actual antes de mover código.

**IDs de auditoría cubiertos**: REQ-015, REQ-016, REQ-017, REQ-019

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual de las utilidades DRM (`DrmUtils`, `LicenseFileUtils`, `Utility`) y la lógica de cola de licencias para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en las secciones:
- **3.1.4** — Tests para DrmLicenseQueue
- **3.1.6** — Tests para DrmUtils
- **3.1.7** — Tests para LicenseFileUtils
- **3.1.8** — Tests para Utility

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `android/src/main/java/com/brentvatne/license/internal/utils/DrmUtils.java` — `parseDrmMessage()`, `getSchemeMimeType()`
- `android/src/main/java/com/brentvatne/license/internal/utils/LicenseFileUtils.java` — `writeKeySetId()`, `readKeySetId()`, `deleteKeySetId()`, `deleteAllKeySetIds()`, `listKeySetIds()`
- `android/src/main/java/com/brentvatne/util/Utility.java` — `getDrmScheme()`, `getCurrentTimeString()`
- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — `enqueueLicenseDownload()`, `processNextLicenseDownload()`, `onLicenseDownloadComplete()`, `downloadLicenseForItem()` (líneas ~1615-1680)

### Ficheros de test a crear

- `android/src/test/java/com/brentvatne/license/internal/utils/DrmUtilsTest.java`
- `android/src/test/java/com/brentvatne/license/internal/utils/LicenseFileUtilsTest.java`
- `android/src/test/java/com/brentvatne/util/UtilityTest.java`
- `android/src/test/java/com/brentvatne/react/downloads/DrmLicenseQueueTest.java`

### Fuera de alcance

- NO modificar código de producción
- NO testear `LicenceDownloadTask`, `LicenseCheckTask`, etc. (requieren `MediaDrm`, no testeables unitariamente)
- NO testear `OfflineLicenseManager` directamente (depende de AsyncTask y Android APIs)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `DrmUtils.parseDrmMessage()` | JSON válido → DrmMessage | String vacío → null | JSON inválido → null, null → null | Nunca lanza excepción |
| `DrmUtils.getSchemeMimeType()` | Widevine UUID → "video/mp4" | — | — | — |
| `LicenseFileUtils.writeKeySetId()` + `readKeySetId()` | Round-trip → bytes idénticos | Crea directorio si no existe | — | — |
| `LicenseFileUtils.deleteKeySetId()` | Fichero existente → eliminado | Fichero inexistente → no lanza | — | — |
| `LicenseFileUtils.deleteAllKeySetIds()` | Múltiples ficheros → todos eliminados | — | — | — |
| `Utility.getDrmScheme()` | Widevine → "widevine", Playready → "playready" | UUID desconocido → null | — | — |
| `Utility.getCurrentTimeString()` | — | — | — | Retorna string no vacío |
| Cola de licencias (enqueue/process) | 1 item → descarga inmediata | 2 items → segundo espera | clear → vacía cola | Procesamiento serial |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas
- [ ] Los tests son independientes entre sí
- [ ] El comando `./gradlew :react-native-video:test --tests "com.brentvatne.license.*" --tests "com.brentvatne.util.*" --tests "com.brentvatne.react.downloads.DrmLicenseQueueTest"` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Tarea 04: Setup infraestructura de tests

### Tareas que dependen de esta
- Tarea 08: Extraer DrmLicenseQueue

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `LicenseFileUtils` puede tener dependencias de filesystem Android que no funcionen en JVM puro. Usar `TemporaryFolder` de JUnit.
- **Mitigación**: `LicenseFileUtils` usa `java.io.File` estándar, debería funcionar sin Robolectric.

## Estimación

2-3 horas

## Notas

- Los tests de `DrmLicenseQueue` testean la lógica de cola que actualmente está inline en `DownloadsModule2`. Como la cola aún no existe como clase separada, los tests se escriben contra la interfaz propuesta y se adaptarán cuando se extraiga la clase en la tarea 08.
- `LicenseFileUtils.setStoragePath()` debe llamarse en `@Before` con un directorio temporal.
