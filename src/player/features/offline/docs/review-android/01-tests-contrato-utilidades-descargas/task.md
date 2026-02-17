# Tarea: Tests de contrato — Utilidades de descargas

> Tarea 01 de 22 | Fase A: Red de seguridad
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule2.java` contiene lógica de clasificación de errores, cálculo de estadísticas y selección de tracks que se va a extraer a clases independientes en la Fase B. Antes de mover nada, necesitamos tests que capturen el comportamiento actual de estas funciones.

**IDs de auditoría cubiertos**: REQ-022, REQ-028, REQ-032

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual de las utilidades de descarga (clasificación de errores, cálculo de stats, selección de tracks) para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto para este grupo en las secciones:
- **3.1.1** — Tests para DownloadErrorClassifier
- **3.1.2** — Tests para DownloadStatsCalculator
- **3.1.3** — Tests para DownloadTrackSelector

Usar ese código como punto de partida. Adaptarlo si es necesario para que compile y ejecute correctamente contra el código actual (las funciones aún están dentro de `DownloadsModule2.java`).

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java`:
  - `isNoSpaceLeftError()` (líneas ~1882-1935)
  - `mapDownloadState()` (líneas ~1169-1179)
  - `calculateAccurateTotalBytes()` (líneas ~1309-1383)
  - `calculateDownloadSpeed()` (líneas ~1385-1421)
  - `estimateRemainingTime()` (líneas ~1423-1443)
  - `selectQualityTracks()` (líneas ~2081-2141)
  - `selectVideoTrackByBitrate()` (líneas ~2250-2308)
  - `selectAllAudioTracks()` (líneas ~2193-2245)

### Ficheros de test a crear

- `android/src/test/java/com/brentvatne/react/downloads/DownloadErrorClassifierTest.java`
- `android/src/test/java/com/brentvatne/react/downloads/DownloadStatsCalculatorTest.java`
- `android/src/test/java/com/brentvatne/react/downloads/DownloadTrackSelectorTest.java`

### Fuera de alcance

- NO modificar código de producción en esta tarea
- NO refactorizar nada, solo testear el estado actual
- Si el código actual tiene bugs, documentarlos como tests que verifican el comportamiento actual (aunque sea incorrecto), no como tests que fallan

## Cobertura requerida

### DownloadErrorClassifier (mapDownloadState + isNoSpaceLeftError)

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `mapDownloadState()` | Cada estado válido → string correcto | Valor desconocido (999) → "UNKNOWN" | — | Siempre retorna un String no-null |
| `isNoSpaceLeftError()` | Mensajes conocidos → true | Causa encadenada con ENOSPC → true | null → false, null message → false | Nunca lanza excepción |

### DownloadStatsCalculator

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `calculateAccurateTotalBytes()` | Content length conocido → reportado o estimado | LENGTH_UNSET sin progreso → 0 | Content length 0 → 0 | Retorno >= 0 |
| `calculateDownloadSpeed()` | Segunda llamada → velocidad positiva | Primera llamada → 0 | Sin bytes nuevos → >= 0 | Retorno >= 0 |
| `estimateRemainingTime()` | Progreso parcial con velocidad → tiempo positivo | Progreso 100% → 0 | Sin velocidad → 0 | Retorno >= 0 |

### DownloadTrackSelector

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `selectQualityTracks()` | "low"/"medium"/"high" → selecciona track correcto | "auto" → selecciona todos los audio | "unknown" → se comporta como "auto" | No lanza excepción |
| Constantes de bitrate | — | — | — | LOW=1.5M, MEDIUM=3M, HIGH=6M |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas (reflejan dependencias reales, no stubs vacíos)
- [ ] Los tests son independientes entre sí (no dependen de orden de ejecución)
- [ ] El comando `./gradlew :react-native-video:test --tests "com.brentvatne.react.downloads.*"` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Tarea 04: Setup infraestructura de tests

### Tareas que dependen de esta
- Tarea 05: Extraer DownloadErrorClassifier
- Tarea 06: Extraer DownloadStatsCalculator
- Tarea 07: Extraer DownloadTrackSelector
- Tarea 20: Eliminar DownloadsModule v1

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que los métodos sean `private` y no accesibles desde tests. En ese caso, usar reflection o crear wrappers temporales.
- **Mitigación**: verificar visibilidad de los métodos antes de escribir tests. Si son private, cambiar a package-private (único cambio permitido en producción).

## Estimación

2-3 horas

## Notas

- Los métodos `calculateDownloadSpeed()` y `estimateRemainingTime()` en el código actual son stubs que devuelven 0. Los tests deben reflejar este comportamiento actual (retornan 0), no el comportamiento esperado.
- `DownloadTrackSelector` requiere Robolectric por el uso de `Context` en `selectQualityTracks()`.
- Si los métodos son `private`, el cambio mínimo permitido es cambiarlos a package-private (`/* package */`) para hacerlos testeables. Documentar este cambio.
