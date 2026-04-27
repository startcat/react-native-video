# Audio Ads PR-1 — Player JS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make audio ads play through the IMA SDK in the audio flavour, and emit a consolidated `onAdStateChanged(state)` event so consumers can render an ad overlay. JavaScript/TypeScript only — no native bridge changes (those land in PR-2).

**Architecture:** Pure-TS reducer `deriveAudioAdsState(prev, event)` wrapped in a thin emitter class `AudioAdsStateMachine`. The audio flavour wires the state machine to `<Video>`'s `onReceiveAdEvent`, derives a public `AudioAdsState`, and pushes it to `props.events.onAdStateChanged` via a ref-stable callback. `<Video>` receives `adTagUrl` directly from `playlistItem.ads.adTagUrl`.

**Tech Stack:** TypeScript, Jest + ts-jest for unit tests, the `react-native-video` patched fork at branch `feat/audio-ads` (rooted at `38eb15551`).

**Spec:** `docs/superpowers/specs/2026-04-27-audio-ads-design.md`

**Out of scope for this PR:**
- Native `VideoRef.skipAd()` (PR-2).
- `AudioFlavourRef` / `AudioPlayerRef` `forwardRef` work (PR-2).
- App side `vmap` mapping and overlay UI (PR-3).

---

## File Structure

**Create:**
- `jest.config.js` — minimal Jest + ts-jest configuration scoped to `src/`.
- `src/player/features/ads/types.ts` — internal `RawAdEventData` + `AD_EVENT` constants.
- `src/player/features/ads/audioAdsStateMachine.ts` — pure reducer + emitter class.
- `src/player/features/ads/index.ts` — barrel re-export.
- `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts` — unit tests, grown task-by-task.

**Modify:**
- `package.json` — add `ts-jest` devDependency, replace placeholder `test` script.
- `src/player/types/types.ts` — add `AudioAdsState`.
- `src/player/types/events.ts` — add `onAdStateChanged` to `IInnerPlayerEvents`.
- `src/player/types/index.ts` — re-export `AudioAdsState`.
- `src/index.ts` — re-export `AudioAdsState` from package barrel.
- `src/player/flavours/audio/index.tsx` — wire `adTagUrl`, instantiate state machine, route `onReceiveAdEvent`, reset on source change.

---

