import React, { useMemo } from "react";
import { View, Image } from "react-native";
import { type BackgroundPosterProps } from "../../types";
import { styles } from "./styles";

const BackgroundPosterComponent = ({
	poster,
	children,
}: BackgroundPosterProps): React.ReactElement => {
	const imageUri = useMemo(() => (poster ? { uri: encodeURI(poster) } : undefined), [poster]);

	const hasPoster = Boolean(poster);

	return (
		<View style={styles.container}>
			{hasPoster && (
				<Image
					style={styles.posterImage}
					resizeMode="cover"
					source={imageUri}
					blurRadius={5}
					// Sin esta prop, Android decodifica el JPEG a su tamaño intrínseco
					// y con density alta genera bitmaps RGBA enormes → Canvas tira
					// `trying to draw too large bitmap`. `resize` baja la resolución
					// en el decode al tamaño del layout (no-op en iOS).
					resizeMethod="resize"
				/>
			)}
			{children}
		</View>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (
	prevProps: BackgroundPosterProps,
	nextProps: BackgroundPosterProps
): boolean => {
	return prevProps.poster === nextProps.poster;
	// No comparamos children porque React ya maneja esta comparación eficientemente
};

export const BackgroundPoster = React.memo(BackgroundPosterComponent, arePropsEqual);

export default BackgroundPoster;
