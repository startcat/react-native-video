import { NativeModules, Platform } from 'react-native';

/**
 * Number of live audio ExoPlayer instances tracked by the debug-only native
 * PlayerInstanceTracker. The single-player invariant (S1) requires this to be
 * <= 1 at all times across app<->car transitions. Returns 0 off-Android.
 */
export async function livePlayerCount(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  const mod = (NativeModules as any).HarnessModule;
  if (!mod || typeof mod.livePlayerCount !== 'function') return 0;
  return mod.livePlayerCount() as Promise<number>;
}
