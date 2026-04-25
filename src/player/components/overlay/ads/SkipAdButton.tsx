import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { i18n } from "../../../locales";
import { getSkipButtonState } from "./getSkipButtonState";

export interface SkipAdButtonProps {
	isPlayingAd: boolean;
	canSkip: boolean;
	secondsUntilSkippable: number | null;
	/**
	 * Identifier of the currently playing ad clip. Used to reset the local
	 * countdown ticker when the receiver moves to a new clip mid-pod.
	 */
	adClipId: string | null;
	onPress: () => Promise<boolean>;
	/**
	 * Optional custom labels. Falls back to the player's internal Spanish
	 * strings when omitted. `countdown` must contain `{seconds}`.
	 */
	labels?: {
		countdown?: string;
		action?: string;
	};
}

const DEBOUNCE_MS = 250;
const TICK_MS = 500;

/**
 * Drives a smooth local countdown for the skip button.
 *
 * The receiver-reported `secondsUntilSkippable` only refreshes when MediaStatus
 * fires (state change events), not on continuous ad progress, so the value
 * stays frozen during a stable ad clip. We seed an `expiresAt` timestamp the
 * first time we observe a positive countdown for the current clip and compute
 * the displayed value from `Date.now()` on every tick.
 */
function useEffectiveSkipState(input: {
	isPlayingAd: boolean;
	canSkip: boolean;
	secondsUntilSkippable: number | null;
	adClipId: string | null;
}): { effectiveCanSkip: boolean; effectiveSecondsLeft: number | null } {
	const [, forceTick] = useState(0);
	const seedRef = useRef<{ clipId: string; expiresAt: number } | null>(null);

	// Reset / seed when clip changes or initial countdown arrives.
	useEffect(() => {
		if (!input.isPlayingAd || !input.adClipId) {
			seedRef.current = null;
			return;
		}
		const sameClip = seedRef.current?.clipId === input.adClipId;
		if (!sameClip && typeof input.secondsUntilSkippable === "number" && input.secondsUntilSkippable > 0) {
			seedRef.current = {
				clipId: input.adClipId,
				expiresAt: Date.now() + input.secondsUntilSkippable * 1000,
			};
		}
	}, [input.adClipId, input.isPlayingAd, input.secondsUntilSkippable]);

	// Tick at 2Hz while waiting to become skippable.
	useEffect(() => {
		const seed = seedRef.current;
		if (!input.isPlayingAd || input.canSkip || !seed) return;
		if (Date.now() >= seed.expiresAt) return;
		const id = setInterval(() => forceTick((t) => t + 1), TICK_MS);
		return () => clearInterval(id);
	}, [input.isPlayingAd, input.canSkip, input.adClipId]);

	if (!input.isPlayingAd) return { effectiveCanSkip: false, effectiveSecondsLeft: null };

	// If reducer says we're skippable, trust it.
	if (input.canSkip) return { effectiveCanSkip: true, effectiveSecondsLeft: 0 };

	// No countdown info at all (clip without whenSkippable in the fallback grace window).
	if (typeof input.secondsUntilSkippable !== "number") {
		return { effectiveCanSkip: false, effectiveSecondsLeft: null };
	}

	const seed = seedRef.current;
	if (!seed || seed.clipId !== input.adClipId) {
		// Not seeded yet for this clip — show the prop value as-is for one frame.
		return { effectiveCanSkip: false, effectiveSecondsLeft: input.secondsUntilSkippable };
	}

	const remainingMs = seed.expiresAt - Date.now();
	const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
	return {
		effectiveCanSkip: remaining === 0,
		effectiveSecondsLeft: remaining,
	};
}

export function SkipAdButton(props: SkipAdButtonProps): React.ReactElement | null {
	const insets = useSafeAreaInsets();
	const { effectiveCanSkip, effectiveSecondsLeft } = useEffectiveSkipState(props);

	const state = getSkipButtonState({
		isPlayingAd: props.isPlayingAd,
		canSkip: effectiveCanSkip,
		secondsUntilSkippable: effectiveSecondsLeft,
	});

	const lastPressRef = useRef<number>(0);

	const handlePress = useCallback(async () => {
		const now = Date.now();
		if (now - lastPressRef.current < DEBOUNCE_MS) return;
		lastPressRef.current = now;
		await props.onPress();
	}, [props]);

	if (state.variant === "hidden") return null;

	const isActive = state.variant === "active";
	const actionLabel = props.labels?.action ?? i18n.t("cast_skipAd_action");
	const countdownTemplate = props.labels?.countdown ?? i18n.t("cast_skipAd_countdown");
	const label = isActive
		? actionLabel
		: countdownTemplate.replace("{seconds}", String(state.secondsLeft));

	const wrapperStyle = {
		...styles.wrapper,
		bottom: styles.wrapper.bottom + (insets?.bottom || 0),
		right: styles.wrapper.right + Math.max(insets?.left || 0, insets?.right || 0),
	};

	return (
		<View style={wrapperStyle} pointerEvents="box-none">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ disabled: !isActive }}
				disabled={!isActive}
				onPress={isActive ? handlePress : undefined}
				style={[styles.button, isActive ? styles.buttonActive : styles.buttonDisabled]}
			>
				<Text
					style={[styles.label, isActive ? styles.labelActive : styles.labelDisabled]}
				>
					{label}
					{isActive ? "  ›" : ""}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		position: "absolute",
		// Lifted above the bottom controls block (timeline + bottomBar 50pt + margins).
		bottom: 110,
		right: 24,
		zIndex: 1000,
	},
	button: {
		minHeight: 44,
		minWidth: 44,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonActive: {
		backgroundColor: "rgba(0,0,0,0.85)",
		borderWidth: 1,
		borderColor: "#FFFFFF",
	},
	buttonDisabled: {
		backgroundColor: "rgba(0,0,0,0.6)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.4)",
	},
	label: {
		fontSize: 14,
		fontWeight: "600",
	},
	labelActive: {
		color: "#FFFFFF",
	},
	labelDisabled: {
		color: "rgba(255,255,255,0.6)",
	},
});
