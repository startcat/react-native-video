/**
 * Fixtures de descargas para testing del sistema de eventos
 *
 * Estos contenidos se usan para validar el flujo de eventos durante
 * las fases de migración de la arquitectura.
 *
 * IMPORTANTE: Reemplazar URLs si expiran o no están disponibles.
 */

import { DownloadType } from "../../types";

export interface TestDownloadConfig {
	id: string;
	type: DownloadType;
	url: string;
	title: string;
	description?: string;
	expectedSizeBytes?: number;
	drm?: {
		type: "fairplay" | "widevine";
		licenseUrl: string;
		certificateUrl?: string;
	};
	subtitles?: string[];
}

/**
 * Binario MP3 real de 3Cat (~45MB)
 */
export const BINARY_MP3: TestDownloadConfig = {
	id: "test-binary-833647",
	type: DownloadType.BINARY,
	url: "https://ott-vod.3catvideos.cat/mp3/4/6/1761748812164.mp3",
	title: "T1xC38 - La pua de guitarra",
	description: "Binario MP3 de prueba desde 3Cat",
	expectedSizeBytes: 45236558,
};

/**
 * Stream HLS real de 3Cat con subtítulos
 */
export const HLS_3CAT: TestDownloadConfig = {
	id: "test-hls-273508",
	type: DownloadType.STREAM,
	url: "https://dev.3cat.website/api/manifest/v1/273508/0/hls.m3u8",
	title: "T1xC1 - Comença la primera gala (HLS)",
	description: "Stream HLS real de 3Cat con subtítulos en catalán",
	subtitles: ["ca"],
};

/**
 * Stream HLS público de Apple (Big Buck Bunny) - backup
 */
export const HLS_BASIC: TestDownloadConfig = {
	id: "test-hls-basic",
	type: DownloadType.STREAM,
	url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
	title: "Big Buck Bunny (HLS)",
	description: "Stream HLS público de Apple sin DRM",
};

/**
 * Stream HLS con subtítulos (Sintel)
 */
export const HLS_SUBTITLES: TestDownloadConfig = {
	id: "test-hls-subtitles",
	type: DownloadType.STREAM,
	url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
	title: "Sintel (HLS con subtítulos)",
	description: "Stream HLS con múltiples pistas de audio y subtítulos",
	subtitles: ["en", "es"],
};

/**
 * Stream DASH real de 3Cat con subtítulos
 */
export const DASH_3CAT: TestDownloadConfig = {
	id: "test-dash-273508",
	type: DownloadType.STREAM,
	url: "https://dev.3cat.website/api/manifest/v1/273508/0/dash.mpd",
	title: "T1xC1 - Comença la primera gala",
	description: "Stream DASH real de 3Cat con subtítulos en catalán",
	subtitles: ["ca"],
};

/**
 * Stream DASH público (Big Buck Bunny) - backup
 */
export const DASH_BASIC: TestDownloadConfig = {
	id: "test-dash-basic",
	type: DownloadType.STREAM,
	url: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
	title: "Big Buck Bunny (DASH)",
	description: "Stream DASH público sin DRM",
};

/**
 * Stream DASH con DRM Widevine (placeholder - necesita URL real)
 * TODO: Reemplazar con URL real de contenido con DRM
 */
export const DASH_DRM: TestDownloadConfig = {
	id: "test-dash-drm",
	type: DownloadType.STREAM,
	url: "https://example.com/drm-content.mpd", // TODO: Reemplazar
	title: "Contenido con DRM (DASH)",
	description: "Stream DASH con Widevine DRM",
	drm: {
		type: "widevine",
		licenseUrl: "https://example.com/license", // TODO: Reemplazar
	},
};

/**
 * Colección de todos los downloads de prueba
 */
export const TEST_DOWNLOADS = {
	BINARY_MP3,
	HLS_3CAT,
	HLS_BASIC,
	HLS_SUBTITLES,
	DASH_3CAT,
	DASH_BASIC,
	DASH_DRM,
};

/**
 * Downloads recomendados para cada fase de testing
 */
export const PHASE_TEST_CONFIGS = {
	// Fase 1: Probar flujo básico con contenido real de 3Cat
	PHASE_1: [BINARY_MP3, HLS_3CAT, DASH_3CAT],

	// Fase 2: Probar concurrencia (3 descargas simultáneas)
	PHASE_2: [BINARY_MP3, HLS_3CAT, DASH_3CAT],

	// Fase 3: Probar flujo completo con streams públicos adicionales
	PHASE_3: [BINARY_MP3, HLS_3CAT, DASH_3CAT, HLS_BASIC],

	// Final: Probar todo
	FINAL: [BINARY_MP3, HLS_3CAT, DASH_3CAT, HLS_BASIC, HLS_SUBTITLES],
};

/**
 * Helper para crear un task de descarga desde un config
 */
export function createDownloadTask(config: TestDownloadConfig) {
	const baseTask = {
		id: config.id,
		title: config.title,
		type: config.type,
	};

	if (config.type === DownloadType.BINARY) {
		return {
			...baseTask,
			url: config.url,
			destination: `/Downloads/Binaries/${config.id}`,
			headers: {},
			resumable: true,
		};
	}

	// Stream
	return {
		...baseTask,
		manifestUrl: config.url,
		drm: config.drm,
		subtitles: config.subtitles,
		quality: "auto",
	};
}

/**
 * Helper para esperar progreso de una descarga
 */
export function waitForProgress(
	downloadsManager: { subscribe: (event: string, cb: (data: unknown) => void) => () => void },
	downloadId: string,
	targetPercent: number,
	timeoutMs: number = 60000
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			reject(new Error(`Timeout waiting for ${targetPercent}% progress on ${downloadId}`));
		}, timeoutMs);

		const unsubscribe = downloadsManager.subscribe("download:progress", (data: unknown) => {
			const { taskId, percent } = data as { taskId: string; percent: number };
			if (taskId === downloadId && percent >= targetPercent) {
				clearTimeout(timeout);
				unsubscribe();
				resolve();
			}
		});
	});
}

/**
 * Helper para esperar completado de una descarga
 */
export function waitForCompletion(
	downloadsManager: { subscribe: (event: string, cb: (data: unknown) => void) => () => void },
	downloadId: string,
	timeoutMs: number = 300000
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			reject(new Error(`Timeout waiting for completion of ${downloadId}`));
		}, timeoutMs);

		const unsubscribe = downloadsManager.subscribe("download:completed", (data: unknown) => {
			const { taskId } = data as { taskId: string };
			if (taskId === downloadId) {
				clearTimeout(timeout);
				unsubscribe();
				resolve();
			}
		});
	});
}
