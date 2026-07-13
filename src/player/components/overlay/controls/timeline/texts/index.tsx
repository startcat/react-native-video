import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { type TimelineTextProps } from "../../../../../../types";
import { parseToCounter } from "../../../../../utils/time";
import { styles } from "./styles";

// Tipografía equivalente a las categorías de texto de Eva/ui-kitten
// (fontSize/fontWeight), replicada localmente para no depender de
// <ApplicationProvider>. Hoy solo se usa "h5", pero cubrimos todas las
// categorías que admite TimelineTextProps["category"].
const CATEGORY_TYPOGRAPHY: Record<string, { fontSize: number; fontWeight: "400" | "600" | "800" }> =
	{
		h1: { fontSize: 36, fontWeight: "800" },
		h2: { fontSize: 32, fontWeight: "800" },
		h3: { fontSize: 30, fontWeight: "800" },
		h4: { fontSize: 26, fontWeight: "800" },
		h5: { fontSize: 22, fontWeight: "800" },
		h6: { fontSize: 18, fontWeight: "800" },
		s1: { fontSize: 15, fontWeight: "600" },
		s2: { fontSize: 13, fontWeight: "600" },
		p1: { fontSize: 15, fontWeight: "400" },
		p2: { fontSize: 13, fontWeight: "400" },
		c1: { fontSize: 12, fontWeight: "400" },
		c2: { fontSize: 12, fontWeight: "600" },
	};

const TimelineTextBase = ({
	value,
	category = "h5",
	containerStyle,
	textStyle,
}: TimelineTextProps): React.ReactElement | null => {
	// Determinar el contenido del texto basado en el tipo de valor
	const textContent = useMemo(() => {
		if (value === undefined || value === null) {
			return null;
		}

		if (typeof value === "string") {
			return value;
		}

		if (typeof value === "number") {
			return parseToCounter(value);
		}

		return null;
	}, [value]);

	// Si no hay contenido, no renderizar nada
	if (textContent === null) {
		return null;
	}

	return (
		<View style={[styles.container, containerStyle]}>
			<Text style={[styles.text, CATEGORY_TYPOGRAPHY[category], textStyle]}>
				{textContent}
			</Text>
		</View>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: TimelineTextProps, nextProps: TimelineTextProps): boolean => {
	return (
		prevProps.value === nextProps.value &&
		prevProps.category === nextProps.category &&
		prevProps.containerStyle === nextProps.containerStyle &&
		prevProps.textStyle === nextProps.textStyle
	);
};

export const TimelineText = React.memo(TimelineTextBase, arePropsEqual);
