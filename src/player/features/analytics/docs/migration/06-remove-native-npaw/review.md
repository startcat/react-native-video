# Review de Implementación: Eliminar Youbora/NPAW legacy nativo (PLAYER-171)

> Generado el 2026-06-03
> Basado en: spec.md + plan.md

## Checks automatizados

| Check | Estado | Detalle |
| ----- | ------ | ------- |
| `yarn tsc` (diff vs baseline) | ✅ | 228 errores = baseline 228; diff normalizado **idéntico**; 0 errores nuevos; 0 youbora/npaw. El TS4078 transitorio de la fase 2 (cascade de `IManifestTextTrack`, tipo ya roto en baseline) se resolvió en el estado final. |
| ESLint (ficheros editados, vs master) | ✅ | normal 57→54, audio 35→32, Video 0→0 — **net −6 problemas, 0 nuevos**. Los ~96 problemas restantes (`any`, `quotes`, `@ts-ignore`, prettier) son deuda preexistente. |
| `grep npaw\|youbora ios/Video ios/Tests` | ✅ | 0 coincidencias |
| `grep npaw\|youbora android/src` | ✅ | 0 coincidencias |
| podspec `NpawPluginPkg`/`RNVideoUseYoubora` | ✅ | 0 |
| gradle `com.npaw` | ✅ | 0 |
| Compilación nativa iOS/Android | ⚠️ | **No ejecutada** (sin Xcode/Android SDK en el entorno). Verificación por grep + sanity check estructural. |

## Cobertura de requisitos

### Requisitos funcionales (criterios de aceptación de task.md)

| Requisito | Implementado | Evidencia | Notas |
| --------- | ------------ | --------- | ----- |
| `yarn tsc` sin errores nuevos | ✅ | diff normalizado idéntico a baseline | — |
| `yarn lint` sin errores nuevos | ✅ | conteo por fichero ↓ vs master | — |
| 0 `npaw/NpawPlugin` en `ios/Video` + `android/src` | ✅ | grep = 0 | — |
| 0 `youbora` en `ios/Video` + `android/src` | ✅ | grep = 0 | — |
| Prop nativo `youbora` eliminado de `Video.tsx`, `VideoNativeComponent.ts`, `video.ts` | ✅ | grep = 0 en los 3 | — |
| Flavour `cast` sigue reenviando `youbora` al receiver | ✅ | `git diff master...HEAD` vacío en `flavours/cast`, `flavours/audioCast`, `features/cast`, `castMessage.ts`; 11 refs youbora intactas | — |
| Tipos `IYoubora`/`IMappedYoubora`/`YOUBORA_FORMAT` + `playerAnalytics.youbora` preservados | ✅ | presentes en `types.ts`, `enums.ts`, `newTypes.ts` | — |
| `NpawPluginPkg` fuera del podspec; `com.npaw.plugin:*` fuera de gradle | ✅ | grep = 0 | — |

### Invariantes preservados

| Invariante | Estado | Evidencia |
| ---------- | ------ | --------- |
| Rama Cast intacta (JS→receiver) | ✅ | diff vacío en todos los ficheros de Cast |
| API pública del Player (`playerAnalytics.youbora`, `getYouboraOptions`) | ✅ | tipos y firmas sin cambios |
| Flujo de carga iOS (`setupPlayer`: guard → `_player?.pause()` → `_playerItem`) | ✅ | sanity check estructural líneas ~583-595 |
| Android `setSrc`/`setMediaSource` operativos sin NPAW | ✅ | sanity check: `player.prepare()` tras el bloque eliminado; `setSrc` conserva el resto |

## Calidad del código

### Puntos fuertes

- Eliminación quirúrgica: cada fase es un commit independiente y reversible (`git revert`).
- Frontera eliminar/conservar respetada con precisión — la rama Cast no se tocó (diff vacío verificado).
- Verificación basada en diff contra baseline (no en "tsc limpio"), correcta dado que el repo arrastra 228 errores TS preexistentes.

### Áreas de mejora

- **Resuelto durante el review**: `import java.util.HashMap` quedó huérfano en `ReactExoplayerViewManager.java` al eliminar `setYoubora` (`java.util.Map` sí se sigue usando). Eliminado en commit de fix.
- Comentarios de sección "Dani Youbora/Offline" en código nativo: se ajustaron (iOS `setYoubora`→sección "Offline"); no quedan referencias a Youbora.

### Over-engineering detectado

- No detectado. El trabajo es eliminación pura; no se añadió abstracción.

## Resumen de cambios

### Archivos modificados

