# Tarea: Extraer PlayerDrmManager

> Tarea 16 de 22 | Fase E: Extracciones riesgo alto (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene toda la gestión de DRM (online y offline) dispersa en ~200 líneas y ~12 campos mutables. La lógica de DRM incluye construcción de `DrmSessionManager`, inicialización offline con licencias persistentes, retry L1→L3, y múltiples setters de configuración. La auditoría identifica acoplamiento fuerte entre DRM online y offline (sección 1.2).

**IDs de auditoría relacionados**: REQ-012, REQ-013, REQ-014

## Objetivo

Extraer toda la gestión de DRM a una clase `PlayerDrmManager` que encapsule la configuración, inicialización y retry de DRM sessions.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - `initializePlayerDrm()` (líneas ~998-1046)
  - `buildDrmSessionManager()` (líneas ~1274-1312)
  - Setters: `setDrmType()`, `setDrmLicenseUrl()`, `setDrmLicenseHeader()`, `setPlayOffline()`, `setMultiSession()`
  - Campos: `drmUUID`, `drmLicenseUrl`, `drmLicenseHeader`, `mDrmSessionManager`, `mOfflineLicenseManager`, `hasDrmFailed`, `playOffline`, `multiSession`
  - Lógica de retry DRM en `onPlayerError()` (líneas ~2093-2106)
- `android/src/main/java/com/brentvatne/exoplayer/drm/PlayerDrmManager.java` — nuevo fichero

### Fuera de alcance

- NO modificar `OfflineLicenseManager` ni las tareas de licencia (AsyncTask)
- NO implementar NC-007 (renewLicense/releaseAllLicenses vacíos)

## Requisitos funcionales

1. **[REQ-012]**: Reproducción con DRM Widevine online debe funcionar idénticamente
2. **[REQ-013]**: Retry DRM L1→L3 debe funcionar idénticamente
3. **[REQ-014]**: Reproducción offline con licencia persistente debe funcionar idénticamente

## Requisitos técnicos

1. Clase con estado (configuración DRM)
2. Interfaz pública (ver sección 2.1, Unidad 1 de la auditoría)
3. Recibe `PlayerEventEmitter` para emitir errores DRM (dependencia de tarea 12)
4. `ReactExoplayerView` crea instancia en constructor
5. Máximo 4 ficheros de producción modificados

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Los ~12 campos de DRM ya no existen en `ReactExoplayerView.java`
- [ ] `initializePlayerDrm()` y `buildDrmSessionManager()` ya no existen en `ReactExoplayerView.java`
- [ ] Contenido Widevine online se reproduce correctamente
- [ ] Contenido offline con licencia persistente se reproduce correctamente
- [ ] Retry DRM L1→L3 funciona ante primer fallo

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `PlayerDrmManager` cubren: buildDrmSessionManager con/sin DRM, retry L1→L3, path offline

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- No hay tests de contrato directos (DRM requiere `MediaDrm` que no es mockeable fácilmente)

### Tests nuevos a crear

- `android/src/test/java/com/brentvatne/exoplayer/drm/PlayerDrmManagerTest.java`:
  - Test: sin DRM configurado → retorna null
  - Test: `hasDrmFailed()` retorna false inicialmente
  - Test: `resetDrmFailure()` resetea el flag
  - Test: setters almacenan configuración correctamente

## Dependencias

### Tareas previas requeridas
- Tarea 12: PlayerEventEmitter (para emitir errores DRM)
- Tarea 13: MediaSourceBuilder (para construir source con DRM)
- Tarea 15: BufferConfigManager (reduce complejidad del orquestador)

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: medio-alto
- **Principal riesgo**: la gestión de DRM es crítica para contenido protegido. Un error puede hacer que todo el contenido DRM deje de reproducirse.
- **Mitigación**: validar exhaustivamente con contenido Widevine online y offline. Mantener la lógica exacta sin cambios internos.
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas

## Notas

- `initializePlayerDrm()` retorna `null` para defer cuando necesita licencia offline. Este patrón de "retorna null y continúa vía callback" debe mantenerse exactamente.
- Verificar que `IOfflineLicenseManagerListener` callbacks en `ReactExoplayerView` se delegan correctamente al `PlayerDrmManager`.
- La auditoría marca como "Pendiente de confirmar" si los callbacks de `IOfflineLicenseManagerListener` están implementados en `ReactExoplayerView`. Verificar en `/verify`.
