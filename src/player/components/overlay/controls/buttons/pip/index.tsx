import React, { useMemo } from "react";
import { Platform } from "react-native";
import { Button } from "../button";
import { type ButtonProps, BUTTON_SIZE, CONTROL_ACTION } from "../../../../../types";

// OS-PiP requiere Android 8 (API 26) o iOS. En Android además hace falta
// android:supportsPictureInPicture="true" en la Activity del host.
const isPipPlatformSupported =
	Platform.OS === "ios" || (Platform.OS === "android" && Number(Platform.Version) >= 26);

type PipButtonProps = Pick<ButtonProps, "onPress" | "disabled" | "accessibilityLabel">;

const PipButton = ({
	onPress,
	accessibilityLabel = "Picture in Picture",
	disabled = false,
}: PipButtonProps): React.ReactElement | null => {
	const id = useMemo(() => CONTROL_ACTION.PIP, []);

	if (!isPipPlatformSupported) {
		return null;
	}

	return (
		<Button
			id={id}
			iconName="browser-outline"
			onPress={onPress}
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			size={BUTTON_SIZE.SMALL}
		/>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: PipButtonProps, nextProps: PipButtonProps): boolean => {
	return (
		prevProps.disabled === nextProps.disabled &&
		prevProps.onPress === nextProps.onPress &&
		prevProps.accessibilityLabel === nextProps.accessibilityLabel
	);
};

export default React.memo(PipButton, arePropsEqual);
