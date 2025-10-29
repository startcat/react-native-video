const TEXTS = {
	accesibilidad_player_overlay: "Mostrar controles",
	accesibilidad_player_pause: "Pausar",
	accesibilidad_player_play: "Reproducir",
	accesibilidad_player_forward: "Avanzar 15 segundos",
	accesibilidad_player_backward: "Retroceder 15 segundos",
	accesibilidad_player_menu: "Mostrar audio y subtítulos",
	accesibilidad_player_mute: "Silenciar",
	accesibilidad_player_unmute: "Activar sonido",
	accesibilidad_player_next: "Reproducir siguiente capítulo",
	accesibilidad_player_share: "Compartir contenidos",
	accesibilidad_player_close: "Cerrar reproductor",
	player_quality: "Calidad",
	player_quality_auto: "Automática",
	player_quality_high: "Alta",
	player_quality_medium: "Media",
	player_quality_low: "Baja",
	player_speed: "Velocidad",
	player_subtitles: "Subtítulos",
	player_audio: "Audio",
	player_resume: "Reanudar",
	player_play: "Reproducir",
	player_restart: "Reiniciar",
	player_share: "Compartir",
	player_knowMore: "Saber más",
	accept: "Aceptar",
	cancel: "Cancelar",
	live: "DIRECTO",
	goToLive: "Volver al directo",
	video_live: "En directo",
	language_none: 'Ninguno',
};

const i18n = {
	t: (key: string): string => {
		return TEXTS[key] || key;
	},
};

export { i18n };
