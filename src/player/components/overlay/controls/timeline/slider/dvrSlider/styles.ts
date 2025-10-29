import { StyleSheet } from "react-native";
import { SPACING } from "../../../../../../theme";

export const styles = StyleSheet.create({
	container: {
		height: 50,
		flexDirection: "row",
		alignItems: "center",
	},
	slider: {
		flex: 1,
		paddingBottom: 3,
	},
	hitSlop: {
		top: SPACING["2x"],
		bottom: SPACING["0.25x"],
		left: SPACING["0.5x"],
		right: SPACING["0.5x"],
	},
	barContentsEdge: {
		width: 100,
		height: 50,
	},
});
