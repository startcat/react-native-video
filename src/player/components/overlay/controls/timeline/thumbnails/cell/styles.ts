import { StyleSheet } from "react-native";
import { COLOR } from "../../../../../../theme";

export const styles = StyleSheet.create({
	container: {
		borderWidth: 4,
		borderLeftWidth: 2,
		borderRightWidth: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderColor: "black",
	},
	image: {
		position: "absolute",
		overflow: "hidden",
		marginTop: -4,
	},
	title: {
		textAlign: "center",
		color: COLOR.theme.accent,
		// Tipografía equivalente a la categoría "h1" de Eva/ui-kitten (36/800),
		// replicada localmente para no depender de <ApplicationProvider>.
		fontSize: 36,
		fontWeight: "800",
	},
	active: {
		borderColor: "white",
		borderLeftWidth: 4,
		borderRightWidth: 4,
	},
});
