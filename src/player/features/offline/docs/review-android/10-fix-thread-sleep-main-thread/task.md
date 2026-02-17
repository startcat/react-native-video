# Tarea: Fix Thread.sleep() en main thread

> Tarea 10 de 22 | Fase C: Correcciones críticas
> Plan de refactorización de Android Native Module

## Contexto

`AxOfflineManager.java` contiene `Thread.sleep(500)` en `reinitializeDownloadManager()` (línea ~214). Si se ejecuta en el main thread, bloquea la UI 500ms y puede causar ANR. La auditoría lo identifica como NC-003 con prioridad **alta**.

**IDs de auditoría relacionados**: NC-003, REQ-020

## Objetivo

Reemplazar `Thread.sleep(500)` por `Handler.postDelayed()` para no bloquear el thread actual.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/offline/AxOfflineManager.java` — `reinitializeDownloadManager()` (líneas ~187-223)

### Fuera de alcance

- NO refactorizar `AxOfflineManager` completo
- NO resolver NC-004 (listener no eliminado) — tarea separada si se decide

## Requisitos funcionales

1. **[NC-003]**: `reinitializeDownloadManager()` no debe bloquear el thread actual.

## Requisitos técnicos

1. Reemplazar `Thread.sleep(500)` por ejecución asíncrona con `Handler.postDelayed()`
2. La lógica posterior al sleep debe ejecutarse en el callback del delay
3. Mantener el mismo delay de 500ms

## Cambios de contrato

- **[NC-003]**: El método ya no es síncrono. El código que se ejecutaba después del sleep ahora se ejecuta en un callback. Verificar que no hay código que dependa de la ejecución síncrona.

## Criterios de aceptación

### Funcionales
- [ ] No hay `Thread.sleep()` en `AxOfflineManager.java`
- [ ] La reinicialización sigue funcionando con el mismo delay de 500ms
- [ ] El main thread no se bloquea

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: si hay código que asume ejecución síncrona después de `reinitializeDownloadManager()`, puede fallar
- **Mitigación**: buscar todas las llamadas a `reinitializeDownloadManager()` y verificar que no dependen de la ejecución síncrona
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1 hora
