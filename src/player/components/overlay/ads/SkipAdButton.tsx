import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { i18n } from "../../../locales";
import { getEffectiveSkipState } from "./getEffectiveSkipState";
import { getSkipButtonState } from "./getSkipButtonState";

export interface SkipAdButtonProps {
	isPlayingAd: boolean;
	canSkip: boolean;
	/**
	 * Local-clock epoch ms at which the current ad clip becomes skippable, as
	 * published by the cast reducer. Re-anchored every time the receiver pushes
	 * a new `currentAdBreakClipTime`, so the local countdown stays bounded by
	 * one MediaStatus refresh cycle. Null when no whenSkippable info is known.
	 */
	adClipSkippableAt: number | null;
	/**
	 * Whether the cast receiver is currently PLAYING. When false during an ad
	 * (paused / buffering on the TV), the local ticker freezes so the displayed
	 * countdown stays in sync with the receiver instead of running ahead.
	 */
	isReceiverPlaying: boolean;
	/**
	 * Identifier of the currently playing ad clip. Used to reset the freeze
	 * snapshot when the receiver moves to a new clip mid-pod.
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
 * Drives the smooth local countdown using `adClipSkippableAt` as the receiver-
 * anchored truth and re-rendering at 2Hz between MediaStatus pushes.
 *
 * Pause/buffer handling: when `isReceiverPlaying` flips false, snapshot the
 * value we were showing so the helper holds it instead of letting `Date.now()`
 * keep advancing past a paused receiver. On resume, the next reducer update
 * will re-anchor `adClipSkippableAt` forward and the snapshot is cleared.
 */
function useEffectiveSkipState(props: {
	isPlayingAd: boolean;
	canSkip: boolean;
	adClipSkippableAt: number | null;
	isReceiverPlaying: boolean;
	adClipId: string | null;
}): { effectiveCanSkip: boolean; effectiveSecondsLeft: number | null } {
	const [, forceTick] = useState(0);
	const frozenRef = useRef<{ clipId: string | null; secondsLeft: number } | null>(null);

	// Tick at 2Hz while a countdown is in flight on a playing receiver.
	useEffect(() => {
		if (!props.isPlayingAd || props.canSkip || !props.isReceiverPlaying) return;
		if (typeof props.adClipSkippableAt !== "number") return;
		if (Date.now() >= props.adClipSkippableAt) return;
		const id = setInterval(() => forceTick((t) => t + 1), TICK_MS);
		return () => clearInterval(id);
	}, [
		props.isPlayingAd,
		props.canSkip,
		props.isReceiverPlaying,
		props.adClipSkippableAt,
	]);

	// Snapshot/release the frozen seconds on pause edges and clip transitions.
	useEffect(() => {
		if (!props.isReceiverPlaying && props.isPlayingAd && !props.canSkip) {
			if (
				frozenRef.current?.clipId !== props.adClipId &&
				typeof props.adClipSkippableAt === "number"
			) {
				const remainingMs = props.adClipSkippableAt - Date.now();
				frozenRef.current = {
					clipId: props.adClipId,
					secondsLeft: Math.max(0, Math.ceil(remainingMs / 1000)),
				};
			}
		} else {
			frozenRef.current = null;
		}
	}, [
		props.isReceiverPlaying,
		props.isPlayingAd,
		props.canSkip,
		props.adClipId,
		props.adClipSkippableAt,
	]);

	return getEffectiveSkipState({
		isPlayingAd: props.isPlayingAd,
		canSkip: props.canSkip,
		adClipSkippableAt: props.adClipSkippableAt,
		adClipId: props.adClipId,
		isReceiverPlaying: props.isReceiverPlaying,
		now: Date.now(),
		frozenSecondsLeftWhenPaused:
			frozenRef.current?.clipId === props.adClipId
				? frozenRef.current.secondsLeft
				: null,
	});
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
