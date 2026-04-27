# Audio Ads — Design Spec

- **Status:** Approved (pending user spec review)
- **Date:** 2026-04-27
- **Author:** Daniel Marín (with Claude)
- **Player branch:** `feat/audio-ads` (rooted at `38eb15551eeabbdf305c744103e1f17c95726fae`)
- **App repo:** `/Users/danimarin/Development/Repositories/eitb-guau-mobile`
- **App branch:** to be created (`feat/audio-ads`) from current head before any change

## 1. Problem statement

The EITB Guau podcast app uses a patched fork of `react-native-video` pinned to commit `38eb1555…`. The audio flavour at that commit accepts `playerAds.adTagUrl` semantically but does **not** wire it to the underlying `<Video>` component, so audio ads (IMA SDK / VMAP) never play. The app's API
(`https://guau.eus/api/v1/media/<slug>`) already returns a `vmap.url` field, but the app's current `fetchContentData` builder does not propagate it to `playlistItem.ads`.

We want to (1) make audio ads actually play in the app, (2) expose ad playback state from the player to the app via a new event, and (3) let the app render the on-screen ad overlay (PUBLICIDAD chip + title + skip button with countdown) shown in the design reference.

## 2. Non-goals

- Server-side ad insertion / DAI.
- Ad analytics beyond the existing internal pipeline (Youbora/Comscore plugins keep working untouched).
- Cast audio ads UI (`audioCast` flavour). Out of scope; will fall back to `skipAd() → false`.
- Any changes to video flavour, normal flavour, or non-audio code paths.
- `language` / `skipAdLabels` extensions to `IPlayerAds` (deferred — the app paints the UI in its own i18n).
- Master branch of the player. **All work is on `feat/audio-ads`.**

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  App (eitb-guau-mobile)                                     │
│                                                             │
│  api/player/main.ts → fetchContentData                      │
│      result.playlist[i].ads = { adTagUrl: vmap.url }        │  ← (1) MAPPING
│                                                             │
│  components/customPlayer/CustomPlayer.tsx                   │
│      events.onAdStateChanged → setAdsState                  │  ← (3) SUBSCRIBE
│                                                             │
│  components/organisms/audioPlayerExpanded/AdOverlay.tsx     │
│      Render condicional sobre adsState                      │  ← (4) UI
│      onSkip → audioPlayerRef.current?.skipAd()              │  ← (5) ACTION
└────────────────────────────┬────────────────────────────────┘
                             │ playlistItem.ads.adTagUrl
                             │ events.onAdStateChanged
                             │ ref.skipAd()
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  react-native-video (rama feat/audio-ads desde 38eb15551)   │
│                                                             │
│  AudioPlayer (audioPlayerBar) — forwardRef AudioPlayerRef   │
│  └─ AudioFlavour — forwardRef AudioFlavourRef               │
│     ├─ <Video adTagUrl={playlistItem.ads.adTagUrl}>         │  ← (2) WIRE
│     ├─ AudioAdsStateMachine (nuevo)                         │
│     │    OnReceiveAdEventData → AudioAdsState               │
│     ├─ events.onAdStateChanged(state)                       │
│     └─ ref.skipAd() → VideoRef.skipAd() → native bridge     │
└─────────────────────────────────────────────────────────────┘
```

## 4. Decisions log

| # | Question | Decision |
|---|----------|----------|
| 1 | Branch base | `feat/audio-ads` from `38eb15551`. Master untouched. |
| 2 | UI ownership | App paints all visuals; player only exposes state + actions. |
| 3 | Event API shape | Single consolidated `onAdStateChanged(state: AudioAdsState)`. |
| 4a | Where the callback lives | `IInnerPlayerEvents` (next to `onPlay`, `onProgress`, …). |
| 4b | How skip is triggered | Imperative `audioPlayerRef.current?.skipAd()` via `forwardRef`. |
| 5 | Native skip work | F1 — full scope: Android + iOS native bridge. |

## 5. Type contracts

`IPlayerAds` stays as-is (`{ adTagUrl?: string }`). All new types are additive.

### 5.1 `AudioAdsState` (new, in `src/player/types/types.ts`)

```ts
export interface AudioAdsState {
  /** True from AD_BREAK_STARTED until CONTENT_RESUME_REQUESTED / ALL_ADS_COMPLETED. */
  isPlayingAd: boolean;
  /** Current creative title from raw event data; undefined if not provided. */
  adTitle?: string;
  /** Current creative elapsed seconds. 0 when idle. */
  currentTime: number;
  /** Current creative total seconds. 0 when unknown. */
  duration: number;
  /** 1-based position of the current creative in the break. 0 when idle. */
  adIndex: number;
  /** Total creatives in the current break. 0 when unknown. */
  totalAds: number;
  /** True once skipOffset is reached and the user can skip. */
  canSkipAd: boolean;
  /** Seconds remaining until skippable. null when the ad is not skippable. */
  secondsUntilSkippable: number | null;
}
```

### 5.2 `IInnerPlayerEvents` extension (in `src/player/types/events.ts`)

```ts
export interface IInnerPlayerEvents extends IPlayerEvents {
  // … existing fields untouched …
  /** Emitted whenever the audio ad state changes. Idle = isPlayingAd:false. */
  onAdStateChanged?: (state: AudioAdsState) => void;
}
```

### 5.3 New refs (in `src/player/types/types.ts`)

```ts
export interface AudioFlavourRef {
  skipAd: () => Promise<boolean>;
}