## Task 1: Set up Jest with ts-jest

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`

- [ ] **Step 1.1: Add `ts-jest` to devDependencies**

Run:
```bash
yarn add -D ts-jest@^29
```

Expected: `package.json` updated, `yarn.lock` updated, `node_modules/ts-jest` installed.

- [ ] **Step 1.2: Replace the placeholder `test` script in `package.json`**

In `package.json`, replace:
```json
"test": "echo no test available",
```
with:
```json
"test": "jest",
```

- [ ] **Step 1.3: Create `jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/examples/', '/dist/', '/lib/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: { warnOnly: true } }],
  },
};
```

- [ ] **Step 1.4: Create a temporary smoke test to confirm Jest runs**

Create `src/__tests__/jest-setup.test.ts`:
```ts
test('jest is wired', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 1.5: Run the smoke test**

Run:
```bash
yarn test
```

Expected: `1 passed, 1 total`. If it fails: fix `jest.config.js` or `tsconfig.json` interactions before continuing.

- [ ] **Step 1.6: Remove the temporary smoke test**

Delete `src/__tests__/jest-setup.test.ts`. Leave the directory in place if empty.

- [ ] **Step 1.7: Commit**

```bash
git add package.json yarn.lock jest.config.js
git commit -m "chore(test): wire jest with ts-jest preset for src/"
```

---

## Task 2: Add `AudioAdsState` type

**Files:**
- Modify: `src/player/types/types.ts`
- Modify: `src/player/types/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 2.1: Add `AudioAdsState` to `src/player/types/types.ts`**

Locate the section near `AudioPlayerEventProps` / `AudioPlayerActionEventProps` (around lines 213–245 at the base commit). Insert immediately after `AudioPlayerProgressEventProps`:

```ts
/**
 * Public state of the audio ads playback. Consumed by host apps to render
 * the "PUBLICIDAD" overlay during ad breaks. Emitted via
 * IInnerPlayerEvents.onAdStateChanged.
 */
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

- [ ] **Step 2.2: Re-export from `src/player/types/index.ts`**

Add to whichever export block already lists types from `./types` (find the existing line that exports `AudioPlayerEventProps` and append):
```ts
export type { AudioAdsState } from "./types";
```

If the existing pattern is one combined `export type { … } from "./types"` block, add `AudioAdsState` to that list.

- [ ] **Step 2.3: Re-export from `src/index.ts`**

Find the line(s) that re-export from `./player/types` (or equivalent). Add `AudioAdsState` to the exported names. If the package barrel does `export * from "./player/types"`, no change is required — verify by checking the file.

- [ ] **Step 2.4: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile (or pre-existing warnings unchanged). If a new error mentions `AudioAdsState`, fix before commit.

- [ ] **Step 2.5: Commit**

```bash
git add src/player/types/types.ts src/player/types/index.ts src/index.ts
git commit -m "feat(types): add AudioAdsState public interface"
```

---

## Task 3: Add `onAdStateChanged` to `IInnerPlayerEvents`

**Files:**
- Modify: `src/player/types/events.ts`

- [ ] **Step 3.1: Add the import for `AudioAdsState`**

Open `src/player/types/events.ts`. The file currently imports types from `./types` and `./enums`. Add `AudioAdsState` to the import from `./types`:
```ts
import {
    type ICommonData,
    type IPreferencesCommonData,
    type AudioAdsState,
} from './types';
```

- [ ] **Step 3.2: Extend `IInnerPlayerEvents`**

Inside `IInnerPlayerEvents` (after `onClose`), add:
```ts
    /** Emitted whenever the audio ad state changes. Idle state has isPlayingAd=false. */
    onAdStateChanged?: (state: AudioAdsState) => void;
```

- [ ] **Step 3.3: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile.

- [ ] **Step 3.4: Commit**

```bash
git add src/player/types/events.ts
git commit -m "feat(events): add IInnerPlayerEvents.onAdStateChanged"
```

---

## Task 4: Internal types for the state machine

**Files:**
- Create: `src/player/features/ads/types.ts`

- [ ] **Step 4.1: Create the file**

Path: `src/player/features/ads/types.ts`

```ts
/**
 * Internal-only types for the audio ads state machine.
 * NOT exported from the package barrel.
 */

/**
 * Shape of the `data` payload that the native module emits inside
 * OnReceiveAdEventData. Spec types it as `{}`; actual runtime values are
 * platform-dependent and may be partial. Always read defensively.
 */
export type RawAdEventData = {
  adId?: string;
  adTitle?: string;
  /** 1-based position of the current creative in the break. */
  adPosition?: number;
  totalAds?: number;
  /** Seconds elapsed within the current creative. */
  currentTime?: number;
  /** Total seconds of the current creative. */
  duration?: number;
  /** Seconds until the ad becomes skippable. Negative or absent means non-skippable. */
  skipOffset?: number;
  isSkippable?: boolean;
};

/**
 * Subset of IMA event names this state machine reacts to. Names not in this
 * set are treated as no-ops (with a single warning log per unknown name).
 */
export const AD_EVENT = {
  AD_BREAK_STARTED: "AD_BREAK_STARTED",
  AD_BREAK_ENDED: "AD_BREAK_ENDED",
  ALL_ADS_COMPLETED: "ALL_ADS_COMPLETED",
  CONTENT_PAUSE_REQUESTED: "CONTENT_PAUSE_REQUESTED",
  CONTENT_RESUME_REQUESTED: "CONTENT_RESUME_REQUESTED",
  LOADED: "LOADED",
  STARTED: "STARTED",
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
  ERROR: "ERROR",
  AD_PROGRESS: "AD_PROGRESS",
  FIRST_QUARTILE: "FIRST_QUARTILE",
  MIDPOINT: "MIDPOINT",
  THIRD_QUARTILE: "THIRD_QUARTILE",
} as const;

export type AdEventName = (typeof AD_EVENT)[keyof typeof AD_EVENT];
```

- [ ] **Step 4.2: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile.

- [ ] **Step 4.3: Commit**

```bash
git add src/player/features/ads/types.ts
git commit -m "feat(ads): add internal RawAdEventData and AD_EVENT names"
```

---

## Task 5: Reducer skeleton — initial state and IDLE transitions

**Files:**
- Create: `src/player/features/ads/audioAdsStateMachine.ts`
- Create: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`:
```ts
import type { OnReceiveAdEventData } from "../../../../types/events";
import { deriveAudioAdsState, INITIAL_AUDIO_ADS_STATE } from "../audioAdsStateMachine";

const evt = (event: string, data: Record<string, unknown> = {}): OnReceiveAdEventData =>
  ({ event, data } as unknown as OnReceiveAdEventData);

describe("deriveAudioAdsState — idle transitions", () => {
  it("returns INITIAL_AUDIO_ADS_STATE shape with all known fields", () => {
    expect(INITIAL_AUDIO_ADS_STATE).toEqual({
      isPlayingAd: false,
      adTitle: undefined,
      currentTime: 0,
      duration: 0,
      adIndex: 0,
      totalAds: 0,
      canSkipAd: false,
      secondsUntilSkippable: null,
    });
  });

  it("CONTENT_RESUME_REQUESTED resets any state to IDLE", () => {
    const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, adIndex: 2, currentTime: 5 };
    expect(deriveAudioAdsState(dirty, evt("CONTENT_RESUME_REQUESTED"))).toEqual(INITIAL_AUDIO_ADS_STATE);
  });

  it("ALL_ADS_COMPLETED resets any state to IDLE", () => {
    const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, totalAds: 3 };
    expect(deriveAudioAdsState(dirty, evt("ALL_ADS_COMPLETED"))).toEqual(INITIAL_AUDIO_ADS_STATE);
  });
});
```

- [ ] **Step 5.2: Run the test, expect failure**

Run:
```bash
yarn test src/player/features/ads
```

Expected: FAIL with "Cannot find module '../audioAdsStateMachine'".

- [ ] **Step 5.3: Implement the minimal reducer**

Create `src/player/features/ads/audioAdsStateMachine.ts`:
```ts
import type { OnReceiveAdEventData } from "../../../types/events";
import type { AudioAdsState } from "../../types";
import { AD_EVENT } from "./types";

