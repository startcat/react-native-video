import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { i18n } from "../../../locales";
import { getSkipButtonState } from "./getSkipButtonState";

export interface SkipAdButtonProps {
	isPlayingAd: boolean;
	canSkip: boolean;
	secondsUntilSkippable: number | null;
	onPress: () => Promise<boolean>;
}

const DEBOUNCE_MS = 250;

export function SkipAdButton(props: SkipAdButtonProps): React.ReactElement | null {
	const state = getSkipButtonState({
		isPlayingAd: props.isPlayingAd,
		canSkip: props.canSkip,
		secondsUntilSkippable: props.secondsUntilSkippable,
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
	const label = isActive
		? i18n.t("cast_skipAd_action")
		: i18n
				.t("cast_skipAd_countdown")
				.replace("{seconds}", String(state.secondsLeft));

	return (
		<View style={styles.wrapper} pointerEvents="box-none">
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
		bottom: 24,
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
