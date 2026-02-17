# Tarea: Extraer BufferConfigManager

> Tarea 15 de 22 | Fase D: Extracciones riesgo medio (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene la clase interna `RNVLoadControl` (~150 líneas) que extiende `DefaultLoadControl` con lógica de buffering basada en memoria disponible. Como clase interna, no es testeable aisladamente y contribuye al tamaño del God Object. La auditoría lo identifica como CI-006.

**IDs de auditoría relacionados**: REQ-003, CI-006

## Objetivo

Extraer la configuración de buffering y la clase `RNVLoadControl` a una clase `BufferConfigManager` independiente y testeable.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - Clase interna `RNVLoadControl` (líneas ~350-500, ~150 líneas)
  - `setBufferConfig()` (líneas ~2683-2696)
  - `setBufferingStrategy()` (líneas ~2598-2608)
- `android/src/main/java/com/brentvatne/exoplayer/buffer/BufferConfigManager.java` — nuevo fichero

### Fuera de alcance

- NO cambiar la lógica de `shouldContinueLoading()` ni `calculateFreeHeapInPercent()`
- NO resolver NC-012 (setBufferConfig reinicia player) — es limitación de ExoPlayer

## Requisitos funcionales

1. **[REQ-003]**: La configuración de buffering (min/max buffer, back buffer, heap allocation) debe funcionar idénticamente.

## Requisitos técnicos

1. Clase con estado (configuración de buffer)
2. Interfaz pública:
```java
public class BufferConfigManager {
    BufferConfigManager();
    void setBufferConfig(ReadableMap config);
    void setBufferingStrategy(ReadableMap strategy);
    LoadControl buildLoadControl();
    boolean needsPlayerRestart();
    void clearRestartFlag();
}
```
3. En `initializePlayerCore()`, reemplazar `new RNVLoadControl(...)` por `bufferConfigManager.buildLoadControl()`
4. Los setters en `ReactExoplayerViewManager` delegan a `bufferConfigManager`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `RNVLoadControl` ya no es clase interna de `ReactExoplayerView`
- [ ] `setBufferConfig()` y `setBufferingStrategy()` ya no existen en `ReactExoplayerView`
- [ ] El buffering se comporta igual que antes

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `BufferConfigManager` cubren: buildLoadControl con config por defecto, buildLoadControl con config personalizada, needsPlayerRestart

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 16: Extraer PlayerDrmManager (indirectamente, reduce complejidad del orquestador)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: `RNVLoadControl.shouldContinueLoading()` accede a `bufferingStrategy` que es estado del orquestador. Hay que mover ese estado al `BufferConfigManager`.
- **Mitigación**: mover los campos de configuración de buffer al manager
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
