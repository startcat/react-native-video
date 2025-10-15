import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

export const useAppIsInBackground = () => {
	const [isInBackground, setIsInBackground] = useState<boolean>(false);
	const lastStateRef = useRef<AppStateStatus>("unknown");

	const handleAppStateChange = (nextAppState: AppStateStatus) => {
		console.log("[useAppIsInBackground] AppState change: ", nextAppState, lastStateRef.current);

		if (lastStateRef.current !== nextAppState && nextAppState === "background") {
			setIsInBackground(true);
		} else if (lastStateRef.current !== nextAppState) {
			setIsInBackground(false);
		}

		lastStateRef.current = nextAppState;
	};

	useEffect(() => {
		const _appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

		return () => {
			_appStateSubscription?.remove();
		};
	}, []);

	return isInBackground;
};
