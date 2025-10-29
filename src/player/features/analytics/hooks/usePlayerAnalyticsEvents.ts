import { useEffect, useRef } from "react";
import { PlayerAnalyticsEvents } from "../PlayerAnalyticsEvents";
import { type PlayerAnalyticsPlugin } from "../types";

export const usePlayerAnalyticsEvents = (plugins: PlayerAnalyticsPlugin[] = []) => {
	const playerAnalyticsEventsRef = useRef<PlayerAnalyticsEvents | null>(null);

	useEffect(() => {
		if (plugins.length > 0) {
			// Limpiar instancia anterior
			playerAnalyticsEventsRef.current?.destroy();

			// Crear nueva instancia
			playerAnalyticsEventsRef.current = new PlayerAnalyticsEvents();

			// Registrar plugins recibidos
			plugins.forEach(plugin => {
				if (playerAnalyticsEventsRef.current) {
					playerAnalyticsEventsRef.current.addPlugin(plugin);
				}
			});

			console.log(`[Player Analytics Events Hook] Loaded ${plugins.length} plugins`);
		}

		return () => {
			playerAnalyticsEventsRef.current?.destroy();
			playerAnalyticsEventsRef.current = null;
		};
	}, [plugins]);

	return playerAnalyticsEventsRef.current;
};