export const INITIAL_AUDIO_ADS_STATE: AudioAdsState = {
  isPlayingAd: false,
  adTitle: undefined,
  currentTime: 0,
  duration: 0,
  adIndex: 0,
  totalAds: 0,
  canSkipAd: false,
  secondsUntilSkippable: null,
};

export function deriveAudioAdsState(prev: AudioAdsState, event: OnReceiveAdEventData): AudioAdsState {
  switch (event.event) {
    case AD_EVENT.CONTENT_RESUME_REQUESTED:
    case AD_EVENT.ALL_ADS_COMPLETED:
      return { ...INITIAL_AUDIO_ADS_STATE };
    default:
      return prev;
  }
}
```

- [ ] **Step 5.4: Run the test, expect pass**

Run:
```bash
yarn test src/player/features/ads
```

Expected: 3 tests passing.

- [ ] **Step 5.5: Commit**

```bash
git add src/player/features/ads/audioAdsStateMachine.ts src/player/features/ads/__tests__/audioAdsStateMachine.test.ts
git commit -m "feat(ads): reducer skeleton with idle transitions"
```

---

## Task 6: Reducer — `AD_BREAK_STARTED`

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 6.1: Add failing test**

Append to the test file:
```ts
describe("deriveAudioAdsState — AD_BREAK_STARTED", () => {
  it("flips isPlayingAd to true and resets per-creative fields", () => {
    const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, currentTime: 99, adIndex: 2, totalAds: 3 };
    const next = deriveAudioAdsState(dirty, evt("AD_BREAK_STARTED", { totalAds: 3 }));
    expect(next.isPlayingAd).toBe(true);
    expect(next.currentTime).toBe(0);
    expect(next.duration).toBe(0);
    expect(next.adIndex).toBe(0);
    expect(next.totalAds).toBe(3);
  });

  it("leaves totalAds=0 when not provided", () => {
    const next = deriveAudioAdsState(INITIAL_AUDIO_ADS_STATE, evt("AD_BREAK_STARTED"));
    expect(next.isPlayingAd).toBe(true);
    expect(next.totalAds).toBe(0);
  });
});
```

- [ ] **Step 6.2: Run, expect failure**

Run: `yarn test src/player/features/ads`
Expected: 2 new failures ("Expected true, received false").

- [ ] **Step 6.3: Add the case to the reducer**

In `src/player/features/ads/audioAdsStateMachine.ts`, add an import:
```ts
import { AD_EVENT, type RawAdEventData } from "./types";
```

Inside `deriveAudioAdsState`, before the `default:` case:
```ts
    case AD_EVENT.AD_BREAK_STARTED: {
      const raw = (event.data ?? {}) as RawAdEventData;
      return {
        ...INITIAL_AUDIO_ADS_STATE,
        isPlayingAd: true,
        totalAds: raw.totalAds ?? 0,
      };
    }
```

- [ ] **Step 6.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all tests passing (5 total).

- [ ] **Step 6.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): handle AD_BREAK_STARTED"
```

---

## Task 7: Reducer — `STARTED` and `LOADED` (creative metadata)

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 7.1: Add failing tests**

Append to the test file:
```ts
describe("deriveAudioAdsState — STARTED / LOADED", () => {
  it("captures creative metadata on STARTED", () => {
    const after = deriveAudioAdsState(
      deriveAudioAdsState(INITIAL_AUDIO_ADS_STATE, evt("AD_BREAK_STARTED", { totalAds: 2 })),
      evt("STARTED", { adTitle: "Hello Ad", duration: 15, adPosition: 1, totalAds: 2 }),
    );
    expect(after.isPlayingAd).toBe(true);
    expect(after.adTitle).toBe("Hello Ad");
    expect(after.duration).toBe(15);
    expect(after.adIndex).toBe(1);
    expect(after.totalAds).toBe(2);
    expect(after.currentTime).toBe(0);
  });

  it("LOADED is treated like STARTED (defensive on iOS)", () => {
    const after = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("LOADED", { adTitle: "X", duration: 10, adPosition: 1 }),
    );
    expect(after.isPlayingAd).toBe(true);
    expect(after.adTitle).toBe("X");
    expect(after.duration).toBe(10);
    expect(after.adIndex).toBe(1);
  });

  it("missing fields fall back to previous values", () => {
    const seeded = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, adTitle: "Old", duration: 30, adIndex: 1 };
    const after = deriveAudioAdsState(seeded, evt("STARTED", {}));
    expect(after.adTitle).toBe("Old");
    expect(after.duration).toBe(30);
    expect(after.adIndex).toBe(1);
  });
});
```

