# Memoria del Proyecto

> Actualizado automáticamente por /spec y /verify.
> Leído por todos los comandos del pipeline al inicio de su contexto.

<!-- spec: 01-distinguish-ad-vs-media-progress | 2026-05-05 -->

### Invariantes críticos

- `PlaybackPhaseManager` (`src/player/core/phase/PlaybackPhaseManager.ts`) solo modela `AD_PREROLL`. No existe `AD_MIDROLL` ni `AD_POSTROLL`. La transición real se dispara con el trigger `"AD_BREAK_STARTED"` desde `src/player/flavours/normal/index.tsx:2130` independientemente del tipo de break — el nombre del estado es engañoso. Cualquier gate basado en `phaseManager.isAdActive()` falla durante midroll/postroll.
- `Player.tsx:191–215` es el único punto del código JS que diferencia "estamos en ad" para suprimir un canal de progreso. Solo protege el callback del host `addContentProgress`. La pipeline de plugins de analytics (`useVideoAnalytics`) NO consulta este flag y emite `onProgress`/`onPositionUpdate` durante todo el playback, incluido el ad break.
- El flag `AdEventsHandler.isAdPlaying` (privado) es la única fuente fiable JS-side del estado "hay ad activo" cross-flavour, ya que se setea en `AD_BREAK_STARTED` y se limpia en `AD_BREAK_ENDED` / `ALL_ADS_COMPLETED` / `ERROR`. Phase manager solo existe en el flavour `normal`.
- El flavour `cast` (`src/player/flavours/cast/index.tsx`) NO invoca `useVideoAnalytics`. Los plugins de analytics no reciben ningún evento durante una sesión Cast — ni media ni ad. Cualquier feature de analytics está implícitamente normal-only.

### Convenciones

- Sistema de tasks del repo usa estructura `<area>/docs/<carpeta>/NN-nombre/{task,plan,spec}.md` (ver `src/player/features/analytics/docs/migration/`). No hay `../projects/` ni backlog centralizado en este repo.
- Errores: el sistema interno `PlayerError` (`src/player/core/errors`) coexiste con factories del paquete externo (`createHandlerError`, `createAnalyticsError` desde `@overon/react-native-overon-player-analytics-plugins`). El callback `onInternalError` de `useVideoAnalytics` aún tipa con `PlayerError` aunque el paquete externo emite `BaseError`.
- `OnReceiveAdEventData.data` (`src/types/events.ts:77`, `src/specs/VideoNativeComponent.ts:299`) está tipado como `object` opaco. La shape real depende del evento + plataforma — siempre se accede con `(data.data as any)?.field`. Para `AD_PROGRESS`, IMA SDK típicamente NO popula `position`/`duration` en `adData`.
- Native ad-event passthrough: iOS reenvía `event.adData` (`Dictionary`) en `RCTIMAAdsManager.swift`; Android reenvía `adEvent.getAdData()` (`Map<String, String>`) en `ReactExoplayerView.java:2836`. Ambos sin enriquecer.

### Áreas de riesgo

- **Paquete `@overon/react-native-overon-player-analytics-plugins`**: declarado como `devDependency ^0.2.0` en `package.json:36` pero NO presente en `node_modules/@overon/` ni en `yarn.lock`. Posible registry privado que requiere autenticación. Antes de cualquier task que toque la API del paquete, validar que `yarn install` lo resuelve.
- **`VideoEventsAdapter`** importa la clase `PlayerAnalyticsEvents` directamente del paquete externo y la inyecta en todos los handlers. Cambios en la API del paquete propagan a 6+ ficheros bajo `src/player/core/events/handlers/`.
- **`PlaybackEventsHandler.handleProgress`** acopla la detección de fin-de-seek con la emisión de `onProgress`/`onPositionUpdate`. Cualquier gate que retorne temprano del handler debe considerar el efecto sobre `finishSeek`.
- **`AdEventsHandler.handleAdProgress`** hoy es prácticamente un noop (solo loguea quartiles). Los ticks `AD_PROGRESS` se descartan — no hay canal `onAdProgress` en el contrato del plugin.

