# Tarea: Fix wait() sin timeout en initializePlayerSource

> Tarea 09 de 22 | Fase C: Correcciones críticas
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene un `while (player == null) { wait(); }` sin timeout en `initializePlayerSource()` (líneas ~1123-1130). Si `player` nunca se asigna (error en inicialización), el thread queda bloqueado indefinidamente, causando ANR. La auditoría lo identifica como NC-002 con prioridad **crítica**.

**IDs de auditoría relacionados**: NC-002, REQ-001

## Objetivo

Añadir un timeout al `wait()` para evitar bloqueos indefinidos, emitiendo un error al JS si se supera el timeout.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — `initializePlayerSource()` (líneas ~1123-1130)

### Fuera de alcance

- NO refactorizar `initializePlayerSource()` completo
- NO cambiar el flujo de inicialización del player

## Requisitos funcionales

1. **[NC-002]**: Si `player` no se asigna en 10 segundos, el thread se desbloquea y se emite un error al JS.

## Requisitos técnicos

1. Cambiar `wait()` por `wait(10_000)` (10 segundos)
2. Después del bucle, verificar si `player` sigue siendo null
3. Si es null, emitir error vía `eventEmitter` y retornar sin preparar el source
4. Añadir logging del timeout para diagnóstico

## Cambios de contrato

- **[NC-002]**: Antes, el thread se bloqueaba indefinidamente. Ahora, se desbloquea tras 10 segundos y emite error. Esto es un cambio de comportamiento intencional (de "hang forever" a "fail with error").

## Criterios de aceptación

### Funcionales
- [ ] `initializePlayerSource()` tiene `wait(10_000)` en lugar de `wait()`
- [ ] Si `player == null` después del timeout, se emite error al JS
- [ ] El thread no queda bloqueado indefinidamente

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] No hay tests de contrato directos para este caso (no era testeable unitariamente)

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- No hay tests de contrato directos (la inicialización del player requiere Android Context completo)

### Tests nuevos a crear

- No se crean tests unitarios (requiere instrumentación Android). Validar manualmente.

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): infraestructura de tests (para validar regresión)

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: el timeout de 10 segundos puede ser demasiado corto en dispositivos lentos con contenido DRM complejo
- **Mitigación**: 10 segundos es conservador. Si se reportan timeouts en producción, aumentar a 15-20 segundos.
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1 hora

## Notas

- El `wait()` actual está dentro de un bloque `synchronized`. El timeout no cambia la semántica de sincronización.
- Verificar que `notifyAll()` se llama correctamente cuando `player` se asigna (debería estar en `initializePlayerCore()`).
