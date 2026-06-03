# Especificación Técnica: Eliminar la integración Youbora/NPAW legacy nativa

> Las líneas indicadas son **aproximadas** (referencia para `/verify`); el
> implementador debe localizar los símbolos en runtime, no confiar en números de
> línea fijos.

## Resumen

Eliminar el SDK NPAW embebido en el código nativo (iOS `NpawPlugin`, Android
`com.npaw.plugin:*`), el prop nativo `youbora` que lo alimenta y su puente TS.
La rama Chromecast (`youbora` → receiver) y los tipos a nivel de player se
conservan intactos. Trabajo dividido en 4 fases verificables.

## 1. Alcance

### Flujo de datos actual

```
playerAnalytics.youbora (IYoubora)
        │
        └─ hooks.getYouboraOptions(youbora, format) ──► youboraForVideo (IMappedYoubora)
                                                              │
              ┌───────────────────────────────────────────────┼───────────────────────────┐
              ▼                                                 ▼                           ▼
      flavour normal                                      flavour audio              flavour cast
   <Video youbora=…/>  ───► RCTVideo / ReactExoplayerView   <Video youbora=…/>   mensaje { youbora } ─► receiver
        (NPAW nativo)            (NPAW nativo)               (NPAW nativo)              (SE CONSERVA)
```

Las ramas **normal** y **audio** se desconectan del `<Video>` nativo; la rama
**cast** queda igual. `playerAnalytics.youbora` y `getYouboraOptions` permanecen
como API porque Cast los usa.

### Archivos a modificar

**TS / puente nativo**
- `src/types/video.ts` — quitar `type Youbora` (~70) y `youbora?: Youbora` (~237).
- `src/specs/VideoNativeComponent.ts` — quitar `type Youbora` (~64) y
  `youbora?: Youbora` (~353). **Crítico**: es el spec de codegen Fabric; si no se
  quita aquí, codegen sigue generando el prop nativo.
- `src/Video.tsx` — quitar `youbora,` del destructuring (~71), el `useMemo`
  `_youbora` completo (~186-220) y el paso `youbora={_youbora}` al
  `NativeVideoComponent` (~599).
- `src/player/adapters/ReactNativeVideoAdapter/index.tsx` — quitar
  `youbora={props.contentInfo.youbora}` (~373).
- `src/player/adapters/types/index.ts` — quitar `youbora?: any` de `contentInfo`
  (~127).
- `src/player/flavours/normal/index.tsx` — quitar import `IMappedYoubora` (~74),
  `youboraForVideo` ref (~105), los dos bloques `getYouboraOptions` (~773-776,
  ~870-873) y el prop `youbora={youboraForVideo.current}` (~2410). **Conservar**
  `plugins: analyticsConfig` (~2380) y `playerAnalytics={…}` (~2567).
- `src/player/flavours/audio/index.tsx` — quitar import `IMappedYoubora` (~48),
  `youboraForVideo` ref (~60), los dos bloques `getYouboraOptions` (~467-470,
  ~484-487) y el prop `youbora={youboraForVideo.current}` (~1154).

**iOS**
- `ios/Video/RCTVideo.swift` — eliminar:
  - `//import NpawPluginIMAAdapter` (~6) e `import NpawPlugin` (~9).
  - comentario kill-switch + `isLegacyYouboraDisabled()` (~12-21).
  - campos `_youbora: YouboraParams?` y `_videoAdapter: VideoAdapter!` (~41-43).
  - `_videoAdapter?.playerAdapter.fireStop()` (~279 y ~1638).
  - los **dos** bloques `if let npawPlugin = NpawPluginProvider.shared { … removeAdapter … destroy }`
    (~297-303 y ~1694-1698).
  - el bloque completo `/* Begin Modification DANI: Youbora */ … /* End */`
    (~618-692) incluyendo `analyticsOptions`, `NpawPluginProvider.initialize`,
    `videoBuilder()` y `fireInit()`. Conservar lo de después (`_player?.pause()`,
    `_playerItem = playerItem`, …).
  - método `setYoubora(_ youbora: NSDictionary)` (~805-806).
