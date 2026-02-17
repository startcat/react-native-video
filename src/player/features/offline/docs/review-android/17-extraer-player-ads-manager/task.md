# Tarea: Extraer PlayerAdsManager

> Tarea 17 de 22 | Fase E: Extracciones riesgo alto (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene la integración con IMA SDK para ads (~80 líneas) dispersa entre `initializePlayer()`, `initializePlayerSource()` y los listeners de ads. Extraer esta lógica reduce el acoplamiento del God Object.

**IDs de auditoría relacionados**: REQ-033

## Objetivo

Extraer la integración con IMA SDK a una clase `PlayerAdsManager` independiente de `ReactExoplayerView`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - Creación de `ImaAdsLoader` en `initializePlayer()`
  - Wrapping de MediaSource con ads en `initializePlayerSource()`
  - Listeners `AdEvent.AdEventListener` y `AdErrorEvent.AdErrorListener` (líneas ~2770-2810)
  - Setter `setAdTagUrl()`
  - Campo `adsLoader`, `adTagUrl`
- `android/src/main/java/com/brentvatne/exoplayer/ads/PlayerAdsManager.java` — nuevo fichero

### Fuera de alcance

- NO modificar la lógica interna de IMA SDK
- NO añadir nuevos tipos de ads

## Requisitos funcionales

1. **[REQ-033]**: Pre-roll, mid-roll y post-roll configurados vía VAST ad tag deben reproducirse idénticamente.

## Requisitos técnicos

1. Clase con estado (adsLoader, adTagUrl)
2. Interfaz pública (ver sección 2.1, Unidad 2 de la auditoría)
3. Recibe `PlayerEventEmitter` para emitir eventos de ads (dependencia de tarea 12)

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `adsLoader` y `adTagUrl` ya no existen en `ReactExoplayerView.java`
- [ ] Los listeners de ads ya no están en `ReactExoplayerView.java`
- [ ] Ads VAST se reproducen correctamente

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos cubren: createAdsLoader con/sin adTag, wrapWithAds, release

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Dependencias

### Tareas previas requeridas
- Tarea 12: PlayerEventEmitter

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: IMA SDK tiene requisitos específicos de lifecycle (release en el momento correcto)
- **Mitigación**: mantener el mismo orden de release que en el código original
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