- [ ] **Step 7.2: Run, expect failures**

Run: `yarn test src/player/features/ads`
Expected: 3 new failures.

- [ ] **Step 7.3: Add the cases to the reducer**

In `src/player/features/ads/audioAdsStateMachine.ts`, add before the `default:` case:
```ts
    case AD_EVENT.STARTED:
    case AD_EVENT.LOADED: {
      const raw = (event.data ?? {}) as RawAdEventData;
      return {
        ...prev,
        isPlayingAd: true,
        adTitle: raw.adTitle ?? prev.adTitle,
        duration: raw.duration ?? prev.duration,
        adIndex: raw.adPosition ?? prev.adIndex,
        totalAds: raw.totalAds ?? prev.totalAds,
        currentTime: raw.currentTime ?? 0,
      };
    }
```

- [ ] **Step 7.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: 8 tests passing.

- [ ] **Step 7.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): capture creative metadata on STARTED/LOADED"
```

---

## Task 8: Reducer — progress events (`AD_PROGRESS`, quartiles, `COMPLETED`)

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 8.1: Add failing tests**

Append to the test file:
```ts
describe("deriveAudioAdsState — progress events", () => {
  const seeded = {
    ...INITIAL_AUDIO_ADS_STATE,
    isPlayingAd: true,
    adTitle: "Ad",
    duration: 15,
    adIndex: 1,
    totalAds: 1,
  };

  it("AD_PROGRESS updates currentTime and duration", () => {
    const next = deriveAudioAdsState(seeded, evt("AD_PROGRESS", { currentTime: 5, duration: 15 }));
    expect(next.currentTime).toBe(5);
    expect(next.duration).toBe(15);
    expect(next.isPlayingAd).toBe(true);
  });

  it.each(["FIRST_QUARTILE", "MIDPOINT", "THIRD_QUARTILE"])("%s also updates progress", (name) => {
    const next = deriveAudioAdsState(seeded, evt(name, { currentTime: 7 }));
    expect(next.currentTime).toBe(7);
  });

  it("COMPLETED snaps currentTime to duration and stays isPlayingAd", () => {
    const next = deriveAudioAdsState(seeded, evt("COMPLETED"));
    expect(next.currentTime).toBe(15);
    expect(next.isPlayingAd).toBe(true);
  });
});
```

- [ ] **Step 8.2: Run, expect failures**

Run: `yarn test src/player/features/ads`

- [ ] **Step 8.3: Add the cases to the reducer**

In `src/player/features/ads/audioAdsStateMachine.ts`, add before the `default:` case:
```ts
    case AD_EVENT.AD_PROGRESS:
    case AD_EVENT.FIRST_QUARTILE:
    case AD_EVENT.MIDPOINT:
    case AD_EVENT.THIRD_QUARTILE: {
      const raw = (event.data ?? {}) as RawAdEventData;
      return {
        ...prev,
        isPlayingAd: true,
        currentTime: raw.currentTime ?? prev.currentTime,
        duration: raw.duration ?? prev.duration,
      };
    }
    case AD_EVENT.COMPLETED:
      return { ...prev, isPlayingAd: true, currentTime: prev.duration };
```

- [ ] **Step 8.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all green (13 tests passing).

- [ ] **Step 8.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): handle AD_PROGRESS, quartiles, and COMPLETED"
```

---

## Task 9: Reducer — skippable derivation (`canSkipAd` / `secondsUntilSkippable`)

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 9.1: Add failing tests**

