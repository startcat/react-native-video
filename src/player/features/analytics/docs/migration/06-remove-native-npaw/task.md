# Tarea 06: Eliminar la integración Youbora/NPAW legacy nativa

## Contexto

El nuevo sistema de analíticas basado en plugins
(`@overon/react-native-overon-player-analytics-plugins`) ya está cableado en el
player vía `VideoEventsAdapter`, `useVideoAnalytics`, los handlers de eventos y
la prop `features.analyticsConfig: PlayerAnalyticsPlugin[]`. El plugin de Youbora
externo (`overon-player-analytics-plugins-youbora-rn`) ha sido validado contra
ese sistema.

Las fases 01-05 de esta migración eliminaron el **módulo interno JS** de
analytics (`src/player/features/analytics/` ya solo contiene `docs/`,
`src/player/modules/analytics/` ya no existe en `src`).

Queda viva la **integración Youbora/NPAW legacy acoplada al código nativo**: el
SDK NPAW embebido en iOS (`NpawPlugin`) y Android (`com.npaw.plugin:*`), su prop
nativo `youbora`, y el puente TS que lo alimenta. El kill-switch PLAYER-175
(`OVERON_DISABLE_LEGACY_YOUBORA`) ya demostró que la cadena NPAW es totalmente
opcional en runtime; esta tarea la elimina por completo (lo que PLAYER-171
preveía).

## Objetivo

Eliminar el SDK NPAW nativo (iOS + Android), su prop nativo `youbora` y el
puente TS que lo alimenta, **sin tocar**:

- La rama **Chromecast**, que reenvía un objeto `youbora` al receiver
  (independiente del SDK NPAW nativo).
- Los tipos a nivel de player (`IYoubora`, `IMappedYoubora`, `YOUBORA_FORMAT`,
  `getYouboraOptions`, `playerAnalytics.youbora`) que ese path de Cast consume.
- El sistema de plugins nuevo.

## Frontera de alcance

### Eliminar

- **iOS**: wiring NPAW en `RCTVideo.swift`, `DataStructures/YouboraParams.swift`,
  prop en `RCTVideoManager.m`, tests en `ios/Tests/DataStructureParsingTests.swift`,
  bloque `$RNVideoUseYoubora` en `react-native-video.podspec`.
- **Android**: wiring NPAW en `ReactExoplayerView.java`, prop/método en
  `ReactExoplayerViewManager.java`, dependencias `com.npaw.plugin:*` en
  `android/build.gradle`.
- **TS (puente nativo)**: tipo `Youbora` + prop en `src/types/video.ts` y
  `src/specs/VideoNativeComponent.ts`, mapeo `_youbora` en `src/Video.tsx`, prop
  en `ReactNativeVideoAdapter`, y desconexión del prop `youbora` al `<Video>`
  nativo en los flavours **normal** y **audio**.

### Conservar

- Flavour **cast** (incl. `getYouboraOptions` → `youboraForVideo` → mensaje al
  receiver), `CastMessageBuilder`, `useCastManager`, `enableYoubora`,
  `castMessage.ts`.
- Tipos: `IYoubora`, `IMappedYoubora`, `YOUBORA_FORMAT`, `YouboraContent*`,
  `IYouboraSettingsFormat`, `GetYouboraOptionsProps`, hook `getYouboraOptions`
  (`types/hooks.ts`, `core/flow/types.ts`), `IPlayerAnalytics.youbora`.
- Todo `@overon/react-native-overon-player-analytics-plugins`.
- `lib/` (build output gitignored; se regenera con `yarn build`).

## Fases

| # | Fase | Descripción |
|---|------|-------------|
| 1 | Desconexión TS | Quitar prop nativo `youbora` (`video.ts`, `VideoNativeComponent.ts`, `Video.tsx`, `ReactNativeVideoAdapter`) y desconectar flavours `normal`/`audio` del `<Video>` nativo. |
| 2 | iOS | Eliminar todo el wiring NPAW de `RCTVideo.swift`, borrar `YouboraParams.swift`, prop en `RCTVideoManager.m`, tests youbora. |
| 3 | Android | Eliminar wiring NPAW de `ReactExoplayerView.java` y `ReactExoplayerViewManager.java`. |
| 4 | Deps + docs + verificación | Quitar `NpawPluginPkg` (podspec) y `com.npaw.plugin:*` (gradle); actualizar docs; verificación final (tsc, lint, format, grep residual). |

## Criterios de aceptación

- [ ] `yarn tsc` sin errores.
- [ ] `yarn lint` sin errores nuevos.
- [ ] `grep -rin 'npaw\|NpawPlugin' ios/Video android/src` → 0 resultados.
- [ ] `grep -rin 'youbora' ios/Video android/src` → 0 resultados.
- [ ] No queda el prop nativo `youbora` en `src/Video.tsx`,
      `src/specs/VideoNativeComponent.ts` ni `src/types/video.ts`.
- [ ] El flavour **cast** sigue reenviando `youbora` al receiver sin cambios.
- [ ] Los tipos `IYoubora`/`IMappedYoubora`/`YOUBORA_FORMAT` y
      `playerAnalytics.youbora` siguen existiendo (los usa Cast).
- [ ] `NpawPluginPkg` ya no aparece en `react-native-video.podspec` ni
      `com.npaw.plugin:*` en `android/build.gradle`.
