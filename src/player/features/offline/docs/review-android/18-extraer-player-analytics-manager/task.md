# Tarea: Extraer PlayerAnalyticsManager

> Tarea 18 de 22 | Fase E: Extracciones riesgo alto (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene la integración con Youbora/NPAW (~70 líneas) con 3 campos (`npawPlugin`, `videoAdapter`, `currentYouboraOptions`) y 3 métodos (`setYoubora`, `clearYoubora`, `stopYouboraAdapter`). Esta integración está acoplada al flujo de inicialización del player.

**IDs de auditoría relacionados**: REQ-034

## Objetivo

Extraer la integración con Youbora/NPAW a una clase `PlayerAnalyticsManager` independiente de `ReactExoplayerView`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - `setYoubora()` (líneas ~2813-2845)
  - `clearYoubora()` (líneas ~2860-2869)
  - `stopYouboraAdapter()` (líneas ~2847-2858)
  - Campos: `npawPlugin`, `videoAdapter`, `currentYouboraOptions`
  - Integración en `initializePlayerSource()`
- `android/src/main/java/com/brentvatne/exoplayer/analytics/PlayerAnalyticsManager.java` — nuevo fichero

### Fuera de alcance

- NO modificar la configuración de Youbora
- NO añadir nuevos providers de analytics

## Requisitos funcionales

1. **[REQ-034]**: Los eventos de Youbora deben reportarse al dashboard de NPAW idénticamente.

## Requisitos técnicos

1. Clase con estado (plugin, adapter, options)
2. Interfaz pública (ver sección 2.1, Unidad 3 de la auditoría)

## Cambios de contrato

- **Ninguno**

## Criterios de aceptación

### Funcionales
- [ ] Los 3 campos y 3 métodos de Youbora ya no existen en `ReactExoplayerView.java`
- [ ] Youbora reporta eventos correctamente al dashboard NPAW

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
- **Principal riesgo**: Youbora SDK tiene requisitos de lifecycle (attach/detach del player)
- **Mitigación**: mantener el mismo orden de operaciones
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