Append:
```ts
describe("deriveAudioAdsState — skippable derivations", () => {
  it("non-skippable ad: canSkipAd=false, secondsUntilSkippable=null", () => {
    const next = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("STARTED", { duration: 15, isSkippable: false }),
    );
    expect(next.canSkipAd).toBe(false);
    expect(next.secondsUntilSkippable).toBeNull();
  });

  it("skippable but not yet reached: secondsUntilSkippable counts down (ceil)", () => {
    const next = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("AD_PROGRESS", { currentTime: 1.4, duration: 15, isSkippable: true, skipOffset: 5 }),
    );
    expect(next.canSkipAd).toBe(false);
    expect(next.secondsUntilSkippable).toBe(4); // ceil(5 - 1.4) = 4
  });

  it("skippable threshold reached: canSkipAd=true, secondsUntilSkippable=0", () => {
    const next = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("AD_PROGRESS", { currentTime: 5.2, duration: 15, isSkippable: true, skipOffset: 5 }),
    );
    expect(next.canSkipAd).toBe(true);
    expect(next.secondsUntilSkippable).toBe(0);
  });

  it("negative skipOffset (sentinel) treated as non-skippable", () => {
    const next = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("AD_PROGRESS", { currentTime: 5, duration: 15, isSkippable: true, skipOffset: -1 }),
    );
    expect(next.canSkipAd).toBe(false);
    expect(next.secondsUntilSkippable).toBeNull();
  });

  it("missing skipOffset treated as non-skippable", () => {
    const next = deriveAudioAdsState(
      INITIAL_AUDIO_ADS_STATE,
      evt("AD_PROGRESS", { currentTime: 5, duration: 15, isSkippable: true }),
    );
    expect(next.canSkipAd).toBe(false);
    expect(next.secondsUntilSkippable).toBeNull();
  });
});
```

- [ ] **Step 9.2: Run, expect failures**

Run: `yarn test src/player/features/ads`

- [ ] **Step 9.3: Implement `deriveSkippable` and apply it to STARTED/LOADED/AD_PROGRESS/quartiles**

In `src/player/features/ads/audioAdsStateMachine.ts`, add a helper above `deriveAudioAdsState`:
```ts
function deriveSkippable(
  raw: RawAdEventData,
  currentTime: number,
): Pick<AudioAdsState, "canSkipAd" | "secondsUntilSkippable"> {
  const skipOffset = raw.skipOffset;
  if (raw.isSkippable !== true || skipOffset == null || skipOffset < 0) {
    return { canSkipAd: false, secondsUntilSkippable: null };
  }
  const remaining = Math.max(0, Math.ceil(skipOffset - currentTime));
  return { canSkipAd: remaining === 0, secondsUntilSkippable: remaining };
}
```

Then replace the existing STARTED/LOADED case with:
```ts
    case AD_EVENT.STARTED:
    case AD_EVENT.LOADED: {
      const raw = (event.data ?? {}) as RawAdEventData;
      const currentTime = raw.currentTime ?? 0;
      const next: AudioAdsState = {
        ...prev,
        isPlayingAd: true,
        adTitle: raw.adTitle ?? prev.adTitle,
        duration: raw.duration ?? prev.duration,
        adIndex: raw.adPosition ?? prev.adIndex,
        totalAds: raw.totalAds ?? prev.totalAds,
        currentTime,
      };
      return { ...next, ...deriveSkippable(raw, currentTime) };
    }
```

And the existing AD_PROGRESS/quartiles case with:
```ts
    case AD_EVENT.AD_PROGRESS:
    case AD_EVENT.FIRST_QUARTILE:
    case AD_EVENT.MIDPOINT:
    case AD_EVENT.THIRD_QUARTILE: {
      const raw = (event.data ?? {}) as RawAdEventData;
      const currentTime = raw.currentTime ?? prev.currentTime;
      return {
        ...prev,
        isPlayingAd: true,
        currentTime,
        duration: raw.duration ?? prev.duration,
        ...deriveSkippable(raw, currentTime),
      };
    }
```

- [ ] **Step 9.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all green (18 tests passing).

- [ ] **Step 9.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): derive canSkipAd and secondsUntilSkippable from skipOffset"
```

---

## Task 10: Reducer — passive events and unknown events

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 10.1: Add failing tests**

Append:
```ts
describe("deriveAudioAdsState — passive and unknown events", () => {
  const seeded = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, currentTime: 5 };

  it.each(["CONTENT_PAUSE_REQUESTED", "AD_BREAK_ENDED", "SKIPPED", "ERROR"])(
    "%s does not change isPlayingAd",
    (name) => {
      const next = deriveAudioAdsState(seeded, evt(name));
      expect(next.isPlayingAd).toBe(true);
    },
  );

  it("unknown event names are no-ops (state strictly equal)", () => {
    const next = deriveAudioAdsState(seeded, evt("SOMETHING_RANDOM"));
    expect(next).toBe(seeded);
  });

  it("known passive events return prev unchanged", () => {
    const next = deriveAudioAdsState(seeded, evt("AD_BREAK_ENDED"));
    expect(next).toBe(seeded);
  });
});
```

- [ ] **Step 10.2: Run, expect failures**

Run: `yarn test src/player/features/ads`
Expected: at least the "strictly equal" tests fail because the current default returns `prev` already (which IS equal); the passive ones referencing `AD_BREAK_ENDED` etc. likely still return `prev` (already equal). Confirm pass status; if all already pass, this task is documentation only — keep going to add the explicit passive cases for clarity.

- [ ] **Step 10.3: Add explicit passive cases**

In the reducer, before the `default:` case, add (these all return `prev` strictly to make the intent explicit and prevent future regressions):
```ts
    case AD_EVENT.AD_BREAK_ENDED:
    case AD_EVENT.CONTENT_PAUSE_REQUESTED:
    case AD_EVENT.SKIPPED:
    case AD_EVENT.ERROR:
      return prev;
