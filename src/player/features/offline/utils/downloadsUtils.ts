/*
 * Utilidades generales para el sistema de descargas
 *
 */

import { UsableDownloadItem } from "../types";

/*
 * Genera un ID único basado en la URI de descarga
 * Maneja espacios, query strings y caracteres especiales
 *
 * @param uri - URI de la descarga
 * @returns ID único limpio para la descarga
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

		// Agregar timestamp para asegurar unicidad
		const timestamp = Date.now().toString(36);

		return `download-${cleanUri}-${timestamp}`;
	} catch (error) {
		// Fallback si hay algún error procesando la URI
		const timestamp = Date.now().toString(36);
		const randomId = Math.random().toString(36).substring(2, 9);
		return `download-fallback-${timestamp}-${randomId}`;
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
 * Valida si una URI es válida para descargas
 *
 * @param uri - URI a validar
 * @returns true si la URI es válida
 *
 */

export function isValidDownloadUri(uri: string): boolean {
	if (!uri || typeof uri !== "string" || uri.trim() === "") {
		return false;
	}

	try {
		// Intentar crear un objeto URL para validar
		const url = new URL(uri);

		// Verificar protocolos soportados
		const supportedProtocols = ["http:", "https:"];
		if (!supportedProtocols.includes(url.protocol)) {
			return false;
		}

		return true;
	} catch (error) {
		return false;
	}
}

/*
 * Normaliza una URI para comparaciones
 *
 * @param uri - URI a normalizar
 * @returns URI normalizada
 *
 */

export function normalizeUri(uri: string): string {
	try {
		const url = new URL(uri);
		// Normalizar eliminando fragment y ordenando query params
		url.hash = "";
		const params = new URLSearchParams(url.search);
		params.sort();
		url.search = params.toString();
		return url.toString();
	} catch (error) {
		// Si falla el parsing, devolver la URI original limpia
		return uri.trim().toLowerCase();
	}
}
