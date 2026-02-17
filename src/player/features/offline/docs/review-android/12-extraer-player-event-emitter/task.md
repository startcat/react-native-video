# Tarea: Extraer PlayerEventEmitter

> Tarea 12 de 22 | Fase D: Extracciones riesgo medio (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene ~30 puntos de emisión de eventos dispersos por todo el fichero, todos usando `eventEmitter.receiveEvent()` directamente. Centralizar la emisión en una clase dedicada reduce el acoplamiento del God Object y facilita las extracciones posteriores de DRM, Ads y Analytics (que necesitan emitir eventos).

**IDs de auditoría relacionados**: REQ-007

## Objetivo

Extraer toda la emisión de eventos hacia React Native a una clase `PlayerEventEmitter` que encapsule la construcción de payloads y la comunicación con `RCTEventEmitter`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — reemplazar ~30 llamadas directas a `eventEmitter.receiveEvent()` por métodos del nuevo `PlayerEventEmitter`
- `android/src/main/java/com/brentvatne/exoplayer/events/PlayerEventEmitter.java` — nuevo fichero

### Fuera de alcance

- NO cambiar los payloads de los eventos (los `WritableMap` deben ser idénticos)
- NO cambiar los nombres de los eventos
- NO tocar `DownloadsModule2` (tiene su propio sistema de eventos vía `RCTDeviceEventEmitter`)

## Requisitos funcionales

1. **[REQ-007]**: Todos los eventos de reproducción (loadStart, load, buffer, progress, seek, end, error, fullscreen, playbackState, etc.) deben llegar al JS con los mismos payloads que antes.

## Requisitos técnicos

1. Clase con métodos tipados para cada evento
2. Interfaz pública (ver sección 2.1, Unidad 7 de la auditoría):
```java
public class PlayerEventEmitter {
    PlayerEventEmitter(ThemedReactContext context, int viewId);
    void onVideoLoadStart();
    void onVideoLoad(WritableMap videoInfo);
    void onVideoBuffer(boolean isBuffering);
    void onVideoProgress(double currentTime, double playableDuration, double seekableDuration);
    void onVideoSeek(double currentTime, double seekTime);
    void onVideoEnd();
    void onVideoError(String errorString, Exception exception, String errorCode);
    // ... (todos los eventos identificados en la auditoría)
}
```
3. `ReactExoplayerView` mantiene `private PlayerEventEmitter emitter`
4. Máximo 4 ficheros de producción modificados

## Cambios de contrato

- **Ninguno** — los eventos emitidos al JS deben ser idénticos en nombre y payload.

## Criterios de aceptación

### Funcionales
- [ ] No hay llamadas directas a `eventEmitter.receiveEvent()` en `ReactExoplayerView.java` (excepto si `PlayerEventEmitter` las encapsula)
- [ ] Todos los eventos llegan al JS con los mismos payloads
- [ ] `ReactExoplayerView.java` se reduce en ~150 líneas

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `PlayerEventEmitter` verifican que cada método construye el payload correcto

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- No hay tests de contrato directos para la emisión de eventos (requiere Android Context)

### Tests nuevos a crear

- `android/src/test/java/com/brentvatne/exoplayer/events/PlayerEventEmitterTest.java`:
  - Test: `onVideoLoadStart()` emite evento con nombre correcto
  - Test: `onVideoError()` construye payload con errorString, exception message, errorCode
  - Test: `onVideoProgress()` construye payload con currentTime, playableDuration, seekableDuration

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 16: Extraer PlayerDrmManager (necesita emitir errores DRM)
- Tarea 17: Extraer PlayerAdsManager (necesita emitir eventos de ads)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: hay ~30 puntos de emisión dispersos. Olvidar migrar uno causaría que un evento deje de emitirse.
- **Mitigación**: buscar exhaustivamente `receiveEvent` y `eventEmitter` en `ReactExoplayerView.java` antes y después de la migración. Verificar que el count es 0 después.
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas

## Notas

- Algunos eventos se emiten desde callbacks anónimos (listeners de ads, DRM). Verificar que el `PlayerEventEmitter` es accesible desde esos contextos.
- El `viewId` necesario para `receiveEvent()` se pasa en el constructor.