```

- [ ] **Step 10.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all green (24 tests passing).

- [ ] **Step 10.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): mark passive events explicitly; default no-op for unknown"
```

---

## Task 11: `AudioAdsStateMachine` class with change detection

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 11.1: Add failing tests**

Append:
```ts
import { AudioAdsStateMachine } from "../audioAdsStateMachine";

describe("AudioAdsStateMachine — emit semantics", () => {
  it("emits only when public state changes", () => {
    const onChange = jest.fn();
    const sm = new AudioAdsStateMachine(onChange);
    sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 })); // change
    sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 })); // no change
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].isPlayingAd).toBe(true);
  });

  it("debounces sub-second currentTime changes (integer-second granularity)", () => {
    const onChange = jest.fn();
    const sm = new AudioAdsStateMachine(onChange);
    sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 }));
    sm.handleEvent(evt("STARTED", { duration: 15, adPosition: 1, totalAds: 1 }));
    onChange.mockClear();
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.1, duration: 15 }));
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.4, duration: 15 }));
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.9, duration: 15 }));
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 2.0, duration: 15 }));
    expect(onChange).toHaveBeenCalledTimes(2); // floor 1, then floor 2
  });

  it("emits when secondsUntilSkippable integer changes", () => {
    const onChange = jest.fn();
    const sm = new AudioAdsStateMachine(onChange);
    sm.handleEvent(evt("AD_BREAK_STARTED"));
    sm.handleEvent(evt("STARTED", { duration: 15, isSkippable: true, skipOffset: 5 }));
    onChange.mockClear();
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 0.5, isSkippable: true, skipOffset: 5 }));
    sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.5, isSkippable: true, skipOffset: 5 }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0].secondsUntilSkippable).toBe(5); // ceil(5-0.5)
    expect(onChange.mock.calls[1][0].secondsUntilSkippable).toBe(4); // ceil(5-1.5)
  });
});
```

- [ ] **Step 11.2: Run, expect failures**

Run: `yarn test src/player/features/ads`
Expected: 3 failures with "AudioAdsStateMachine is not a constructor".

- [ ] **Step 11.3: Implement the class**

Append to `src/player/features/ads/audioAdsStateMachine.ts`:
```ts
function publicStateEqual(a: AudioAdsState, b: AudioAdsState): boolean {
  return (
    a.isPlayingAd === b.isPlayingAd &&
    a.adTitle === b.adTitle &&
    a.duration === b.duration &&
    a.adIndex === b.adIndex &&
    a.totalAds === b.totalAds &&
    a.canSkipAd === b.canSkipAd &&
    a.secondsUntilSkippable === b.secondsUntilSkippable &&
    Math.floor(a.currentTime) === Math.floor(b.currentTime)
  );
}

export class AudioAdsStateMachine {
  private state: AudioAdsState = { ...INITIAL_AUDIO_ADS_STATE };
  private readonly onChange: (state: AudioAdsState) => void;

  constructor(onChange: (state: AudioAdsState) => void) {
    this.onChange = onChange;
  }

  handleEvent(event: OnReceiveAdEventData): void {
    const next = deriveAudioAdsState(this.state, event);
    if (!publicStateEqual(this.state, next)) {
      this.state = next;
      this.onChange(next);
    }
  }

  getState(): AudioAdsState {
    return this.state;
  }
}
```

- [ ] **Step 11.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all green (27 tests passing).

- [ ] **Step 11.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): add AudioAdsStateMachine with change-detected emission"
```

---

## Task 12: `AudioAdsStateMachine.reset()`

**Files:**
- Modify: `src/player/features/ads/audioAdsStateMachine.ts`
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts`

- [ ] **Step 12.1: Add failing tests**

Append:
```ts
describe("AudioAdsStateMachine.reset", () => {
  it("emits IDLE state when called from a non-idle state", () => {
    const onChange = jest.fn();
    const sm = new AudioAdsStateMachine(onChange);
    sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 }));
    onChange.mockClear();
    sm.reset();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(INITIAL_AUDIO_ADS_STATE);
  });

  it("is a no-op when already in IDLE state", () => {
    const onChange = jest.fn();
    const sm = new AudioAdsStateMachine(onChange);
    sm.reset();
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 12.2: Run, expect failures**

Run: `yarn test src/player/features/ads`
Expected: 2 failures ("sm.reset is not a function").

- [ ] **Step 12.3: Implement `reset`**

Inside the class body in `src/player/features/ads/audioAdsStateMachine.ts`:
```ts
  reset(): void {
    if (!publicStateEqual(this.state, INITIAL_AUDIO_ADS_STATE)) {
      this.state = { ...INITIAL_AUDIO_ADS_STATE };
      this.onChange(this.state);
    }
  }
