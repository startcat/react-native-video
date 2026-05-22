import React, { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { Button } from "../button";
import { COLOR } from "../../../../../theme";
import { type AirplayCastButtonProps, BUTTON_SIZE, CONTROL_ACTION } from "../../../../../types";

// react-airplay@2 migró a TurboModuleRegistry.getEnforcing("NativeAirplay") al
// cargar el módulo, lo que crashea en Android (AirPlay es iOS-only). Conditional
// require evita que el JS de react-airplay se evalúe en Android.
type AirplayApi = {
	showRoutePicker: (options?: { prioritizesVideoDevices?: boolean }) => void;
	AirplayButton: React.ComponentType<any>;
};
const airplayApi: AirplayApi =
	Platform.OS === "ios"
		? require("react-airplay")
		: { showRoutePicker: () => {}, AirplayButton: () => null };
const { showRoutePicker, AirplayButton: NativeAirplayButton } = airplayApi;

const AirplayButton = ({
	accessibilityLabel = "Airplay",
	disabled = false,
}: AirplayCastButtonProps): React.ReactElement => {
	const id = useMemo(() => CONTROL_ACTION.AIRPLAY, []);

	const handlePress = useCallback(() => {
		showRoutePicker({ prioritizesVideoDevices: true });
	}, []);

	const airplayButtonProps = useMemo(
		() => ({
			prioritizesVideoDevices: true,
			tintColor: "white",
			activeTintColor: COLOR.theme.main,
			accessibilityRole: "button" as const,
		}),
		[]
	);

	return (
		<Button
			id={id}
			onPress={handlePress}
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			size={BUTTON_SIZE.SMALL}
		>
			<NativeAirplayButton {...airplayButtonProps} />
		</Button>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (
	prevProps: AirplayCastButtonProps,
	nextProps: AirplayCastButtonProps
): boolean => {
	return (
		prevProps.disabled === nextProps.disabled &&
		prevProps.accessibilityLabel === nextProps.accessibilityLabel
	);
};

export default React.memo(AirplayButton, arePropsEqual);