| Archivo | Tipo | +/- | Observaciones |
| ------- | ---- | --- | ------------- |
| `ios/Video/RCTVideo.swift` | Modificado | −135 | import/kill-switch/campos/init/cleanups/setYoubora |
| `ios/Video/DataStructures/YouboraParams.swift` | Eliminado | −107 | struct completo |
| `ios/Video/RCTVideoManager.m` | Modificado | −1 | prop export |
| `ios/Tests/DataStructureParsingTests.swift` | Modificado | −85 | tests YouboraParams |
| `android/.../ReactExoplayerView.java` | Modificado | −133 | imports/campos/setMediaSource/cleanup/métodos |
| `android/.../ReactExoplayerViewManager.java` | Modificado | −172 (+ fix import) | PROP/import/setSrc/setYoubora |
| `android/build.gradle` | Modificado | −5 | 3 deps com.npaw |
| `react-native-video.podspec` | Modificado | −10 | bloque RNVideoUseYoubora |
| `src/Video.tsx` | Modificado | −40 | prop + memo `_youbora` |
| `src/types/video.ts`, `src/specs/VideoNativeComponent.ts` | Modificado | −34 c/u | tipo + prop |
| `src/player/flavours/{normal,audio}/index.tsx` | Modificado | −21 c/u | desconexión del `<Video>` nativo |
| `src/player/adapters/ReactNativeVideoAdapter/index.tsx`, `adapters/types/index.ts` | Modificado | −1 c/u | prop / tipo contentInfo |
| `src/player/docs/youbora.md` | Reescrito | −712/+~ | reorientado a plugins + Cast |
| `src/Player.readme.md` | Modificado | ±9 | 3 referencias |

### Cambios no planificados

- Eliminación del `import java.util.HashMap` huérfano (Manager.java): no estaba en el plan explícito pero es consecuencia directa de eliminar `setYoubora`; correcto incluirlo.
- Ajuste del comentario iOS "DANI: Youbora & Offline" → "DANI: Offline" (necesario para que `setPlayOffline`, conservado, no quede bajo un marcador inexistente).

### Asunciones que se colaron (autopsia)

No hubo asunciones del **spec** desmentidas — la frontera eliminar/conservar y los puntos de enganche (data-flow, sitios dispersos iOS, `setMediaSource` Android) se confirmaron exactamente. Hallazgos de implementación, no fallos de spec:

| # | Hallazgo | Cómo se descubrió | Regla derivada |
|---|----------|-------------------|----------------|
| 1 | `import java.util.HashMap` huérfano tras quitar `setYoubora` | `/review`: grep de uso real | Al eliminar un método, comprobar si sus imports quedan sin uso |
| 2 | Indentación **mixta tabs/espacios** en `ReactExoplayerViewManager.setYoubora` | Edits fallaban por whitespace | Volcar con `cat -t` antes de editar bloques Java grandes; no fiar la indentación del visor |
| 3 | TS4078 transitorio (declaration-emit) sobre `IManifestTextTrack` | gate tsc fase 2 (228→229→228) | Comparar firmas tsc normalizadas (sin línea/literal), no el conteo bruto |

## Deuda técnica

| Item | Severidad | Descripción | Archivo |
| ---- | --------- | ----------- | ------- |
| Build nativo no validado | Media (proceso) | iOS/Android no compilados en este entorno | — |
| Errores TS preexistentes | Baja | 228 errores baseline (deps no instaladas, etc.) — ajenos a esta tarea | varios |
| `IManifestTextTrack` indefinido | Baja | Bug preexistente en `types/hooks.ts` (TS2304) — fuera de alcance | `src/player/types/hooks.ts` |

## Checklist pre-merge

### Funcionalidad
- [x] Requisitos funcionales implementados
- [x] Validaciones (tsc/lint/grep) pasando
- [x] Sin regresiones detectables a nivel estático; Cast intacto
- [x] Invariantes críticos preservados

### Calidad
- [~] Sin errores de compilación — **TS/JS OK; nativo no compilado (pendiente build real)**
- [x] Sin warnings nuevos (net −6 lint; import huérfano resuelto)
- [x] Código legible
- [x] Sin over-engineering

### Proceso
- [x] Todos los archivos del plan modificados (+ fix import)
- [x] Sin cambios fuera de alcance significativos
- [x] Commits limpios y descriptivos (uno por fase)
- [x] Documentación actualizada

## Decisión

### MERGE CON NOTAS ⚠️

La implementación cumple todos los requisitos verificables estáticamente y no introduce regresiones. Mergeable con estas notas de seguimiento:

1. **Validación de build nativo pendiente**: este entorno no tiene Xcode ni Android SDK, así que iOS/Android no se compilaron. Ejecutar un build de ambas plataformas (y un smoke test de reproducción local + Cast) **antes de mergear a master**. Riesgo de runtime bajo: el kill-switch PLAYER-175 ya demostró que la cadena NPAW era opcional, y los grep + sanity checks estructurales no revelan símbolos colgantes.
2. **Consumidores**: iOS debe re-ejecutar `pod install`; `lib/` se regenera con `yarn build`. Quien pasara `youbora` directo al `<Video>` de bajo nivel debe migrar al plugin (breaking change intencionado y documentado).
