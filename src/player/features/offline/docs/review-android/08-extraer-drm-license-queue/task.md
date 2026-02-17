# Tarea: Extraer DrmLicenseQueue

> Tarea 08 de 22 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule2.java` implementa una cola serializada de descargas de licencias DRM para evitar race conditions cuando se descargan múltiples contenidos simultáneamente. Esta lógica (~70 líneas + campos de estado) puede encapsularse en una clase independiente con sincronización propia.

**IDs de auditoría relacionados**: REQ-019

## Objetivo

Extraer la cola de descargas de licencias DRM a una clase `DrmLicenseQueue` independiente de `DownloadsModule2`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — extraer:
  - `enqueueLicenseDownload()` (líneas ~1615-1619)
  - `processNextLicenseDownload()` (líneas ~1621-1629)
  - `onLicenseDownloadComplete()` (líneas ~1631-1634)
  - `downloadLicenseForItem()` (líneas ~1636-1680)
  - Campos: `pendingLicenseDownloads`, `isDownloadingLicense`, `activeDrmMessages`
- `android/src/main/java/com/brentvatne/react/downloads/DrmLicenseQueue.java` — nuevo fichero

### Fuera de alcance

- NO modificar `OfflineLicenseManager`
- NO implementar `renewLicense()` ni `releaseAllLicenses()` (NC-007, tarea separada si se decide)

## Requisitos funcionales

1. **[REQ-019]**: Las licencias se descargan secuencialmente. Si se encolan 3 descargas, la segunda espera a que termine la primera, y la tercera espera a la segunda.

## Requisitos técnicos

1. Clase con sincronización (`synchronized` en métodos públicos)
2. Interfaz pública:
```java
public class DrmLicenseQueue {
    DrmLicenseQueue(OfflineLicenseManager licenseManager);
    synchronized void enqueue(MediaItem mediaItem, Map<String, String> drmMessages);
    synchronized void onCurrentDownloadComplete();
    int getPendingCount();
    boolean isProcessing();
    void clear();
}
```
3. `DownloadsModule2` crea instancia en `moduleInit()`: `drmLicenseQueue = new DrmLicenseQueue(mLicenseManager)`
4. En `addDownload()`, reemplazar `enqueueLicenseDownload(mediaItem)` por `drmLicenseQueue.enqueue(mediaItem, activeDrmMessages)`
5. En callbacks `onLicenseDownloaded*` y `onLicenseDownloadFailed`, llamar `drmLicenseQueue.onCurrentDownloadComplete()`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Los 4 métodos de cola ya no existen en `DownloadsModule2.java`
- [ ] Los campos `pendingLicenseDownloads` e `isDownloadingLicense` ya no existen en `DownloadsModule2.java`
- [ ] `addDownload()` delega a `drmLicenseQueue.enqueue()`
- [ ] Los callbacks de licencia llaman `drmLicenseQueue.onCurrentDownloadComplete()`

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos cubren: enqueue single → descarga inmediata, enqueue doble → segundo espera, onComplete → procesa siguiente, clear → vacía cola, sin DRM → no descarga

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DrmLicenseQueueTest.java` — valida procesamiento serial, clear, items sin DRM

### Tests nuevos a crear

- Ampliar `DrmLicenseQueueTest.java` si falta cobertura para: error en licenseManager no bloquea cola, 3+ items procesados en orden

## Dependencias

### Tareas previas requeridas
- Tarea 02 (Fase A): tests de contrato de utilidades DRM
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 20: Eliminar DownloadsModule v1

## Riesgo

- **Nivel**: bajo-medio
- **Principal riesgo**: la sincronización (`synchronized`) puede causar deadlocks si se llama desde callbacks en threads diferentes
- **Mitigación**: los tests verifican el flujo serial. Verificar que los callbacks de `OfflineLicenseManager` se ejecutan en el main thread.
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