export interface AudioPlayerRef {
  skipAd: () => Promise<boolean>;
}
```

### 5.4 `VideoRef` extension (in `src/Video.tsx`)

```ts
export interface VideoRef {
  seek: (time: number, tolerance?: number) => void;
  presentFullscreenPlayer: () => void;
  skipAd: () => Promise<void>;
}
```

### 5.5 `VideoManagerType` extension (in `src/specs/VideoNativeComponent.ts`)

```ts
export interface VideoManagerType {
  // … existing methods …
  skipAd: (reactTag: number) => Promise<void>;
}
```

### 5.6 Re-exports (in `src/player/types/index.ts` and `src/index.ts`)

Export `AudioAdsState`, `AudioFlavourRef`, `AudioPlayerRef` from the package barrel so the app can `import type { AudioAdsState, AudioPlayerRef } from "react-native-video"`.

## 6. State machine

### 6.1 Location

`src/player/features/ads/audioAdsStateMachine.ts` (new directory `features/ads`).

### 6.2 Internal raw event shape

```ts
type RawAdEventData = {
  adId?: string;
  adTitle?: string;
  adPosition?: number;     // 1-based
  totalAds?: number;
  currentTime?: number;
  duration?: number;
  skipOffset?: number;     // seconds until skippable; <0 = not skippable
  isSkippable?: boolean;
};
```

`OnReceiveAdEventData` is typed `{ data?: {} }` at this commit but the native side
emits arbitrary fields. The state machine narrows defensively:
`const raw = (event.data ?? {}) as RawAdEventData`.

### 6.3 Transition table

| Event | `isPlayingAd` | Fields updated |
|---|---|---|
| `AD_BREAK_STARTED` | `true` | reset progress; capture `totalAds` if present |
| `LOADED` | `true` | `adTitle`, `duration`, `skipOffset`, `adIndex` |
| `STARTED` | `true` | same as `LOADED` (defensive: iOS sometimes only emits `STARTED`) |
| `AD_PROGRESS` / `FIRST_QUARTILE` / `MIDPOINT` / `THIRD_QUARTILE` | `true` | `currentTime`; recompute `canSkipAd` & `secondsUntilSkippable` |
| `COMPLETED` | `true` | `currentTime = duration` |
| `SKIPPED` | `true` | (await break end / next ad) |
| `ERROR` | `true` | log warn; do not flip `isPlayingAd` |
| `AD_BREAK_ENDED` | `true` | (await `CONTENT_RESUME_REQUESTED`) |
| `CONTENT_RESUME_REQUESTED` | **`false`** | reset to IDLE, emit final state |
| `ALL_ADS_COMPLETED` | **`false`** | reset to IDLE |
| `CONTENT_PAUSE_REQUESTED` / `IMPRESSION` / `CLICK` / `TAPPED` / informational | unchanged | no-op |
| unknown event name | unchanged | log warn once per unknown name |

### 6.4 Derivations

```
if (!isSkippable || skipOffset == null || skipOffset < 0)
    canSkipAd = false
    secondsUntilSkippable = null