<!-- verify: 01-distinguish-ad-vs-media-progress | 2026-05-05 -->

### Invariantes críticos (añadidos en /verify)

- **`PlaybackPhaseManager.VALID_TRANSITIONS`** rechaza `CONTENT_PLAYING → AD_PREROLL` (`src/player/core/phase/PlaybackPhaseManager.ts:38-43`). Solo `LOADING` puede ir a `AD_PREROLL`. Cualquier transición a `AD_PREROLL` durante `CONTENT_PLAYING` (midroll) es rechazada silenciosamente con un log warn `Invalid transition`. **No usar `phaseManager.isAdActive()` como gate ad/media**: solo cubre prerolls efectivamente.
- **`AdEventsHandler.handleAdBreakEnded`** **NO** baja el flag `isAdPlaying`. Solo `handleAdCompleted/Skipped/Error/AllAdsCompleted` lo bajan. Esto deja el flag colgado si el SSAI/CSAI emite `AD_BREAK_ENDED` sin un `COMPLETED` previo (caso conocido en streams DAI).

### Convenciones (añadidas en /verify)

- Patrón de método nuevo en `PlayerAnalyticsEvents` (paquete externo, repo local en `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn`):
  ```ts
  onMethod(params: MethodParams) {
    const result = dispatchToPlugins(this.registry.getPlugins(), "onMethod", [params]);
    if (result.errors.length > 0) this.logDispatchErrors(result, "onMethod");
  }
  ```
  Y la entrada correspondiente opcional en `PlayerAnalyticsPlugin` interface (`…/src/types/Plugin.ts`).
- Patrón de tests en este repo: `src/<feature>/__tests__/<file>.test.ts`. Referencia canónica: `src/player/core/phase/__tests__/PlaybackPhaseManager.test.ts`.

### Áreas de riesgo (añadidas en /verify)

- **Registry npm privado GCP** (`https://europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/`): `yarn install` falla con 403 sin auth. Los paquetes `@overon/*` no se resuelven en entornos sin credenciales. Para desarrollo local, usar `yarn link` desde los repos hermanos:
  - `@overon/react-native-overon-player-analytics-plugins` → `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn` (versión `0.2.2`).
  - Otros `@overon/react-native-logger`, `@overon/react-native-overon-errors` declarados en `package.json:34-35` con misma fuente probable.
- **Baseline TypeScript pre-existente roto**: `yarn tsc --noEmit` produce errores varios sin tocar nada (Player.tsx orientation types, ReactNativeVideoAdapter VideoRef methods, audioPlayerBar timeouts, cast/index.tsx subtítulos, módulos `@overon/*` no resueltos). Cualquier `/verify` futuro debe distinguir errores nuevos de los pre-existentes — no fiarse de "tsc pasa" como criterio.

### Convenciones (añadidas 2026-05-05)

- **Auth registry GCP `@overon/*`**: el registry privado (`europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/`) requiere token. Script `npm.token.sh` vive en repos hermanos (`overon-cast-rn/scripts/`, `overon-safeness-rn/scripts/`, `etb-play-mobile/scripts/`, etc., NO en `react-native-video`). Ejecutarlo desde uno de esos repos para refrescar credenciales antes de `yarn install`.
- **Cast analytics es responsabilidad del receptor CAF, no del cliente RN**. El flavour `cast` no engancha `useVideoAnalytics` por diseño — cualquier propuesta futura de cablear plugins de analytics RN-side a Cast estaría duplicando tracking. Si se necesita observabilidad de Cast desde RN, va por otro canal (eventos del cast SDK directamente al consumidor del player), no por la pipeline `PlayerAnalyticsPlugin`.