- `ios/Video/DataStructures/YouboraParams.swift` — **borrar el fichero entero**.
- `ios/Video/RCTVideoManager.m` — quitar
  `RCT_EXPORT_VIEW_PROPERTY(youbora, NSDictionary)` (~9).
- `ios/Tests/DataStructureParsingTests.swift` — quitar la sección
  `// MARK: - YouboraParams` y los tests `testYoubora_*` (~185-265) y la mención
  de `YouboraParams` en el comentario de cabecera (~7).
- `react-native-video.podspec` — quitar el bloque
  `if defined?($RNVideoUseYoubora) … end` (~24-30) y el comentario
  `#ss.dependency 'NpawPluginIMAAdapter', '1.1.11'` (~49).

**Android**
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`:
  - imports `com.npaw.*` (~156-162).
  - campos `npawPlugin`, `videoAdapter`, `currentYouboraOptions` (~303-305).
  - bloque `/* Dani Youbora Begin … End */` en `setMediaSource` (~1264-1296):
    `isLegacyYouboraDisabled()` / `NpawPluginProvider.getInstance()` /
    `videoBuilder().build()` / `fireStart()`. Conservar el `setMediaSource(…)` de
    encima.
  - `clearYoubora()` + su comentario en cleanup (~1684-1685).
  - métodos `isLegacyYouboraDisabled()`, `setYoubora()`, `stopYouboraAdapter()`,
    `clearYoubora()` (~2989-3068).
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerViewManager.java`:
  - import `com.npaw.core.options.AnalyticsOptions` (~40).
  - constante `PROP_YOUBORA` (~92).
  - `videoView.stopYouboraAdapter();` + comentario en `setSrc` (~159-160).
    Conservar el resto de `setSrc`.
  - método `@ReactProp(name = PROP_YOUBORA) setYoubora(…)` completo (~404-460+).
- `android/build.gradle` — quitar las 3 dependencias `com.npaw.plugin:*` (~240-242):
  `plugin:7.2.14`, `plugin-media3-exoplayer`, `plugin-ima`. **No** tocar
  `media3_version` / `ima_version` (compartidas con ExoPlayer / Google IMA).

**Documentación**
- `src/player/docs/youbora.md` — reescribir/retirar: la integración nativa ya no
  existe; apuntar al plugin externo y dejar nota de que Cast conserva su propio
  reenvío `youbora`.
- `src/Player.readme.md` — la sección "13. Integración con Youbora" (~177-179) y
  la entrada del prop `youbora` (~44) deben reflejar que las analíticas locales
  van por `analyticsConfig`/plugins; `getYouboraOptions` (~104) se mantiene
  (Cast).

### Archivos a conservar (verificar que NO se tocan)

- `src/player/flavours/cast/index.tsx`, `src/player/features/cast/*`
  (`CastMessageBuilder.ts`, `useCastManager.ts`, `constants.ts`),
  `src/player/utils/castMessage.ts`.
- `src/player/types/types.ts` (`IYoubora`, `IMappedYoubora`, `YouboraContent*`,
  `IYouboraSettingsFormat`, `GetYouboraOptionsProps`), `src/player/types/enums.ts`
  (`YOUBORA_FORMAT`), `src/player/types/hooks.ts` y `src/player/core/flow/types.ts`
  (`getYouboraOptions`), `src/player/types/newTypes.ts` (`IPlayerAnalytics.youbora`).

## 2. Contratos

### Cambios en API pública

- **Eliminado**: prop `youbora` del componente de bajo nivel `<Video>`
  (`ReactVideoProps`). Breaking change para consumidores que lo pasaban directo;
  sustituto = sistema de plugins (`features.analyticsConfig`).
- **Sin cambios**: API del Player de alto nivel. `playerAnalytics.youbora` y el
  hook `getYouboraOptions` siguen existiendo (los consume Cast).

### Cambios en tipos/interfaces