else
    secondsUntilSkippable = max(0, ceil(skipOffset - currentTime))
    canSkipAd = secondsUntilSkippable === 0
```

### 6.5 Throttling

- Emit only when the derived `AudioAdsState` differs from the previous one (deep equality of the seven public fields).
- `secondsUntilSkippable` change is debounced to integer-second granularity so the
  countdown UI redraws at most once per second.

### 6.6 Edge cases

1. **No ads (vmap absent):** no AD events fire; state stays IDLE; no `onAdStateChanged` calls. App's default `adsState=null` covers this.
2. **Non-skippable ad:** `secondsUntilSkippable=null` → app does not render skip button.
3. **Source change during ad:** flavour calls `stateMachine.reset()`, emitting one final IDLE state.
4. **Multi-ad break:** `isPlayingAd` stays `true` between `COMPLETED` and the next `STARTED`; `adIndex` advances.
5. **Postroll:** content has ended; ad events still flow; UI may re-mount overlay.
6. **Recoverable IMA error:** `ERROR` does not flip `isPlayingAd`; IMA may continue with the next creative.
7. **Programmatic skip:** `ref.skipAd()` triggers native skip → IMA emits `SKIPPED` → state machine processes naturally. We do **not** optimistically mutate state.

### 6.7 Unit tests

`src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- `derive_returns_idle_when_initial`
- `derive_started_sets_metadata`
- `derive_progress_updates_countdown_and_canSkip`
- `derive_skip_offset_passed_marks_canSkip_true`
- `derive_content_resume_returns_idle`
- `derive_unknown_event_is_noop_with_single_warn`
- `derive_multi_ad_break_advances_index_without_flipping_isPlayingAd`
- `state_machine_emits_only_on_change`
- `state_machine_emits_integer_second_countdown`

## 7. Player implementation

### 7.1 Audio flavour (`src/player/flavours/audio/index.tsx`)

A. **Wire `adTagUrl` to `<Video>`** (1 line — unblocks "ads sound" milestone):

```tsx
<Video
  …
  adTagUrl={props.playlistItem?.ads?.adTagUrl}
  …
```

B. **Instantiate state machine and wire onReceiveAdEvent:**

The state machine is created once and lives for the lifetime of the flavour, but
its emit callback must always read **the latest** `props.events.onAdStateChanged`
to avoid stale-closure bugs. Use a ref for the callback indirection:

```tsx
const onAdStateChangedRef = useRef(props.events?.onAdStateChanged);
useEffect(() => {
  onAdStateChangedRef.current = props.events?.onAdStateChanged;
}, [props.events?.onAdStateChanged]);

const adsStateMachineRef = useRef<AudioAdsStateMachine | null>(null);
if (!adsStateMachineRef.current) {
  adsStateMachineRef.current = new AudioAdsStateMachine((state) => {
    onAdStateChangedRef.current?.(state);
  });
}

const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
  currentLogger.current?.debug(`[ADS] event=${e.event}`);
  adsStateMachineRef.current?.handleEvent(e);
};

// in <Video>:
onReceiveAdEvent={combineEventHandlers(handleOnReceiveAdEvent, videoEvents.onReceiveAdEvent)}
```

C. **Reset on source change / unmount:**

In the existing source-change effect and in the cleanup return: `adsStateMachineRef.current?.reset()`.

D. **Convert to `forwardRef` and expose `skipAd()`:**

```tsx
export const AudioFlavour = forwardRef<AudioFlavourRef, AudioFlavourProps>(
  function AudioFlavour(props, ref) {
    …
    useImperativeHandle(ref, () => ({
      skipAd: async () => {
        try {
          await refVideoPlayer.current?.skipAd();
          return true;
        } catch (err) {
          currentLogger.current?.warn('[ADS] skipAd failed', err);
          return false;
        }
      },
    }), []);
    …
  }
);
```

### 7.2 AudioPlayer wrapper (`src/player/components/audioPlayerBar/index.tsx`)

