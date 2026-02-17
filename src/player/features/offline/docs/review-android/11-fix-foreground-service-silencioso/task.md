# Tarea: Fix foreground service denegado silenciosamente

> Tarea 11 de 22 | Fase C: Correcciones críticas
> Plan de refactorización de Android Native Module

## Contexto

En Android 12+, si la app no tiene permiso de foreground service o está en background, `startForegroundService()` falla. `DownloadsModule2.java` captura la excepción y la loguea, pero no informa al usuario. Las descargas no se inician silenciosamente. La auditoría lo identifica como NC-006 con prioridad **alta**.

**IDs de auditoría relacionados**: NC-006, REQ-024, REQ-025

## Objetivo

Emitir un evento específico a JavaScript cuando el foreground service no puede iniciarse, para que la UI pueda informar al usuario.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java`:
  - `startDownloadService()` (líneas ~1029-1058)
  - `resumeAll()` (líneas ~614-637)

### Fuera de alcance

- NO modificar `AxDownloadService.java`
- NO implementar retry automático del foreground service

## Requisitos funcionales

1. **[NC-006]**: Cuando `startForegroundService()` falla, se emite un evento `"onDownloadServiceError"` a JavaScript con el mensaje de error.

## Requisitos técnicos

1. En el `catch` de `startDownloadService()`, emitir evento a JS vía `RCTDeviceEventEmitter`
2. El evento debe incluir: tipo de error ("FOREGROUND_SERVICE_DENIED"), mensaje, y si la app está en foreground/background
3. En `resumeAll()`, mismo tratamiento si `startForegroundService()` falla

## Cambios de contrato

- **[NC-006]**: Se añade un nuevo evento `"onDownloadServiceError"` que antes no existía. No rompe contratos existentes (es aditivo).

## Criterios de aceptación

### Funcionales
- [ ] Cuando `startForegroundService()` falla, se emite `"onDownloadServiceError"` a JS
- [ ] El evento incluye tipo de error y mensaje descriptivo
- [ ] El comportamiento existente (logging) se mantiene

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
- **Principal riesgo**: el código JS puede no estar preparado para recibir este nuevo evento
- **Mitigación**: el evento es aditivo. Si JS no lo escucha, no pasa nada. Documentar el nuevo evento para que el equipo de JS lo integre.
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