- Eliminado: `Youbora` (en `types/video.ts` y `specs/VideoNativeComponent.ts`),
  campo `youbora?: any` en `IReactNativeVideoAdapter.contentInfo`.
- Conservado: todos los tipos `IYoubora`/`IMappedYoubora`/`YOUBORA_FORMAT`/…

### Cambios en eventos/callbacks

Ninguno. El reporte de eventos a NPAW desde el SDK nativo desaparece (lo cubre el
plugin JS); no había callbacks JS expuestos por la integración nativa.

## 3. Flujo de datos

- Estado global afectado: ninguno.
- Persistencia: ninguna.
- Comunicación entre módulos: se corta `flavour normal/audio → <Video> nativo →
  NPAW`. Se mantiene `flavour cast → mensaje → receiver`.

## 4. Riesgos

### Compatibilidad hacia atrás

- Apps que pasaban `youbora` directamente al `<Video>` de bajo nivel dejan de
  reportar a NPAW por esa vía. Mitigación: deben migrar al plugin
  (`overon-player-analytics-plugins-youbora-rn`), ya validado. El kill-switch
  PLAYER-175 indica que el path ya estaba en retirada.
- Receiver de Chromecast: **sin impacto** (su `youbora` viaja por el mensaje de
  cast, no por NPAW nativo).

### Casos edge problemáticos

- iOS: el wiring NPAW está disperso (2 bloques cleanup, 2 `fireStop`, 1 init).
  Omitir uno deja un símbolo `NpawPlugin`/`_videoAdapter` colgando → fallo de
  compilación. Verificar con grep `NpawPlugin|_videoAdapter`.
- Android: el adapter se construye en `setMediaSource` y se limpia en cleanup;
  hay que quitar ambos extremos o queda una referencia a campo eliminado.
- Codegen Fabric: el estado intermedio entre fases es benigno —tras la Fase 1 el
  spec de codegen ya no declara `youbora` pero el view manager nativo aún expone
  `RCT_EXPORT_VIEW_PROPERTY` / `@ReactProp` (un prop sin consumidor JS, se
  ignora)—. El requisito es **completar todas las fases**; no debe quedar un prop
  nativo huérfano de forma permanente. Recomendado: encadenar Fase 1 → 2 → 3 sin
  publicar versión a medias.

### Impacto en rendimiento

Positivo marginal: se elimina init de SDK y un adapter por reproducción.

## 5. Estrategias

### Testing

- TS: `yarn tsc` (build) + `yarn lint`.
- iOS: `yarn check-ios` (swift-format / swift-lint / clang-format). Compilación
  completa requiere Xcode (no disponible aquí) → validación por ausencia de
  símbolos residuales (grep) + revisión manual de los sitios listados.
- Android: `yarn check-android` (lint). Compilación Gradle requiere Android SDK.
- Grep de cierre: `npaw|NpawPlugin` y `youbora` en `ios/Video` y `android/src`
  deben dar 0.

### Rollback

`git revert` de los commits de fase, o restaurar ficheros desde git. Cada fase es
un commit independiente, así que el rollback es granular.

### Migración de datos

N/A.

## 6. Complejidad estimada

Media. El volumen es alto (≈10 ficheros + 2 nativos densos) pero las
transformaciones son eliminaciones mecánicas; el riesgo está en la dispersión
del wiring nativo iOS y en la simetría JS↔codegen del prop.

## 7. Preguntas sin resolver

### Técnicas

- ¿El ejemplo `examples/FabricExample` define `$RNVideoUseYoubora` en su Podfile?
  Si sí, tras quitar el bloque del podspec simplemente dejará de añadir la dep
  (no rompe); los Pods vendados se regeneran con `pod install`. Fuera del alcance
  del paquete publicado (`examples` está excluido en `package.json#files`).

### De negocio

- Ninguna pendiente (alcance Cast y prop público confirmados con el responsable).

## Aprobación

- [ ] Spec revisada y aprobada antes de generar el plan de implementación.
