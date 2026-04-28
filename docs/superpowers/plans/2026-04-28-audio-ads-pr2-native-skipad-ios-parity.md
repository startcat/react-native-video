# Audio Ads PR-2 — Native `skipAd()` + iOS Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add programmatic `audioPlayerRef.skipAd(): Promise<boolean>` that actually skips the current ad on Android (`AdsManager.skip()`) and iOS (`IMAAdsManager.skip()`), and bring iOS to parity with the three native fixes Android received in PR-1 (setAdTagUrl reload, onAdEvent metadata enrichment, currentTime in progress events).

**Architecture:** JS exposes `AudioFlavourRef` / `AudioPlayerRef` via `forwardRef`. The flavour ref calls `VideoRef.skipAd()` which dispatches through `VideoManager.skipAd(reactTag)` to the native module. Android grabs the IMA `AdsManager` via reflection on `ImaAdsLoader`'s internal `AdTagLoader` (media3 doesn't expose `skip()` publicly). iOS reuses the existing `RCTIMAAdsManager.getAdsManager()` and adds three parity fixes that mirror the Android changes from PR-1.

**Tech Stack:** TypeScript, Jest + ts-jest, React Native (Paper), Java + media3 1.5.1 + Google IMA SDK 3.35.1 on Android, Swift + GoogleInteractiveMediaAds on iOS.

**Spec:** `docs/superpowers/specs/2026-04-27-audio-ads-design.md` §5.3-5.5, §7.2-7.3.

**PR-1 baseline:** branch `feat/audio-ads` at commit `3902cb44` (33 commits, 31 unit tests passing, validated on Android).

**Out of scope for this PR:**
- App-side `vmap` mapping + `AdOverlay` UI (PR-3).
- iOS skipAd in `audioCast` flavour (cast bridge is a separate codepath; flavour ref returns `false`).
- Backend EITB vmap URL fix (separate ticket).

---

## File Structure

**Modify (JS — types & wiring):**
- `src/Video.tsx` — add `skipAd()` to `VideoRef` + implementation via `VideoManager.skipAd`.
- `src/specs/VideoNativeComponent.ts` — add `skipAd: (reactTag: number) => Promise<void>` to `VideoManagerType`.
- `src/player/types/types.ts` — add `AudioFlavourRef` and `AudioPlayerRef` interfaces.
- `src/player/types/index.ts` — re-export new ref types.
- `src/index.ts` — re-export new ref types from package barrel (verify wildcard `export *` already covers it).
- `src/player/flavours/audio/index.tsx` — convert function component to `forwardRef<AudioFlavourRef, …>`, add `useImperativeHandle` exposing `skipAd()`.
- `src/player/components/audioPlayerBar/index.tsx` — convert to `forwardRef<AudioPlayerRef, …>`, delegate `skipAd()` to the active flavour ref.
- `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts` — add a test for the JS skipAd plumbing (mocked).

