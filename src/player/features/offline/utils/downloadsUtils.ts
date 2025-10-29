/*
 * Utilidades generales para el sistema de descargas
 *
 */

import { UsableDownloadItem } from "../types";

/*
 * Genera un ID consistente basado en la URI de descarga
 * SIEMPRE devuelve el mismo ID para la misma URI
 *
 * @param uri - URI de la descarga
 * @returns ID consistente para la descarga
 *
 */

export function generateDownloadIdFromUri(uri: string): string {
	try {
		// Remover protocolo (http://, https://, etc.)
		let cleanUri = uri.replace(/^https?:\/\//, "");

		// Remover query strings (todo después del ?)
		cleanUri = cleanUri.split("?")[0] || "";

		// Remover fragment identifier (todo después del #)
		cleanUri = cleanUri.split("#")[0] || "";

		// Reemplazar espacios y caracteres especiales con guiones
		cleanUri = cleanUri
			.replace(/[\s\+]/g, "-") // Espacios y + por guiones
			.replace(/[^\w\-\.\/]/g, "-") // Caracteres especiales por guiones
			.replace(/-+/g, "-") // Múltiples guiones por uno solo
			.replace(/^-+|-+$/g, "") // Remover guiones al inicio y final
			.toLowerCase(); // Convertir a minúsculas

		// Limitar longitud para evitar IDs muy largos
		if (cleanUri.length > 100) {
			// Tomar primeros 80 caracteres + hash de la URI completa
			const hash = simpleHash(uri);
			cleanUri = cleanUri.substring(0, 80) + "-" + hash;
		}

		return `download-${cleanUri}`;
	} catch (error) {
		// Fallback si hay algún error procesando la URI
		const hash = simpleHash(uri);
		return `download-fallback-${hash}`;
	}
}

/*
 * Genera un hash simple de una cadena (implementación básica)
 *
 */

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}

/*
 * Valida si un UsableDownloadItem tiene un ID válido o genera uno nuevo
 *
 * @param item - Item de descarga para validar/procesar
 * @returns Item con ID garantizado
 *
 */

export function ensureDownloadId(item: UsableDownloadItem): UsableDownloadItem & { id: string } {
	const id =
		item.id && item.id.trim() !== "" ? item.id.trim() : generateDownloadIdFromUri(item.uri);

	return {
		...item,
		id,
	};
}

/*
 * Normaliza una URI para comparaciones
 *
 * @param uri - URI a normalizar
 * @returns URI normalizada
 *
 */

export function normalizeUri(uri: string): string {
	// Normalización simple sin new URL() para evitar bug de React Native
	try {
		// Limpiar espacios y convertir a minúsculas
		let normalized = uri.trim().toLowerCase();

		// Remover fragment (#hash)
		const hashIndex = normalized.indexOf("#");
		if (hashIndex !== -1) {
			normalized = normalized.substring(0, hashIndex);
		}

		return normalized;
	} catch (error) {
		// Fallback: devolver la URI original limpia
		return uri.trim().toLowerCase();
	}
}

/*
 * Valida si una cadena es una URI válida (validación rápida con regex)
 *
 * @param uri - Cadena a validar
 * @returns true si es una URI válida
 *
 */

export function isValidUri(uri: string): boolean {
	if (!uri || typeof uri !== "string" || uri.trim() === "") {
		return false;
	}

	return /^https?:\/\//.test(uri.trim());
}

/*
 * Calcula el tiempo restante de descarga basado en estadísticas
 *
 * @param stats - Objeto con estadísticas de descarga
 * @returns Tiempo restante en segundos
 *
 */

export function calculateRemainingTime(stats: any): number {
	const { bytesDownloaded = 0, totalBytes = 0, downloadSpeed = 0 } = stats;

	if (downloadSpeed <= 0 || totalBytes <= 0 || bytesDownloaded >= totalBytes) {
		return 0;
	}

	const remainingBytes = totalBytes - bytesDownloaded;
	return Math.round(remainingBytes / downloadSpeed);
}
