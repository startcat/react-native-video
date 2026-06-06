import { type BaseError } from "@overon/react-native-cast";

import { PlayerError } from "./PlayerError";
import { type PlayerErrorCodeKey } from "./types";

/**
 * Boundary adapter: maps a `BaseError` emitted by `@overon/react-native-cast`
 * (its `onError` callbacks for the manager and the monitor) to RNV's own
 * `PlayerError` (PLAYER-240).
 *
 * The module ships its own copy of `@overon/react-native-overon-errors`, so its
 * `BaseError` is a *different class* than the one RNV consumes — an `instanceof`
 * check or a structural re-use is not reliable. We adapt at the seam so the
 * downstream `handleOnError` flow stays untouched.
 *
 * The module's cast catalog uses bare codes (`CONNECTION_FAILED`, `NOT_READY`,
 * …) under the `CAST` namespace; RNV mirrors them as `PLAYER_CAST_<code>`. Codes
 * the module emits that RNV does not model (e.g. `SESSION_LOST`, `LOAD_FAILED`,
 * AirPlay codes, `UNKNOWN`) fall back to the generic `PLAYER_CAST_OPERATION_FAILED`
 * key. The original `code`/`message`/`context` are preserved in `context` so no
 * diagnostic detail is lost.
 */
const CAST_CODE_TO_PLAYER_KEY: Record<string, PlayerErrorCodeKey> = {
	DEVICE_NOT_FOUND: "PLAYER_CAST_DEVICE_NOT_FOUND",
	CONNECTION_FAILED: "PLAYER_CAST_CONNECTION_FAILED",
	PLAYBACK_INTERRUPTED: "PLAYER_CAST_PLAYBACK_INTERRUPTED",
	INVALID_SOURCE: "PLAYER_CAST_INVALID_SOURCE",
	INVALID_MANIFEST: "PLAYER_CAST_INVALID_MANIFEST",
	INVALID_METADATA: "PLAYER_CAST_INVALID_METADATA",
	MESSAGE_BUILD_FAILED: "PLAYER_CAST_MESSAGE_BUILD_FAILED",
	NOT_READY: "PLAYER_CAST_NOT_READY",
	OPERATION_FAILED: "PLAYER_CAST_OPERATION_FAILED",
};

const FALLBACK_KEY: PlayerErrorCodeKey = "PLAYER_CAST_OPERATION_FAILED";

export const toPlayerError = (error: BaseError): PlayerError => {
	const key = CAST_CODE_TO_PLAYER_KEY[error?.code] ?? FALLBACK_KEY;

	return new PlayerError(key, {
		// Preserve the module's original error detail for diagnostics.
		originalCode: error?.code,
		originalNamespace: error?.namespace,
		originalMessage: error?.message,
		originalContext: error?.context,
	});
};