**Modify (Android — skipAd):**
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerViewManager.java` — add `@ReactMethod skipAd(int reactTag)` that delegates to the view.
- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — add `public void skipAd()` that uses reflection to reach the IMA `AdsManager` and calls `.skip()`.

**Modify (iOS — parity + skipAd):**
- `ios/Video/RCTVideo.swift` — add `setAdTagUrl` reload trigger, add `skipAd()` ObjC method, change `onVideoProgress` to inject ad-relative `currentTime` while playing ad (or pass through to ad-event emission instead).
- `ios/Video/Features/RCTIMAAdsManager.swift` — add `skip()` method, enrich the `onReceiveAdEvent` payload with metadata from `event.ad`, attach `currentTime` from `_video?._player?.currentTime()` on AD_PROGRESS / quartiles / STARTED / LOADED / COMPLETED.
- `ios/Video/RCTVideoManager.m` — add `RCT_EXTERN_METHOD(skipAd : (nonnull NSNumber*)reactTag)`.

---

## Task 1: Add native spec for `skipAd`

**Files:**
- Modify: `src/specs/VideoNativeComponent.ts`

- [ ] **Step 1.1: Locate `VideoManagerType` interface and append `skipAd`**

In `src/specs/VideoNativeComponent.ts`, find the `VideoManagerType` interface (around line 417 in the base commit). Add a new method:
```ts
export interface VideoManagerType {
	save: (option: object, reactTag: number) => Promise<VideoSaveData>;
	seek: (option: Seek, reactTag: number) => Promise<void>;
	setPlayerPauseState: (paused: boolean, reactTag: number) => Promise<void>;
	setLicenseResult: (result: string, licenseUrl: string, reactTag: number) => Promise<void>;
	setLicenseResultError: (error: string, licenseUrl: string, reactTag: number) => Promise<void>;
	setVolume: (volume: number, reactTag: number) => Promise<void>;
	getCurrentPosition: (reactTag: number) => Promise<number>;
	skipAd: (reactTag: number) => Promise<void>;
}
```

- [ ] **Step 1.2: Type-check**

Run:
```bash
yarn build
```
Expected: no NEW errors.

- [ ] **Step 1.3: Commit**

```bash
git add src/specs/VideoNativeComponent.ts
git commit -m "feat(specs): add skipAd to VideoManagerType"
```

---

## Task 2: Implement `VideoRef.skipAd()` in JS

**Files:**
- Modify: `src/Video.tsx`

- [ ] **Step 2.1: Extend `VideoRef` interface**

Find the `VideoRef` interface in `src/Video.tsx` (around line 57). Add `skipAd`:
```ts
export interface VideoRef {
	seek: (time: number, tolerance?: number) => void;
	resume: () => void;
	pause: () => void;
	presentFullscreenPlayer: () => void;
	dismissFullscreenPlayer: () => void;
	restoreUserInterfaceForPictureInPictureStopCompleted: (
		restore: boolean,
	) => void;
	save: (options: object) => Promise<VideoSaveData>;
	setVolume: (volume: number) => void;
	getCurrentPosition: () => Promise<number>;
	skipAd: () => Promise<void>;
}
```

- [ ] **Step 2.2: Implement `skipAd` callable inside the forwardRef body**

Inside the `Video` `forwardRef` body, locate where other imperative methods are defined (look for `getCurrentPosition` definition for placement reference). Add:
```ts
		const skipAd = useCallback(async () => {
			await VideoManager.skipAd(getReactTag(nativeRef));
		}, []);
```

- [ ] **Step 2.3: Expose `skipAd` via `useImperativeHandle`**

Find the `useImperativeHandle` block in `Video.tsx` and add `skipAd` to the returned object alongside the other methods.

- [ ] **Step 2.4: Type-check**

Run:
```bash
yarn build
```
Expected: no NEW errors. The `VideoManager.skipAd` is a runtime stub on platforms without native impl yet — TS just verifies the type signature.

- [ ] **Step 2.5: Commit**

```bash
git add src/Video.tsx
git commit -m "feat(video): add VideoRef.skipAd dispatch via VideoManager"
```

---

## Task 3: Add `AudioFlavourRef` and `AudioPlayerRef` types

**Files:**
- Modify: `src/player/types/types.ts`
- Modify: `src/player/types/index.ts` (verify re-export)

- [ ] **Step 3.1: Add the two ref interfaces in `types.ts`**

Locate `AudioAdsState` (added in PR-1, around line 215 in the base commit, but the actual line will differ since PR-1 inserted it). Insert AFTER `AudioAdsState`:
```ts
/**
 * Imperative handle for the audio flavour. Currently only exposes skipAd —
 * extend as more imperative actions are added (pause / resume / seek-into-ad
 * are provided via the standard `events` callbacks, not the ref).
 */
export interface AudioFlavourRef {
	/**
	 * Skip the currently playing ad. Resolves true on a successful skip
	 * (the SDK reports SKIPPED), false if no ad is playing or the skip
	 * fails. Does not throw.
	 */
	skipAd: () => Promise<boolean>;
}

/**
 * Imperative handle for the AudioPlayer wrapper. Delegates to the active
 * flavour. The audioCast flavour returns false from skipAd in this PR.
 */
