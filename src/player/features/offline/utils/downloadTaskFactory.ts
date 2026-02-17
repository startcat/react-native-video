/*
 * Utilidad pura para creación de tasks de descarga
 * Centraliza la lógica duplicada entre useDownloadsManager y useDownloadsList
 *
 */

import { PlayerError } from "../../../core/errors";
import { dashManifestParser } from "../services/manifest/DASHManifestParser";
import { hlsManifestParser } from "../services/manifest/HLSManifestParser";
import {
	BinaryDownloadTask,
	DownloadItem,
	DownloadStates,
	DownloadType,
	StreamDownloadTask,
	SubtitleFormat,
	UsableDownloadItem,
} from "../types";

// === TIPOS ===

export interface SubtitleTrackForTask {
	id: string;
	uri: string;
	language: string;
	label: string;
	format: SubtitleFormat;
	isDefault: boolean;
	encoding?: string;
}

export interface CreateDownloadTaskParams {
	item: UsableDownloadItem & { id: string };
	binariesDir: string;
}

export interface CreateDownloadTaskResult {
	task: BinaryDownloadTask | StreamDownloadTask;
	extractedSubtitles: SubtitleTrackForTask[];
}

// === FUNCIONES PÚBLICAS ===

/*
 * Crea una task de descarga (Binary o Stream) con subtítulos extraídos si aplica
 *
 * @param params - Parámetros de creación
 * @returns Task creada y subtítulos extraídos
 *
 */

export async function createDownloadTask(
	params: CreateDownloadTaskParams
): Promise<CreateDownloadTaskResult> {
	const { item, binariesDir } = params;

	if (item.type === DownloadType.BINARY) {
		const task: BinaryDownloadTask = {
			id: item.id,
			url: item.uri,
			destination: `${binariesDir}/${item.id}`,
			title: item.title,
			headers: {},
			resumable: true,
		};
		return { task, extractedSubtitles: [] };
	}

	if (item.type === DownloadType.STREAM) {
		// Determinar subtítulos: usar los proporcionados (si tienen URI) o extraer del manifest
		let subtitlesForTask: SubtitleTrackForTask[] | undefined = item.subtitles
			?.filter(sub => sub.uri && sub.uri.length > 0)
			.map(sub => ({
				id: sub.id,
				uri: sub.uri || "",
				language: sub.language,
				label: sub.label,
				format: sub.format,
				isDefault: sub.isDefault,
				encoding: sub.encoding,
			}));

		// Si no hay subtítulos con URI válida, extraerlos del manifest (HLS o DASH)
		const hasValidSubtitles = subtitlesForTask && subtitlesForTask.length > 0;
		if (!hasValidSubtitles) {
			subtitlesForTask = await extractSubtitlesFromManifest(item.uri, item.headers);
		}

		const task: StreamDownloadTask = {
			id: item.id,
			manifestUrl: item.uri,
			title: item.title,
			headers: item.headers,
			config: {
				type: item.uri.includes(".m3u8") ? "HLS" : "DASH",
				quality: "auto",
				drm: item.drm,
			},
			subtitles: subtitlesForTask,
		};

		return { task, extractedSubtitles: subtitlesForTask || [] };
	}

	throw new PlayerError("DOWNLOAD_FAILED", {
		downloadType: item.type,
		downloadId: item.id,
		message: `Invalid download type: ${item.type}`,
	});
}

/*
 * Extrae subtítulos de un manifest HLS o DASH
 *
 * @param uri - URI del manifest
 * @param headers - Headers HTTP opcionales
 * @returns Array de subtítulos extraídos
 *
 */

export async function extractSubtitlesFromManifest(
	uri: string,
	headers?: Record<string, string>
): Promise<SubtitleTrackForTask[]> {
	const isHLS = uri.includes(".m3u8");
	const isDASH = uri.includes(".mpd");

	if (isHLS) {
		try {
			const manifestSubtitles = await hlsManifestParser.extractSubtitles(uri, headers);
			if (manifestSubtitles.length > 0) {
				return manifestSubtitles.map(sub => ({
					id: sub.id,
					uri: sub.uri,
					language: sub.language,
					label: sub.label,
					format: sub.format,
					isDefault: sub.isDefault,
					encoding: undefined,
				}));
			}
		} catch (_manifestError) {
			console.warn(
				"[downloadTaskFactory] Failed to extract subtitles from HLS manifest:",
				_manifestError
			);
		}
	} else if (isDASH) {
		try {
			const manifestSubtitles = await dashManifestParser.extractSubtitles(uri, headers);
			if (manifestSubtitles.length > 0) {
				return manifestSubtitles.map(sub => ({
					id: sub.id,
					uri: sub.uri,
					language: sub.language,
					label: sub.label,
					format: sub.format,
					isDefault: sub.isDefault,
					encoding: undefined,
				}));
			}
		} catch (_manifestError) {
			console.warn(
				"[downloadTaskFactory] Failed to extract subtitles from DASH manifest:",
				_manifestError
			);
		}
	}

	return [];
}

/*
 * Ordena descargas por prioridad de estado
 * Activas primero, completadas al final
 *
 * @param items - Array de descargas
 * @returns Array ordenado
 *
 */

export function sortDownloads(items: DownloadItem[]): DownloadItem[] {
	// Definir prioridad de estados
	const statePriority: Record<DownloadStates, number> = {
		// Activas (prioridad 1)
		[DownloadStates.DOWNLOADING]: 1,
		[DownloadStates.DOWNLOADING_ASSETS]: 1, // Descargando subtítulos/audio
		[DownloadStates.PREPARING]: 1,
		// En cola (prioridad 2)
		[DownloadStates.QUEUED]: 2,
		[DownloadStates.PAUSED]: 2,
		[DownloadStates.WAITING_FOR_NETWORK]: 2,
		// Fallidas (prioridad 3)
		[DownloadStates.FAILED]: 3,
		// Completadas (prioridad 4)
		[DownloadStates.COMPLETED]: 4,
		// Otros estados (prioridad 5)
		[DownloadStates.RESTART]: 5,
		[DownloadStates.RESTARTING]: 5,
		[DownloadStates.REMOVING]: 5,
		[DownloadStates.STOPPED]: 5,
		[DownloadStates.NOT_DOWNLOADED]: 5,
	};

	return [...items].sort((a, b) => {
		// 1. Ordenar por prioridad de estado
		const priorityA = statePriority[a.state] || 5;
		const priorityB = statePriority[b.state] || 5;

		if (priorityA !== priorityB) {
			return priorityA - priorityB;
		}

		// 2. Dentro del mismo grupo, ordenar por fecha de inserción (más reciente primero)
		const timeA = a.stats.startedAt || 0;
		const timeB = b.stats.startedAt || 0;

		return timeB - timeA; // Descendente: más reciente primero
	});
}
