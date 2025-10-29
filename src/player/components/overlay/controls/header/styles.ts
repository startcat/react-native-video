import { StyleSheet } from "react-native";
import { SPACING } from "../../../../theme";

const HEIGHT = 50;

export const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: SPACING["0.5x"],
		left: SPACING["0.5x"],
		right: SPACING["0.5x"],
		flexDirection: "row",
		height: HEIGHT,
		justifyContent: "space-between",
	},
	left: {
		height: HEIGHT,
		flexDirection: "row",
		justifyContent: "center",
		alignContent: "center",
		zIndex: 5,
	},
	right: {
		height: HEIGHT,
		flexDirection: "row",
		zIndex: 5,
	},
	loader: {
		width: HEIGHT,
		height: HEIGHT,
		justifyContent: "center",
		alignContent: "center",
		alignItems: "center",
	},
});
