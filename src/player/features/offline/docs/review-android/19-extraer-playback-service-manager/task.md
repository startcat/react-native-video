# Tarea: Extraer PlaybackServiceManager

> Tarea 19 de 22 | Fase E: Extracciones riesgo alto (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene la conexión y gestión del `VideoPlaybackService` para notificaciones de reproducción en background (~80 líneas). La lógica de bind/unbind del servicio está dispersa entre `setupPlaybackService()` y `releasePlayer()`.

**IDs de auditoría relacionados**: REQ-010

## Objetivo

Extraer la gestión del servicio de reproducción en background a una clase `PlaybackServiceManager` independiente de `ReactExoplayerView`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - `setupPlaybackService()` (líneas ~1186-1255)
  - Campos: `playbackServiceConnection`, `playbackServiceBinder`
  - Lógica de unbind en `releasePlayer()`
- `android/src/main/java/com/brentvatne/exoplayer/service/PlaybackServiceManager.java` — nuevo fichero

### Fuera de alcance

- NO modificar `VideoPlaybackService.kt`
- NO modificar `VideoPlaybackCallback.kt`

## Requisitos funcionales

1. **[REQ-010]**: La reproducción en background con notificación y controles de MediaSession debe funcionar idénticamente.

## Requisitos técnicos

1. Clase con estado (connection, binder)
2. Interfaz pública (ver sección 2.1, Unidad 6 de la auditoría)

## Cambios de contrato

- **Ninguno**

## Criterios de aceptación

### Funcionales
- [ ] `setupPlaybackService()` ya no existe en `ReactExoplayerView.java`
- [ ] Los campos de service connection ya no existen en `ReactExoplayerView.java`
- [ ] La notificación de reproducción aparece en background
- [ ] Los controles de la notificación funcionan (play/pause, seek)

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: el bind/unbind del servicio tiene requisitos de lifecycle Android estrictos
- **Mitigación**: mantener exactamente el mismo flujo de bind en `connect()` y unbind en `disconnect()`
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
