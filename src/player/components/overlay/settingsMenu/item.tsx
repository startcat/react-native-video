import { Icon, Text } from "@ui-kitten/components";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { TouchableOpacity } from "react-native";
import { type MenuItemProps, CONTROL_ACTION } from "../../../../types";
import { i18n } from "../../../locales";
import { styles } from "./styles";

const SettingsMenuItemBase = ({
	data,
	selected,
	onPress: propOnPress,
}: MenuItemProps): React.ReactElement => {
	const accessibilityLabel = useRef<string>("");
	const controlActionId = useRef<CONTROL_ACTION>(CONTROL_ACTION.VIDEO_INDEX);

	useEffect(() => {
		if (data?.type === "video") {
			accessibilityLabel.current = `${i18n.t("player_quality")} ${data?.label}`;
			controlActionId.current = CONTROL_ACTION.VIDEO_INDEX;
		} else if (data?.type === "rate") {
			accessibilityLabel.current = `${i18n.t("player_speed")} ${data?.label}`;
			controlActionId.current = CONTROL_ACTION.SPEED_RATE;
		}
	}, [data]);

	const handlePress = useCallback(() => {
		if (typeof propOnPress === "function") {
			if (controlActionId.current === CONTROL_ACTION.SPEED_RATE) {
				propOnPress(controlActionId.current, data.id);
			} else {
				propOnPress(controlActionId.current, data.index);
			}
		}
	}, [propOnPress, data]);

	const isSelected = useMemo(() => !!selected, [selected]);

	return (
		<TouchableOpacity
			style={styles.menuItem}
			accessible={true}
			accessibilityRole="switch"
			accessibilityLabel={accessibilityLabel.current}
			accessibilityState={{ checked: isSelected }}
			onPress={handlePress}
		>
			{isSelected && <Icon style={styles.menuItemIcon} name="checkmark-outline" />}

			<Text category="p2" style={styles.menuItemTitle}>
				{data?.label}
			</Text>
		</TouchableOpacity>
	);
};

const arePropsEqual = (prevProps: MenuItemProps, nextProps: MenuItemProps): boolean => {
	return (
		prevProps.selected === nextProps.selected &&
		prevProps.onPress === nextProps.onPress &&
		prevProps.data?.index === nextProps.data?.index &&
		prevProps.data?.id === nextProps.data?.id &&
		prevProps.data?.label === nextProps.data?.label &&
		prevProps.data?.type === nextProps.data?.type
	);
};

export const SettingsMenuItem = React.memo(SettingsMenuItemBase, arePropsEqual);
