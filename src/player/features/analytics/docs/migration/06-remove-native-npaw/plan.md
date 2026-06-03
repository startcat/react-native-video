# Plan de Implementación: Eliminar la integración Youbora/NPAW legacy nativa

> Basado en spec.md | Generado el 2026-06-03
> Baseline: verificado informalmente por inspección directa del código fuente
> (no hay informe `/verify` formal). Todas las asunciones del spec §7 se
> confirmaron contra los ficheros reales.

## Resumen ejecutivo

- **Objetivo**: eliminar el SDK NPAW nativo (iOS/Android), su prop nativo
  `youbora` y el puente TS, conservando la rama Chromecast y los tipos a nivel de
  player.
- **Fases**: 5
- **Estimación**: ~4h
- **Riesgo general**: Medio (volumen alto, transformaciones mecánicas; el riesgo
  está en la dispersión del wiring iOS y en la simetría JS↔codegen).

## Pre-requisitos

### Dependencias a instalar/actualizar

```bash
# Ninguna. El trabajo es de eliminación; no se añaden dependencias.
# Tras la Fase 5, los consumidores iOS regeneran Pods:  pod install
```

### Configuración previa

- [ ] Confirmado que el plugin externo Youbora (overon-player-analytics-plugins-youbora-rn) ya está validado como sustituto.
- [ ] Confirmado que `playerAnalytics.youbora` y `getYouboraOptions` se conservan (los usa Cast).

### Estado de git requerido

- Branch base: `master`
- Branch de trabajo: `feat/PLAYER-171-remove-native-youbora` (ya creado)

---

## Fases de implementación

### Fase 1: Desconectar los consumidores del prop nativo `youbora`

**Objetivo**: que ningún componente siga pasando `youbora` al `<Video>` nativo,
dejando el prop definido pero sin uso. Mantiene `tsc` limpio porque la definición
del prop aún existe.

**Archivos a modificar**:

- `src/player/flavours/normal/index.tsx` — quitar import `IMappedYoubora`, ref `youboraForVideo`, los dos bloques `getYouboraOptions` y el prop `youbora={youboraForVideo.current}` en el render del `<Video>`. **Conservar** `plugins: analyticsConfig` y `playerAnalytics={…}`.
- `src/player/flavours/audio/index.tsx` — idéntico: quitar import, ref, bloques `getYouboraOptions` y prop `youbora={youboraForVideo.current}`.
- `src/player/adapters/ReactNativeVideoAdapter/index.tsx` — quitar `youbora={props.contentInfo.youbora}`.
- `src/player/adapters/types/index.ts` — quitar `youbora?: any` de `contentInfo`.

**Cambios específicos**:

1. Eliminar la preparación de `youboraForVideo` y su paso al `<Video>` en flavours `normal` y `audio`.
2. Eliminar el reenvío del prop en el adapter nativo y su tipo asociado.
3. No tocar la rama `cast`: su uso de `getYouboraOptions`/`youbora` permanece.

**Invariantes que podrían verse afectados**:

- Rama Cast intacta: verificar que `flavours/cast/index.tsx` y `features/cast/*` no cambian.
- API `playerAnalytics.youbora` sigue existiendo (no se toca `newTypes.ts`).

**Punto de verificación**:

```bash
yarn tsc && grep -n "youbora" src/player/flavours/normal/index.tsx src/player/flavours/audio/index.tsx src/player/adapters/ReactNativeVideoAdapter/index.tsx
# Esperado: tsc OK; sin coincidencias youbora en esos 3 ficheros.
```

**Rollback de esta fase**: `git revert HEAD`

**Estimación**: ~1h

---

### Fase 2: Eliminar la definición del prop nativo `youbora`

**Objetivo**: retirar el prop `youbora` de la superficie de tipos, del spec de
codegen y del mapeo en el componente `<Video>`.

**Archivos a modificar**:

- `src/types/video.ts` — quitar `type Youbora` y `youbora?: Youbora` de `ReactVideoProps`.
- `src/specs/VideoNativeComponent.ts` — quitar `type Youbora` y `youbora?: Youbora` (spec de codegen Fabric).
- `src/Video.tsx` — quitar `youbora` del destructuring de props, el `useMemo` `_youbora` y el paso `youbora={_youbora}` al `NativeVideoComponent`.

**Cambios específicos**:

1. Eliminar la definición del tipo y del prop en la capa pública de tipos.
2. Eliminar el prop del spec de codegen para que no se genere el binding nativo.
3. Eliminar el mapeo `_youbora` y su paso al componente nativo en `Video.tsx`.

