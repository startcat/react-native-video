/*
 *  HOOK useIsLandscape
 *  Gestión del estado de la orientación
 *
 */

import { useCallback, useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PLAYER_ASPECT_RATIO = 16 / 9;

export function useIsLandscape() {
	const insets = useSafeAreaInsets();
	const { height, width } = useWindowDimensions();
	const [isLandscapePlayer, setIsLandscapePlayer] = useState<boolean>(false);

	const checkIfPlayerIsLandscape = useCallback(
		(
			windowHeight: number,
			windowWidth: number,
			leftInset: number,
			rightInset: number
		): boolean => {
			// Calculamos una dimension del player
			const margins = Math.max(leftInset, rightInset);
			const windowAspectRatio = (windowWidth - margins) / windowHeight;

			return windowAspectRatio >= PLAYER_ASPECT_RATIO;
		},
		[]
	);

	useEffect(() => {
		const newIsLandscape = checkIfPlayerIsLandscape(height, width, insets.left, insets.right);
		setIsLandscapePlayer(newIsLandscape);
	}, [height, width, insets.left, insets.right, checkIfPlayerIsLandscape]);

	return isLandscapePlayer;
}