```

- [ ] **Step 12.4: Run, expect pass**

Run: `yarn test src/player/features/ads`
Expected: all green (29 tests passing).

- [ ] **Step 12.5: Commit**

```bash
git add src/player/features/ads
git commit -m "feat(ads): add AudioAdsStateMachine.reset"
```

---

## Task 13: Barrel re-export for the ads feature

**Files:**
- Create: `src/player/features/ads/index.ts`

- [ ] **Step 13.1: Create the barrel**

Path: `src/player/features/ads/index.ts`
```ts
export { AudioAdsStateMachine, INITIAL_AUDIO_ADS_STATE, deriveAudioAdsState } from "./audioAdsStateMachine";
// Internal types are intentionally NOT re-exported. Consumers use AudioAdsState from "src/player/types".
```

- [ ] **Step 13.2: Type-check**

Run:
```bash
yarn build && yarn test src/player/features/ads
```

Expected: clean compile, 29 tests passing.

- [ ] **Step 13.3: Commit**

```bash
git add src/player/features/ads/index.ts
git commit -m "feat(ads): barrel re-export for AudioAdsStateMachine"
```

---

## Task 14: Wire `adTagUrl` into the audio flavour `<Video>`

**Files:**
- Modify: `src/player/flavours/audio/index.tsx`

- [ ] **Step 14.1: Locate the `<Video>` props block**

Open `src/player/flavours/audio/index.tsx`. Find the `<Video` opening at line 1163 in the base commit. Locate the line `playInBackground={true}` (around line 1204) — this is the insertion anchor.

- [ ] **Step 14.2: Add the `adTagUrl` prop**

Insert this line immediately after `playInBackground={true}`:
```tsx
					adTagUrl={props.playlistItem?.ads?.adTagUrl}
```

(Keep the tab indentation matching the surrounding props.)

- [ ] **Step 14.3: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile.

- [ ] **Step 14.4: Commit**

```bash
git add src/player/flavours/audio/index.tsx
git commit -m "feat(audio): forward playlistItem.ads.adTagUrl to Video"
```

---

## Task 15: Wire the state machine into the audio flavour

**Files:**
- Modify: `src/player/flavours/audio/index.tsx`

- [ ] **Step 15.1: Add imports**

Near the top of the file, where existing imports are grouped, add:
```tsx
import { AudioAdsStateMachine } from "../../features/ads";
```

If `OnReceiveAdEventData` is not already imported, ensure the existing `import { type OnLoadData, type OnReceiveAdEventData } from "../../../types/events";` is present (it is at the base commit, around line 11).

- [ ] **Step 15.2: Create refs and the state machine inside `AudioFlavour`**

Inside the `AudioFlavour` function body, just below the existing refs (search for `const refVideoPlayer = useRef<VideoRef>(null);` at line 69), add:
```tsx
	// --- Ads state machine ---
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
```

If `useEffect` is not yet imported, add it to the existing React import.

- [ ] **Step 15.3: Add the `handleOnReceiveAdEvent` handler**

In the same `AudioFlavour` body, somewhere near the other `handleOn*` handlers (search for `handleOnProgress` or `handleOnLoad` for reference), add:
```tsx
	const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
		currentLogger.current?.debug(`[ADS] event=${e.event}`);
		adsStateMachineRef.current?.handleEvent(e);
	};
```

- [ ] **Step 15.4: Wire `handleOnReceiveAdEvent` into the `<Video>` prop**

In the `<Video>` JSX (line 1222 in the base commit), replace:
```tsx
					onReceiveAdEvent={videoEvents.onReceiveAdEvent}
```
with:
```tsx
					onReceiveAdEvent={combineEventHandlers(handleOnReceiveAdEvent, videoEvents.onReceiveAdEvent)}
```

`combineEventHandlers` is already defined in this file (line 297 at the base commit) and used by the surrounding props.

- [ ] **Step 15.5: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile.

- [ ] **Step 15.6: Commit**

```bash
git add src/player/flavours/audio/index.tsx
git commit -m "feat(audio): pipe IMA events into AudioAdsStateMachine and emit onAdStateChanged"
```

---

## Task 16: Reset the state machine when the source changes

**Files:**
- Modify: `src/player/flavours/audio/index.tsx`

- [ ] **Step 16.1: Add a `useEffect` that resets on `videoSource` change**

After the state machine creation (Step 15.2), add:
```tsx
	useEffect(() => {
		if (videoSource) {
			adsStateMachineRef.current?.reset();
		}
	}, [videoSource]);