**Invariantes que podrían verse afectados**:

- Codegen: tras esta fase el spec ya no declara `youbora`; el view manager nativo aún lo expone (benigno hasta Fases 3/4).
- No debe quedar ninguna referencia TS al tipo `Youbora` (el de `video.ts`); los tipos `IYoubora`/`IMappedYoubora` (otro símbolo) permanecen.

**Punto de verificación**:

```bash
yarn tsc && yarn lint && grep -rn "youbora" src/Video.tsx src/types/video.ts src/specs/VideoNativeComponent.ts
# Esperado: tsc/lint OK; 0 coincidencias.
```

**Rollback de esta fase**: `git revert HEAD`

**Estimación**: ~45min

---

### Fase 3: Eliminar el wiring NPAW nativo en iOS

**Objetivo**: retirar todo NpawPlugin de iOS.

**Archivos a modificar**:

- `ios/Video/RCTVideo.swift` — eliminar: `import NpawPlugin` y el comentario `//import NpawPluginIMAAdapter`; `isLegacyYouboraDisabled()`; campos `_youbora` y `_videoAdapter`; los `_videoAdapter?.playerAdapter.fireStop()` (2 sitios); los dos bloques `NpawPluginProvider.shared { … removeAdapter … destroy }`; el bloque `/* DANI: Youbora */ … /* End */` (init/build/fireInit); el método `setYoubora(_:)`.
- `ios/Video/DataStructures/YouboraParams.swift` — **borrar el fichero**.
- `ios/Video/RCTVideoManager.m` — quitar `RCT_EXPORT_VIEW_PROPERTY(youbora, NSDictionary)`.
- `ios/Tests/DataStructureParsingTests.swift` — quitar la sección `// MARK: - YouboraParams` y los `testYoubora_*`.

**Cambios específicos**:

1. Borrar el fichero del struct y todas las referencias a `YouboraParams`/`_youbora`.
2. Borrar el ciclo de vida del adapter (`fireStop`, cleanup) y la inicialización del SDK.
3. Quitar el export del prop nativo y los tests del struct.

**Invariantes que podrían verse afectados**:

- El flujo de carga de source/playerItem debe seguir intacto tras quitar el bloque NPAW (conservar `_player?.pause()`, `_playerItem = playerItem`).
- No debe quedar ningún símbolo `NpawPlugin`/`AnalyticsOptions`/`VideoAdapter`/`_videoAdapter`.

**Punto de verificación**:

```bash
yarn check-ios; grep -rin "npaw\|NpawPlugin\|YouboraParams\|_videoAdapter\|_youbora" ios/Video ios/Tests
# Esperado: 0 coincidencias. (Compilación completa requiere Xcode.)
```

**Rollback de esta fase**: `git revert HEAD`

**Estimación**: ~1h

---

### Fase 4: Eliminar el wiring NPAW nativo en Android

**Objetivo**: retirar todo `com.npaw` de Android (código; las deps van en Fase 5).

**Archivos a modificar**:

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — quitar imports `com.npaw.*`; campos `npawPlugin`/`videoAdapter`/`currentYouboraOptions`; el bloque NPAW en `setMediaSource` (getInstance/videoBuilder/fireStart); la llamada `clearYoubora()` en cleanup; los métodos `isLegacyYouboraDisabled()`/`setYoubora()`/`stopYouboraAdapter()`/`clearYoubora()`.
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerViewManager.java` — quitar import `AnalyticsOptions`; constante `PROP_YOUBORA`; la llamada `videoView.stopYouboraAdapter()` en `setSrc`; el método `@ReactProp(name = PROP_YOUBORA) setYoubora(…)`.

**Cambios específicos**:

1. Quitar el extremo de construcción del adapter (`setMediaSource`) y el de limpieza (cleanup + métodos).
2. Quitar el prop `youbora` del manager y su llamada en `setSrc` (conservar el resto de `setSrc`).

**Invariantes que podrían verse afectados**:

- `setMediaSource` y `setSrc` deben seguir funcionando sin las llamadas NPAW.
- No debe quedar referencia a campos/métodos eliminados.

**Punto de verificación**:

```bash
yarn check-android; grep -rin "npaw\|youbora\|videoAdapter\|currentYoubora\|AnalyticsOptions" android/src
# Esperado: 0 coincidencias. (Compilación Gradle requiere Android SDK.)
```

**Rollback de esta fase**: `git revert HEAD`

**Estimación**: ~1h

---

### Fase 5: Eliminar dependencias, docs y verificación final

**Objetivo**: retirar las deps NPAW de los manifiestos de build y actualizar docs.

**Archivos a modificar**:

- `react-native-video.podspec` — quitar el bloque `if defined?($RNVideoUseYoubora) … end` (incl. `NpawPluginPkg` y flag `USE_YOUBORA`) y el comentario `#ss.dependency 'NpawPluginIMAAdapter'`.
- `android/build.gradle` — quitar las 3 deps `com.npaw.plugin:*`. No tocar `media3_version`/`ima_version`.
- `src/player/docs/youbora.md` — reescribir: integración nativa eliminada; apuntar al plugin externo; nota de que Cast conserva su reenvío `youbora`.
- `src/Player.readme.md` — actualizar la sección "13. Integración con Youbora" y la fila del prop `youbora` (analíticas locales vía plugins); `getYouboraOptions` se mantiene (Cast).