Convert to `forwardRef<AudioPlayerRef>` and delegate to the active flavour.
`audioCast` returns `false` from `skipAd` (out of scope at this commit).

```tsx
export const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  function AudioPlayer(props, ref) {
    const audioFlavourRef = useRef<AudioFlavourRef>(null);
    useImperativeHandle(ref, () => ({
      skipAd: async () => audioFlavourRef.current?.skipAd() ?? false,
    }), []);
    …
    <AudioFlavour ref={audioFlavourRef} … />
  }
);
```

### 7.3 Native bridge — `VideoRef.skipAd()`

**JS layer:**
- `src/Video.tsx`: add `skipAd` to `VideoRef`, implement via `VideoManager.skipAd(reactTag)`.
- `src/specs/VideoNativeComponent.ts`: add `skipAd: (reactTag: number) => Promise<void>` to `VideoManagerType`.

**Android (`android/`):**
- `ReactExoplayerViewManager` (or current manager): expose `@ReactMethod public void skipAd(int reactTag)`.
- `ReactExoplayerView` (or current view): `public void skipAd()` → call `currentAdsManager.skip()`. Need to retain a reference to `AdsManager` from the `AdsManagerLoadedEvent` listener (verify wiring in this branch's IMA integration).

**iOS (`ios/`):**
- Add `@objc(skipAd:)` method to the appropriate Video manager class.
- Resolve the view by `reactTag` and call `view.adsManager?.skip()` where `adsManager` is the retained `IMAAdsManager` from `adsLoadedWithData`.

### 7.4 Player tests

- Unit (Jest, JS): state machine tests in 6.7.
- Unit (Jest, JS): `audio-flavour-ad-events.test.tsx` — mocks `<Video>` and asserts that `events.onAdStateChanged` is called with the expected state sequence.
- Manual on-device tests in §10.

## 8. App implementation

### 8.1 Mapping (`src/api/player/main.ts:fetchContentData`)

```ts
const adTagUrl = (responseJson?.vmap?.url as string | undefined) ?? undefined;
const playlistItem: PlaylistItem = {
  …,
  ads: adTagUrl ? { adTagUrl } : undefined,
  …,
};
```

If existing `src/api/player/ads.ts` already exposes a helper, reuse it.

### 8.2 Subscription (`src/components/customPlayer/CustomPlayer.tsx`)

- Add `audioPlayerRef = useRef<AudioPlayerRef>(null)`.
- Add `[adsState, setAdsState] = useState<AudioAdsState | null>(null)`.
- Add `events.onAdStateChanged = (s) => setAdsState(s.isPlayingAd ? s : null)`.
- Pass `ref={audioPlayerRef}` to the `Player` component.
- Pass `adsState` and `audioPlayerRef` down to `audioPlayerExpanded` as plain
  props through the existing component tree. Avoid adding a context just for this.

### 8.3 UI overlay (`src/components/organisms/audioPlayerExpanded/AdOverlay.tsx`)

```ts
interface AdOverlayProps {
  state: AudioAdsState;
  onSkipPress: () => void;
}
```

Behavior:
- Render only when `state.isPlayingAd === true`.
- `[PUBLICIDAD]` chip uses `i18n.t('ads.tag')`.
- Title falls back to `i18n.t('ads.fallbackTitle')` when `state.adTitle` is missing.
- Progress is `state.currentTime / state.duration` (the podcast slider stays frozen).
- Skip button:
  - `canSkipAd && secondsUntilSkippable === 0` → enabled, label `i18n.t('ads.skip')`.
  - `!canSkipAd && secondsUntilSkippable !== null` → disabled, label `i18n.t('ads.skipCountdown', { seconds })`.
  - `secondsUntilSkippable === null` → not rendered.

`onSkipPress` calls `audioPlayerRef.current?.skipAd()`. The component does not optimistically mutate `adsState`; it waits for the natural `SKIPPED` → `CONTENT_RESUME_REQUESTED` flow.

### 8.4 i18n

Add four new keys under an `ads` namespace, in whatever locale files the app
already uses (es, eu, en). Locate the existing pattern by searching for an
existing key like `i18n.t('common.…')` in the codebase and follow it:

```json
{
  "ads": {
    "tag": "PUBLICIDAD",
    "fallbackTitle": "Anuncio",
    "skip": "Saltar anuncio",
    "skipCountdown": "Saltar anuncio ({{seconds}}s)"
  }
}
```

EU/EN translations to be confirmed with the team during implementation. The ES
copy comes from the design reference.

### 8.5 TrackPlayer interaction

The app uses `react-native-track-player` in parallel. While `isPlayingAd === true`,
TrackPlayer should remain in a consistent state (no concurrent fade-in/out). Verify
during integration that `isPlayingAd` does not clash with TrackPlayer state.

## 9. PR sequencing

1. **PR-1** (player, JS only) — types + state machine + wire `adTagUrl` + `onAdStateChanged`. Tests JS. Unblocks Checkpoints 1–3.
2. **PR-2** (player, native) — `skipAd()` on `VideoRef` + Android module + iOS module. Unblocks Checkpoint 5.
3. **PR-3** (app) — `vmap` mapping + `AdOverlay` + i18n + bump patch. Unblocks Checkpoints 4, 6–8.

**Dependencies between PRs:**

- PR-2 depends on PR-1 (the audio flavour must already call
  `refVideoPlayer.current?.skipAd()` for the native bridge to be exercised).
- PR-3 depends on **both PR-1 and PR-2**: the app patch in `package.json` must
  point to a commit that contains the native skip implementation, otherwise the
  skip button in the overlay will throw at runtime.
- PR-1 can be merged and validated in isolation against the app (Checkpoints 1–3
  do not need native skip).

## 10. Validation plan

| # | Action | Expected outcome | Pass criterion |
|---|--------|------------------|----------------|
| 1 | Bump `react-native-video` patch in app to the head of `feat/audio-ads` | Yarn installs cleanly | clean install |
| 2 | Play `zulora-1-deskonexioa` | A preroll ad plays before the podcast | ad audible | **CHECKPOINT 1** |
| 3 | Inspect logs `[ADS] event=…` and `[ADS] state=…` | Sequence: AD_BREAK_STARTED → LOADED → STARTED → AD_PROGRESS×N → COMPLETED → AD_BREAK_ENDED → CONTENT_RESUME_REQUESTED | ordered logs | **CHECKPOINT 2** |
| 4 | Open expanded player view during ad | PUBLICIDAD overlay visible with title + countdown | UI matches reference image | **CHECKPOINT 3** |
| 5 | Wait for `secondsUntilSkippable === 0` and tap "Saltar anuncio" | Ad ends immediately, podcast resumes | skip works on iOS+Android | **CHECKPOINT 4** |
| 6 | Play media without `vmap` | No overlay, content plays directly | zero `onAdStateChanged` calls | **CHECKPOINT 5** |
| 7 | Play media with multi-ad pod | `adIndex` increments (1/3, 2/3 …) | UI reflects index | **CHECKPOINT 6** |
| 8 | Close player mid-ad | No crash, no leak, next play clean | no warnings | **CHECKPOINT 7** |

## 11. Risks

| Risk | Mitigation |
|---|---|
| `AdsManager` reference not retained in this commit's IMA integration | Investigate at the start of native phase; add a setter in the IMA listener if missing |
| `data` field names differ Android↔iOS for the same logical event | Defensive cast + per-platform fixtures in unit tests |
| Zulora media fails to deliver ads in some networks/regions | Maintain a known-good fallback media for QA |
| `react-native-track-player` interferes with audio session during IMA playback | Pause TrackPlayer interactions while `isPlayingAd=true` |
| Existing yarn patch does not apply on top of the new branch | Regenerate the patch via `yarn patch` after PR-1/PR-2 ship |

## 12. Out of scope (explicit)

- `audioCast` flavour ads (skip will return `false`).
- Ad analytics extensions.
- `IPlayerAds.language` / `IPlayerAds.skipAdLabels` (defer; app handles i18n).
- Master-branch backports.
- DAI / SSAI.

## 13. Acceptance criteria

- Checkpoints 1–7 in §10 all pass.
- New unit tests pass in CI.
- No regressions in existing audio-flavour tests.
- App `package.json` patch updated to a published commit of `feat/audio-ads`.
- Spec referenced in PR descriptions.