```

This fires whenever the audio flavour transitions to a new source, ensuring the consumer sees a clean IDLE state before the next ad break (if any).

- [ ] **Step 16.2: Type-check**

Run:
```bash
yarn build
```

Expected: clean compile.

- [ ] **Step 16.3: Commit**

```bash
git add src/player/flavours/audio/index.tsx
git commit -m "feat(audio): reset ads state machine when video source changes"
```

---

## Task 17: Manual smoke test — Checkpoints 1 & 2 (no app changes yet)

PR-1 makes ads playable and emits the new event, but the app patch has not been bumped, so the host app still does not pass `playlistItem.ads.adTagUrl`. To validate end-to-end before merging, you must temporarily test against a local checkout of the app or a hand-edited test harness.

**Two acceptable validation paths — pick one:**

### Path A: Hand-edited app patch (preferred if you can yarn-patch locally)

- [ ] **Step 17.A.1: In the app repo, apply the new branch as a patch override**

In `/Users/danimarin/Development/Repositories/eitb-guau-mobile`, edit `package.json` `react-native-video` patch URL to point to the head commit of `feat/audio-ads`. Re-run `yarn install` and rebuild.

- [ ] **Step 17.A.2: Inject `ads.adTagUrl` into a test playlist item**

Hand-edit `src/api/player/main.ts` in the app to set `playlistItem.ads = { adTagUrl: '<vmap.url from API>' }` for the next play. (Or hand-edit a single hard-coded adTagUrl into the playlist item builder.) Add a `console.log` to confirm.

- [ ] **Step 17.A.3: Add a console subscriber for `onAdStateChanged`**

In whatever screen owns the `events` object passed to `Player` (e.g. `screens/contents/player/playerNew.tsx` or `components/customPlayer/CustomPlayer.tsx`), temporarily add:
```ts
events.onAdStateChanged = (s) => console.log('[ADS state]', s);
```

- [ ] **Step 17.A.4: Run the app and play `zulora-1-deskonexioa`**

Expected:
- An audio ad plays before the podcast (Checkpoint 1).
- Console emits a sequence of `[ADS state]` logs starting with `isPlayingAd: true`, progressing currentTime, and ending with `isPlayingAd: false` (Checkpoint 2).

### Path B: Mock-driven integration test

- [ ] **Step 17.B.1: Create `src/player/flavours/audio/__tests__/audio-flavour-ad-events.test.tsx`** that mocks `<Video>` and asserts `props.events.onAdStateChanged` is called with the expected sequence.

(Skip this in PR-1 if you do Path A. Path A is more confidence-inducing because it exercises the real native IMA event names.)

- [ ] **Step 17.C: Document validation results**

Append a "Validation log" section to the spec at `docs/superpowers/specs/2026-04-27-audio-ads-design.md` with:
- The console output snippet showing Checkpoint 2 logs.
- Date and device used.

```bash
git add docs/superpowers/specs/2026-04-27-audio-ads-design.md
git commit -m "docs(spec): record PR-1 validation results"
```

---

## Task 18: Open the PR

- [ ] **Step 18.1: Push the branch**

```bash
git push -u origin feat/audio-ads
```

- [ ] **Step 18.2: Open a PR using gh**

```bash
gh pr create --title "feat(audio): wire IMA ads + onAdStateChanged event" --body "$(cat <<'EOF'
## Summary
- Wires `playlistItem.ads.adTagUrl` to the underlying `<Video>` component in the audio flavour, so audio ads start playing through the IMA SDK.
- Adds a pure-TS reducer `deriveAudioAdsState` and a thin `AudioAdsStateMachine` emitter under `src/player/features/ads/`.
- Adds `IInnerPlayerEvents.onAdStateChanged` so consumers can render an ad overlay (PUBLICIDAD chip + countdown skip).
- Wires Jest with ts-jest. 29 unit tests for the reducer and state machine.

This is PR-1 of three. PR-2 will add native `VideoRef.skipAd()` for Android + iOS. PR-3 will integrate the app side (vmap mapping + AdOverlay UI).

Spec: `docs/superpowers/specs/2026-04-27-audio-ads-design.md`
Plan: `docs/superpowers/plans/2026-04-27-audio-ads-pr1-player-js.md`

## Test plan
- [ ] `yarn test` is green (29 tests under `src/player/features/ads`).
- [ ] `yarn build` is clean.
- [ ] Manual: with app patched against this branch + `ads.adTagUrl` injected, the Zulora podcast plays a preroll ad (Checkpoint 1).
- [ ] Manual: console logs of `[ADS state]` emit the expected lifecycle (Checkpoint 2).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL when done.

---

## Validation checklist (final review before merge)

- [ ] All 29 unit tests pass on `yarn test`.
- [ ] `yarn build` produces no new errors.
- [ ] Audio flavour file diff is < 30 lines (one Video prop, four refs/effects, one handler, one combineEventHandlers swap).
- [ ] Validation log added to the spec showing real device behaviour.
- [ ] No native files modified in this PR (Android/iOS folders untouched).
- [ ] No master-branch changes pulled in.
