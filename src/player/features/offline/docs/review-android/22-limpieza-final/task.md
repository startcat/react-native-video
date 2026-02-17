# Tarea: Limpieza final — logging, código muerto y comentarios

> Tarea 22 de 22 | Fase F: Eliminación y consolidación
> Plan de refactorización de Android Native Module

## Contexto

La auditoría identifica varias fuentes de complejidad innecesaria de baja prioridad que se resuelven mejor como limpieza final: logging excesivo sin flag de debug (CI-004), broadcast dentro de `getForegroundNotification()` (CI-007), comentario de cliente específico (CI-008), y `generateUniqueId()` con hashCode (CI-009).

**IDs de auditoría relacionados**: CI-004, CI-007, CI-008, CI-009

## Objetivo

Limpiar código muerto, condicionar logging a `BuildConfig.DEBUG`, separar responsabilidades en `AxDownloadService`, y eliminar referencias a clientes específicos.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/offline/AxDownloadTracker.java` — condicionar ~40 líneas de `Log.d()` a `BuildConfig.DEBUG`
- `android/src/main/java/com/brentvatne/offline/AxDownloadService.java` — condicionar ~30 líneas de logging + extraer broadcast de `getForegroundNotification()`
- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — condicionar ~50 líneas de logging en `onPrepared()`
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — condicionar `Log.i("Downloads", ...)` dispersos
- `android/src/main/java/com/brentvatne/license/internal/task/LicenceDownloadTask.java` — eliminar comentario "DML: No usamos token en Primeran" (línea ~257) y código comentado asociado

### Fuera de alcance

- NO cambiar `generateUniqueId()` si se usa desde JS (verificar primero)
- NO eliminar `Log.e()` ni `Log.w()` — solo condicionar `Log.d()` y `Log.i()`
- NO cambiar comportamiento funcional

## Requisitos funcionales

- Ningún cambio funcional. Solo limpieza de código.

## Requisitos técnicos

1. Patrón para logging condicional:
```java
if (BuildConfig.DEBUG) {
    Log.d(TAG, "...");
}
```
2. En `AxDownloadService.getForegroundNotification()`: extraer la emisión de broadcast a un método separado `emitProgressBroadcast()` llamado desde el mismo punto
3. Eliminar código comentado y referencia a "Primeran" en `LicenceDownloadTask.java`

## Cambios de contrato

- **Ninguno** — solo limpieza interna.

## Criterios de aceptación

### Funcionales
- [ ] No hay `Log.d()` ni `Log.i()` sin condicionar a `BuildConfig.DEBUG` en los ficheros afectados
- [ ] `getForegroundNotification()` solo construye la notificación (el broadcast está en método separado)
- [ ] No hay referencias a "Primeran" ni código comentado de validación DRM
- [ ] El comportamiento funcional es idéntico

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- Todos los tests de contrato — esta tarea no debe romper nada

### Tests nuevos a crear

- Ninguno (limpieza sin cambio funcional)

## Dependencias

### Tareas previas requeridas
- Tarea 20: Eliminar DownloadsModule v1
- Tarea 21: Consolidar MPD failure logic

### Tareas que dependen de esta
- Ninguna (última tarea del plan)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: condicionar logging puede ocultar información útil para debugging en producción
- **Mitigación**: mantener `Log.e()` y `Log.w()` incondicionales. Solo condicionar `Log.d()` y `Log.i()`.
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas

## Notas

- Verificar si `generateUniqueId()` se usa desde JS antes de modificarlo: `grep -r "generateDownloadId\|generateUniqueId" src/`. Si no se usa, eliminarlo. Si se usa, reemplazar por `UUID.randomUUID().toString()`.
- CI-010 (parámetro `foreground` siempre false) se mantiene como está — es API de ExoPlayer, no código propio.
- Esta es la última tarea del plan. Al completarla, ejecutar la suite completa de tests y verificar las métricas de éxito del plan maestro.