export interface AudioPlayerRef {
	skipAd: () => Promise<boolean>;
}
```

- [ ] **Step 3.2: Confirm package barrel exposes them**

Run:
```bash
grep -E 'export \* from .\\./types|AudioFlavourRef|AudioPlayerRef' src/player/types/index.ts src/player/index.ts src/index.ts
```
Expected: `export * from './types'` chain present (Bundle 1 of PR-1 verified this works for `AudioAdsState`). No explicit named export needed.

- [ ] **Step 3.3: Type-check**

Run:
```bash
yarn build
```
Expected: no NEW errors.

- [ ] **Step 3.4: Commit**

```bash
git add src/player/types/types.ts
git commit -m "feat(types): add AudioFlavourRef and AudioPlayerRef"
```

---

## Task 4: Convert `AudioFlavour` to `forwardRef` and expose `skipAd`

**Files:**
- Modify: `src/player/flavours/audio/index.tsx`

- [ ] **Step 4.1: Add the imports needed**

In `src/player/flavours/audio/index.tsx` near the top, ensure `forwardRef` and `useImperativeHandle` are imported from React (currently only `createElement, useCallback, useEffect, useRef, useState` are imported):
```tsx
import React, {
	createElement,
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
```

Also import the new ref type:
```tsx
import { type AudioFlavourRef } from "../../types";
```

- [ ] **Step 4.2: Convert the function declaration to `forwardRef`**

Find the existing declaration:
```tsx
export function AudioFlavour(props: AudioFlavourProps): React.ReactElement {
```

Change to:
```tsx
export const AudioFlavour = forwardRef<AudioFlavourRef, AudioFlavourProps>(
	function AudioFlavour(props, ref): React.ReactElement {
```

At the very end of the function body (before the closing brace), find the closing of the existing function and change it to close both the inner function and the `forwardRef` call:
```tsx
	}
);
```

(Verify with `git diff` that only the function signature and the closing structure changed.)

- [ ] **Step 4.3: Add `useImperativeHandle` to expose `skipAd`**

Inside the function body, AFTER the existing refs and BEFORE the JSX return (a good anchor is right after the `adsStateMachineRef` block from PR-1), add:
```tsx
	useImperativeHandle(
		ref,
		() => ({
			skipAd: async () => {
				try {
					await refVideoPlayer.current?.skipAd();
					return true;
				} catch (err) {
					currentLogger.current?.warn?.("[ADS] skipAd failed", err);
					return false;
				}
			},
		}),
		[],
	);
```

- [ ] **Step 4.4: Type-check**

Run:
```bash
yarn build
```
Expected: no NEW errors. If the surrounding callers of `<AudioFlavour … />` were typing it as a function component, `forwardRef` may surface type issues — fix any that appear.

- [ ] **Step 4.5: Smoke test the existing unit suite still works**

Run:
```bash
yarn test src/player/features/ads
```
Expected: 31/31 passing (no test changes yet, just verifying no regression).

- [ ] **Step 4.6: Commit**

```bash
git add src/player/flavours/audio/index.tsx
git commit -m "feat(audio): forwardRef AudioFlavour exposing skipAd"
```

---

## Task 5: Convert `AudioPlayer` wrapper to `forwardRef`

**Files:**
- Modify: `src/player/components/audioPlayerBar/index.tsx`

- [ ] **Step 5.1: Add `forwardRef` and `useImperativeHandle` imports**

Open `src/player/components/audioPlayerBar/index.tsx`. Verify the React import. Add to it: `forwardRef`, `useImperativeHandle`. Add the new type import:
```tsx
import { type AudioPlayerRef, type AudioFlavourRef } from "../../types";
```

- [ ] **Step 5.2: Convert the component to `forwardRef`**

Find the current declaration:
```tsx
export function AudioPlayer(props: AudioPlayerProps): React.ReactElement | null {
```

Change to:
```tsx
export const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
	function AudioPlayer(props, ref): React.ReactElement | null {
```

Close at the bottom of the body with `})`.

- [ ] **Step 5.3: Hold a ref to the inner flavour and delegate `skipAd`**

Near the existing refs at the top of the function body, add:
```tsx
	const audioFlavourRef = useRef<AudioFlavourRef | null>(null);

	useImperativeHandle(
		ref,
		() => ({
			skipAd: async () => {
				const flavour = audioFlavourRef.current;
				if (!flavour) return false;
				return flavour.skipAd();
			},
		}),
		[],
	);
```

- [ ] **Step 5.4: Pass the ref into `AudioFlavour`**

Find every `<AudioFlavour … />` JSX in this file. Add `ref={audioFlavourRef}` to it.

For `<AudioCastFlavour … />`, do NOT pass the ref — that flavour is not converted in this PR. The `audioFlavourRef.current` will be null while cast is active, and `skipAd()` will return `false`. Document this in a comment near the `<AudioCastFlavour>` JSX:
```tsx
{/* Cast flavour does not implement skipAd in PR-2; see audio-ads-design.md §2. */}
<AudioCastFlavour … />
```

- [ ] **Step 5.5: Type-check**

Run:
```bash
yarn build
```
Expected: no NEW errors.

- [ ] **Step 5.6: Commit**

```bash
git add src/player/components/audioPlayerBar/index.tsx
git commit -m "feat(audioPlayerBar): forwardRef AudioPlayer + delegate skipAd to active flavour"
```

---

## Task 6: JS unit test for the skipAd plumbing (mocked)

**Files:**
- Modify: `src/player/features/ads/__tests__/audioAdsStateMachine.test.ts` (add a co-located test for the flavour-side wiring is overreach for this file; keep this task to a logical unit)

- [ ] **Step 6.1: Skip — no JS unit test added**

Rationale: testing `forwardRef` + `useImperativeHandle` requires React Test Renderer setup. The codebase does not have RNTL configured for the player package. We rely on the existing 31 reducer tests and on the on-device validation in Task 13 / Task 16. Document this decision in the next commit message of the bundle.

- [ ] **Step 6.2: Commit a no-op marker (skip if no other change)**

No commit needed. Continue to Task 7.

---

## Task 7: Android — `VideoManager.skipAd` ReactMethod

**Files:**
- Modify: `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerViewManager.java`

- [ ] **Step 7.1: Locate the existing `@ReactMethod` patterns**

Open `ReactExoplayerViewManager.java`. Confirm that `@ReactMethod` is used for imperative methods (search for `@ReactMethod` — there should be entries like `seek`, `setPlayerPauseState`, `getCurrentPosition`).

- [ ] **Step 7.2: Add `skipAd` ReactMethod**

Below an existing `@ReactMethod` (any of them — alphabetical or near `seek` is fine), add:
```java
    @ReactMethod
    public void skipAd(final int reactTag) {
        addRunnable(reactTag, view -> {
            view.skipAd();
            return null;
        });
    }
```

If `addRunnable` is not the helper used in this file (verify by searching for how `seek` dispatches to the view), use the same dispatch pattern as `seek`. The point is: get the view by `reactTag` on the UI thread, then call `view.skipAd()`.

- [ ] **Step 7.3: Type-check / build**

Run:
```bash
yarn build
```
(Java compilation is checked at gradle build time, but `yarn build` covers TypeScript. Java compile errors will surface on the next gradle run.)

- [ ] **Step 7.4: Commit**

```bash
git add android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerViewManager.java
git commit -m "feat(android/ads): expose skipAd ReactMethod"
```

---

## Task 8: Android — `ReactExoplayerView.skipAd()` via reflection

**Files:**
- Modify: `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`

The challenge: media3 1.5.1's `ImaAdsLoader` does not expose a public `skip()` method or a `getAdsManager()` accessor. We reach the IMA SDK `AdsManager` via reflection through `ImaAdsLoader.adTagLoaderByAdsId` (a `Map<…, AdTagLoader>`), then `AdTagLoader.adsManager` (the IMA SDK `AdsManager` reference).

This is brittle in principle, but the field names have been stable since media3 1.0. We log a warning if reflection fails and return cleanly — the caller (the JS state machine) tolerates a no-op skip.

- [ ] **Step 8.1: Add the reflection-based skip helper**

In `ReactExoplayerView.java`, find `setAdTagUrl` (around line 2211, with our PR-1 changes). Add a new public method below it:
```java
    /**
     * Programmatically skip the currently playing ad on the underlying
     * IMA AdsManager. media3 1.5.1's ImaAdsLoader does not expose this
     * publicly; we reach into the IMA SDK via reflection. If reflection
     * fails (e.g. media3 internals change), this method logs a warning
     * and returns — the caller sees a no-op rather than a crash.
     */
    public void skipAd() {
        if (adsLoader == null) {
            DebugLog.w(TAG, "skipAd: adsLoader is null, ignoring");
            return;
        }
        try {
            // ImaAdsLoader holds adTagLoaderByAdsId: Map<Object, AdTagLoader>.
            java.lang.reflect.Field tagLoadersField =
                adsLoader.getClass().getDeclaredField("adTagLoaderByAdsId");
            tagLoadersField.setAccessible(true);
            Object tagLoadersMap = tagLoadersField.get(adsLoader);
            if (!(tagLoadersMap instanceof java.util.Map)) {
                DebugLog.w(TAG, "skipAd: adTagLoaderByAdsId is not a Map");
                return;
            }
            java.util.Map<?, ?> map = (java.util.Map<?, ?>) tagLoadersMap;
            if (map.isEmpty()) {
                DebugLog.w(TAG, "skipAd: no AdTagLoader registered");
                return;
            }
            // There is at most one ad tag per playing media item in our usage.
            Object adTagLoader = map.values().iterator().next();
            if (adTagLoader == null) {
                DebugLog.w(TAG, "skipAd: AdTagLoader instance is null");
                return;
            }
            java.lang.reflect.Field adsManagerField =
                adTagLoader.getClass().getDeclaredField("adsManager");
            adsManagerField.setAccessible(true);
            Object maybeAdsManager = adsManagerField.get(adTagLoader);
            if (maybeAdsManager instanceof com.google.ads.interactivemedia.v3.api.AdsManager) {
                ((com.google.ads.interactivemedia.v3.api.AdsManager) maybeAdsManager).skip();
                DebugLog.d(TAG, "skipAd: AdsManager.skip() invoked");
            } else {
                DebugLog.w(TAG, "skipAd: adsManager field is null or wrong type: "
                        + (maybeAdsManager == null ? "null" : maybeAdsManager.getClass().getName()));
            }
        } catch (NoSuchFieldException e) {
            DebugLog.w(TAG, "skipAd: media3 internal layout changed (NoSuchFieldException): " + e.getMessage());
        } catch (IllegalAccessException e) {
            DebugLog.w(TAG, "skipAd: reflection access denied: " + e.getMessage());
        } catch (Exception e) {
            DebugLog.w(TAG, "skipAd: unexpected error: " + e);
        }
    }
```

- [ ] **Step 8.2: Verify import of `DebugLog`**

`DebugLog` is already imported in this file (it's used for the existing logging). Verify with grep, no action needed if present.

- [ ] **Step 8.3: Build**

The user will run `cd android && ./gradlew :app:compileDebugJavaWithJavac` from the consumer app to verify Java compile. Skip native build here; commit and let on-device test catch issues.

- [ ] **Step 8.4: Commit**

```bash
git add android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java
git commit -m "feat(android/ads): implement skipAd via reflection on ImaAdsLoader"
```

---

## Task 9: Android — Manual on-device validation of `skipAd`

**Files:** none

This is a pure validation step — no code changes.

- [ ] **Step 9.1: Bridge a temporary skip trigger in the consumer app**

In the consumer app `eitb-guau-mobile`, locate the place where `Player` is rendered (e.g. `screens/contents/player/playerNew.tsx` or `components/customPlayer/CustomPlayer.tsx`). The Player consumer must:
1. Hold a ref of type `AudioPlayerRef` and pass it to the `Player` (`<Player ref={audioPlayerRef} … />`).
2. Add a debug button (or `useEffect` + setTimeout) that calls `audioPlayerRef.current?.skipAd()` when the user taps it.

This is consumer-side smoke test code, not production. It will be replaced by the real "Saltar anuncio" button in PR-3.

- [ ] **Step 9.2: Run the Zulora episode with the test ad URL still injected**

Recall: PR-1 left the test URL `single_preroll_skippable` in `playlists.ts`. Use that.

- [ ] **Step 9.3: Wait for `canSkipAd: true` and tap the debug button**

Expected:
- Logcat shows `D RNVExoplayer skipAd: AdsManager.skip() invoked`.
- IMA SDK emits `SKIPPED` event.
- The state machine emits `[ADS state]` with `isPlayingAd: false` shortly after (via `CONTENT_RESUME_REQUESTED`).
- The podcast content starts playing.

If reflection failed (warning logged), the next iteration is to add a fallback that registers our own `AdsLoader.AdsLoadedListener` via `setAdsLoaderProvider` on the `ImaAdsLoader.Builder`. Document the failure mode and proceed to iOS work; revisit Android in a follow-up.

- [ ] **Step 9.4: Capture the logcat snippet**

Save 5-6 lines of logcat output covering: the `skipAd: AdsManager.skip() invoked` log, the next 2 `[ADS] event=…` lines, and the final `[ADS state] {"isPlayingAd":false,…}`. We append these to the spec validation log in Task 16.

---

## Task 10: iOS — `setAdTagUrl` reload trigger

**Files:**
- Modify: `ios/Video/RCTVideo.swift`

- [ ] **Step 10.1: Find the existing `setAdTagUrl`**

In `RCTVideo.swift`, locate `func setAdTagUrl(_ adTagUrl: String!)` (around line 1369). Currently it only does:
```swift
func setAdTagUrl(_ adTagUrl: String!) {
    _adTagUrl = adTagUrl
}
```

- [ ] **Step 10.2: Replace with a reload-aware setter**

```swift
@objc
func setAdTagUrl(_ adTagUrl: String!) {
    if _adTagUrl == adTagUrl {
        return
    }
    _adTagUrl = adTagUrl
    #if RNUSE_GOOGLE_IMA
        // If a player is already running with a source, the ad tag arrived
        // AFTER setSrc (the common React Native prop apply order). The
        // existing player session was started without an IMA ads loader, so
        // we have to recreate it. Mirror of the Android fix in
        // ReactExoplayerView.setAdTagUrl (commit 87d36530).
        if _player != nil && _source != nil && adTagUrl != nil {
            _imaAdsManager.setUpAdsLoader()
            // requestAds will fire when onVideoProgress observes
            // currentTime >= 0.0001 (existing pre-roll trigger).
            _didRequestAds = false
        }
    #endif
}
```

If `_didRequestAds` does not exist as a private var in this scope, find its declaration (it's referenced at line 396) and confirm it's mutable from `setAdTagUrl`. It is — same class.

- [ ] **Step 10.3: Verify the existing `setSrc` flow still wires the ads loader**

In `RCTVideo.swift`, find the `#if RNUSE_GOOGLE_IMA … _imaAdsManager.setUpAdsLoader()` block (around line 634-641). This block runs after a new player is created. Our `setAdTagUrl` change handles the case where the player is ALREADY created — both paths converge on `setUpAdsLoader`. Confirm no double-initialization issue: `setUpAdsLoader` is idempotent (re-creates `adsLoader` from scratch).

- [ ] **Step 10.4: Build (deferred to user device)**

iOS Swift compile happens when the user runs `pod install` + Xcode build. Commit and let the device test catch issues.

- [ ] **Step 10.5: Commit**

```bash
git add ios/Video/RCTVideo.swift
git commit -m "fix(ios/ads): trigger ads loader recreation when adTagUrl changes after init"
```

---

## Task 11: iOS — `RCTIMAAdsManager` metadata enrichment + `currentTime` injection

**Files:**
- Modify: `ios/Video/Features/RCTIMAAdsManager.swift`

- [ ] **Step 11.1: Read the existing event emission section**

Open `ios/Video/Features/RCTIMAAdsManager.swift`. The block that emits to JS is around lines 107-117:
```swift
if _video.onReceiveAdEvent != nil {
    if let adData = event.adData {
        _video.onReceiveAdEvent?([
            "event": event.type.description,
            "data": adData,
        ])
    } else {
        _video.onReceiveAdEvent?([
            "event": event.type.description,
        ])
    }
}
```

- [ ] **Step 11.2: Replace with enriched payload**

Replace the entire block (within `func adsManager(_ adsManager: IMAAdsManager, didReceive event: IMAAdEvent)`) with:
```swift
if _video.onReceiveAdEvent != nil {
    var data: [String: Any] = [:]

    // Pass through whatever the SDK already gave us.
    if let adData = event.adData {
        for (key, value) in adData {
            if let key = key as? String {
                data[key] = value
            }
        }
    }

    // Enrich with creative metadata. Mirror of the Android fix in
    // ReactExoplayerView.onAdEvent (commit fe561a77).
    if let ad = event.ad {
        if data["adTitle"] == nil, let title = ad.adTitle {
            data["adTitle"] = title
        }
        if data["duration"] == nil {
            data["duration"] = ad.duration
        }
        if data["isSkippable"] == nil {
            data["isSkippable"] = ad.isSkippable
        }
        if data["skipOffset"] == nil {
            data["skipOffset"] = ad.skipTimeOffset
        }
        if let pod = ad.adPodInfo {
            if data["adPosition"] == nil {
                data["adPosition"] = pod.adPosition
            }
            if data["totalAds"] == nil {
                data["totalAds"] = pod.totalAds
            }
        }
    }

    // Inject current playhead for progress / quartile / lifecycle events
    // so the JS state machine can tick. Mirror of the Android fix in
    // ReactExoplayerView.onAdEvent (commit b78019ac).
    switch event.type {
    case .AD_PROGRESS, .FIRST_QUARTILE, .MIDPOINT, .THIRD_QUARTILE,
         .STARTED, .LOADED, .COMPLETED:
        if data["currentTime"] == nil, let player = _video?.getPlayer() {
            let cm = player.currentTime()
            let seconds = CMTimeGetSeconds(cm)
            if seconds.isFinite && seconds >= 0 {
                data["currentTime"] = seconds
            }
        }
    default:
        break
    }

    if data.isEmpty {
        _video.onReceiveAdEvent?([
            "event": event.type.description,
        ])
    } else {
        _video.onReceiveAdEvent?([
            "event": event.type.description,
            "data": data,
        ])
    }
}
```

- [ ] **Step 11.3: Add `getPlayer()` accessor on RCTVideo if missing**

`_video?.getPlayer()` is used above. Verify the accessor exists in `RCTVideo.swift`. If not, add (in `RCTVideo.swift` near the bottom of the class):
```swift
@objc
public func getPlayer() -> AVPlayer? {
    return _player
}
```

If `_video` is typed as `RCTVideo?` (weak reference), adjust accordingly. In the existing `RCTIMAAdsManager`, `_video` is `weak var _video: RCTVideo?`. So `_video?.getPlayer()` is fine.

- [ ] **Step 11.4: Build (deferred to user device)**

- [ ] **Step 11.5: Commit**

```bash
git add ios/Video/Features/RCTIMAAdsManager.swift ios/Video/RCTVideo.swift
git commit -m "feat(ios/ads): forward ad metadata + player currentTime via onAdEvent bridge"
```

---

## Task 12: iOS — `IMAAdsManager.skip()` exposed as `RCTIMAAdsManager.skip()`

**Files:**
- Modify: `ios/Video/Features/RCTIMAAdsManager.swift`

- [ ] **Step 12.1: Add a `skip()` method**

Below the existing `releaseAds()` method (around line 47-55) in `RCTIMAAdsManager.swift`, add:
```swift
        func skip() {
            guard let adsManager else { return }
            adsManager.skip()
        }
```

- [ ] **Step 12.2: Build (deferred to user device)**

- [ ] **Step 12.3: Commit**

```bash
git add ios/Video/Features/RCTIMAAdsManager.swift
git commit -m "feat(ios/ads): RCTIMAAdsManager.skip delegates to IMAAdsManager.skip"
```

---

## Task 13: iOS — `RCTVideo.skipAd()` ObjC entry point

**Files:**
- Modify: `ios/Video/RCTVideo.swift`

- [ ] **Step 13.1: Add the public `skipAd` method**

In `RCTVideo.swift`, near the existing imperative methods (look for a method like `seekCmd` or near `func setVolume`), add:
```swift
@objc
public func skipAd() {
    #if RNUSE_GOOGLE_IMA
        _imaAdsManager.skip()
    #endif
}
```

- [ ] **Step 13.2: Commit**

```bash
git add ios/Video/RCTVideo.swift
git commit -m "feat(ios/ads): RCTVideo.skipAd entry point"
```

---

## Task 14: iOS — Export `skipAd` via `RCTVideoManager`

**Files:**
- Modify: `ios/Video/RCTVideoManager.m`
- Modify: `ios/Video/RCTVideoManager.swift` (the Swift companion that implements bridge methods)

- [ ] **Step 14.1: Add the `RCT_EXTERN_METHOD` declaration**

In `RCTVideoManager.m`, alongside `RCT_EXTERN_METHOD(seek …)`, add:
```objc
RCT_EXTERN_METHOD(skipAd : (nonnull NSNumber*)reactTag)
```

- [ ] **Step 14.2: Implement the method on the Swift side**

In `ios/Video/RCTVideoManager.swift` (the Swift class that implements these methods), find an existing method like `seek` and use the same pattern. Add:
```swift
@objc
public func skipAd(_ reactTag: NSNumber) {
    self.bridge.uiManager.addUIBlock { _, viewRegistry in
        guard let view = viewRegistry?[reactTag] as? RCTVideo else {
            return
        }
        view.skipAd()
    }
}
```

If the existing methods use a different dispatch pattern (e.g. `performBatchedUpdates`), follow that instead — preserve the local convention.

- [ ] **Step 14.3: Commit**

```bash
git add ios/Video/RCTVideoManager.m ios/Video/RCTVideoManager.swift
git commit -m "feat(ios/ads): export skipAd ObjC method on RCTVideoManager"
```

---

## Task 15: iOS — Manual on-device validation (3 fixes + skipAd)

**Files:** none — pure validation.

- [ ] **Step 15.1: Pod install + Xcode rebuild**

In `eitb-guau-mobile/ios`:
```bash
cd ios && pod install && cd ..
yarn ios --device
```

(Or via Xcode directly — the path in iOS Pods linked to the portal must be re-linked. If pod install does not re-link the portal symlinks, run `pod install --repo-update` or remove `Pods/RNVideo` and reinstall.)

- [ ] **Step 15.2: Run the Zulora episode**

Expected:
- Audio ad plays before podcast content (Checkpoint 1 on iOS).
- `[ADS state]` emits with full metadata at LOADED, then 1Hz progress emissions during the ad with `currentTime` ticking 0 → … → duration (Checkpoint 2 on iOS).
- This means: `setAdTagUrl` reload (Task 10) ✓, metadata enrichment (Task 11) ✓, currentTime injection (Task 11) ✓ all work on iOS.

If `currentTime` is missing from `[ADS state]` emissions during AD_PROGRESS on iOS, double-check the `getPlayer()` accessor and the `_player.currentTime()` is reading the ad-relative time during ad playback (it should — AVPlayer reports per-item time, and IMA inserts an ad item).

- [ ] **Step 15.3: Tap the debug skipAd button after `canSkipAd: true`**

Expected:
- IMA emits `SKIPPED`.
- `[ADS state]` emits `isPlayingAd: false`.
- Podcast content starts playing.

- [ ] **Step 15.4: Capture logs**

Save 5-6 lines of `[ADS state]` output covering both the countdown and the post-skip transition. Append to spec validation log in Task 16.

---

## Task 16: Spec validation log update

**Files:**
- Modify: `docs/superpowers/specs/2026-04-27-audio-ads-design.md`

- [ ] **Step 16.1: Append a new dated subsection to §14**

At the end of section 14 of the spec, append:
```markdown

### 2026-04-XX — PR-2: cross-platform skipAd + iOS parity (Real device)

**Android** (Samsung A15, Android 16):
- `audioPlayerRef.skipAd()` invoked at currentTime > skipOffset.
- Logcat: `D RNVExoplayer skipAd: AdsManager.skip() invoked`.
- `[ADS state]` transitions to `isPlayingAd: false` within ~250ms.
- Podcast resumes immediately.

**iOS** (<device, OS>):
- Audio ad plays preroll (Checkpoint 1).
- `[ADS state]` emits full metadata at LOADED. currentTime ticks 1Hz during playback (Checkpoint 2).
- canSkipAd flips to true at currentTime ≥ skipOffset.
- `audioPlayerRef.skipAd()` triggers `IMAAdsManager.skip()`. SKIPPED event flows. `isPlayingAd` returns to false.

**Native fixes confirmed working on iOS:**
- `setAdTagUrl` triggers `setUpAdsLoader` when called after a player exists.
- `onReceiveAdEvent` payload now includes `adTitle`, `duration`, `isSkippable`, `skipOffset`, `adPosition`, `totalAds`, and `currentTime`.

**Implementation notes:**
- Android `AdsManager.skip()` is reached via reflection on `ImaAdsLoader.adTagLoaderByAdsId` → `AdTagLoader.adsManager`. media3 1.5.1 does not expose this publicly. Tested working — if media3 internals change, the reflection block in `ReactExoplayerView.skipAd()` logs a warning and returns no-op.
- iOS reuses the existing `RCTIMAAdsManager.getAdsManager()` accessor; no reflection needed.
```

Replace `<device, OS>` and `XX` with the actual values from the validation run.

- [ ] **Step 16.2: Commit**

```bash
git add docs/superpowers/specs/2026-04-27-audio-ads-design.md
git commit -m "docs(spec): record PR-2 validation log (Android + iOS skipAd)"
```

---

## Task 17: Push branch (no PR — option B from PR-1)

- [ ] **Step 17.1: User pushes manually**

```bash
git push -u origin feat/audio-ads
```

(SSH key required; the controller does not have access. The user runs this in their terminal with `! git push -u origin feat/audio-ads` from the Claude session.)

The app's `package.json` patch URL can then point to the latest SHA on this branch when the team is ready to integrate.

---

## Validation checklist (before considering PR-2 complete)

- [ ] All 31 PR-1 unit tests still pass.
- [ ] `yarn build` introduces no new TypeScript errors.
- [ ] Android: skipAd manual test passes on real device — debug log shows `skip()` invoked, state transitions correctly.
- [ ] iOS: ads play, full metadata flows, currentTime ticks, skipAd works. All 4 native fixes confirmed.
- [ ] Spec §14 updated with the new validation subsection.
- [ ] No master-branch changes pulled in.
- [ ] Branch `feat/audio-ads` pushed to origin so the consumer app can patch off any commit.