**Cambios específicos**:

1. Eliminar las dependencias del SDK en podspec y gradle (después de que el código que las usa ya no existe).
2. Actualizar documentación a la realidad post-migración.

**Invariantes que podrían verse afectados**:

- No romper otras subspecs/deps del podspec (Video caching, IMA) ni otras deps de gradle (ExoPlayer, IMA).

**Punto de verificación**:

```bash
yarn tsc && yarn lint
grep -rin "NpawPluginPkg\|RNVideoUseYoubora" react-native-video.podspec
grep -rin "com.npaw" android/build.gradle
grep -rin "npaw\|NpawPlugin" ios/Video android/src
# Esperado: 0 coincidencias en todos.
```

**Rollback de esta fase**: `git revert HEAD`

**Estimación**: ~30min

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  (desconectar consumidores TS)
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  (eliminar definición del prop)
└────┬────┘
     │
     ├──────────┐
     │          │
┌────▼────┐ ┌──▼──────┐
│ Fase 3  │ │ Fase 4  │  (iOS / Android — paralelas)
└────┬────┘ └──┬──────┘
     │         │
     └────┬────┘
          │
     ┌────▼────┐
     │ Fase 5  │  (deps + docs + verificación)
     └─────────┘
```

### Dependencias entre fases

- Fase 2 depende de: Fase 1 (quitar consumidores antes que la definición → `tsc` limpio en cada paso).
- Fase 3 depende de: Fase 2.
- Fase 4 depende de: Fase 2.
- Fase 5 depende de: Fase 3 y Fase 4 (no se puede quitar la dep mientras el código nativo aún la importa).

### Fases paralelas

- Fase 3 (iOS) y Fase 4 (Android) son independientes.

### Puntos de no retorno

- Ninguno duro: cada fase es un commit reversible con `git revert`. El único
  "punto de publicación" es tras completar las 5 fases (no publicar versión con
  prop nativo huérfano).

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación manual |
| ---- | --------------- | ----------------- | ------------------- |
| 1    | —               | `yarn tsc`        | Cast sigue reenviando youbora; grep youbora=0 en los 3 ficheros |
| 2    | —               | `yarn tsc`, `yarn lint` | grep youbora=0 en Video.tsx/video.ts/VideoNativeComponent.ts |
| 3    | `ios/Tests` (quitar youbora) | `yarn check-ios` | grep npaw=0 en ios/Video; flujo de carga intacto |
| 4    | —               | `yarn check-android` | grep npaw=0 en android/src; setSrc/setMediaSource intactos |
| 5    | —               | `yarn tsc`, `yarn lint` | grep NpawPluginPkg/com.npaw=0; otras deps intactas |

## Checklist pre-implementación

- [ ] Spec revisado y aprobado
- [x] Baseline verificado por inspección directa (sin bloqueos)
- [x] Branch creado (`feat/PLAYER-171-remove-native-youbora`)
- [ ] Entorno de desarrollo limpio (`git status` solo con docs de esta fase)
- [ ] Validaciones actuales pasando (`yarn tsc` baseline)

## Rollback global

### Opción 1: Revert de commits individuales
```bash
git log --oneline | head -6   # localizar los 5 commits de fase
git revert <hash-fase-5>..<hash-fase-1>
```

### Opción 2: Reset a commit anterior
```bash
git log --oneline | head -10
git reset --hard <hash-antes-del-cambio>
```

### Opción 3: Eliminar branch completo
```bash
git checkout master
git branch -D feat/PLAYER-171-remove-native-youbora
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
