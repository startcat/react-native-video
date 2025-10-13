import type { IManifest, Headers } from '../../../types';
import type { ResolvedSources } from '../types';

/**
 * Resuelve manifests a ResolvedSources para el sistema de playlists
 * 
 * @param manifests - Array de manifests disponibles
 * @param getBestManifest - Función para seleccionar el mejor manifest
 * @param getSourceUri - Función para obtener la URI del manifest
 * @param headers - Headers opcionales para las peticiones
 * @param isLive - Si el contenido es live
 * @param isCast - Si es para casting
 * @returns ResolvedSources con local, cast y download (si aplica)
 */
export function resolveSourcesFromManifests(
	manifests: Array<IManifest>,
	getBestManifest?: (manifests: Array<IManifest>, isCasting?: boolean, isLive?: boolean) => IManifest | undefined,
	getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string,
	headers?: Headers,
	isLive?: boolean,
	isCast?: boolean
): ResolvedSources | undefined {
	if (!manifests || manifests.length === 0) {
		return undefined;
	}

	const resolvedSources: Partial<ResolvedSources> = {};

	// Resolver source LOCAL
	const localManifest = getBestManifest 
		? getBestManifest(manifests, false, isLive)
		: manifests[0]; // Fallback al primer manifest

	if (localManifest) {
		const localUri = getSourceUri 
			? getSourceUri(localManifest, localManifest.dvr_window_minutes, undefined)
			: localManifest.manifestURL;

		resolvedSources.local = {
			uri: localUri,
			manifest: localManifest,
			headers: headers as Record<string, string> | undefined,
		};
	}

	// Resolver source CAST (si es diferente de local)
	if (isCast || manifests.length > 1) {
		const castManifest = getBestManifest 
			? getBestManifest(manifests, true, isLive)
			: localManifest; // Usar el mismo que local si no hay función

		if (castManifest) {
			const castUri = getSourceUri 
				? getSourceUri(castManifest, castManifest.dvr_window_minutes, undefined)
				: castManifest.manifestURL;

			resolvedSources.cast = {
				uri: castUri,
				manifest: castManifest,
				headers: headers as Record<string, string> | undefined,
			};
		}
	}

	// TODO: Resolver source DOWNLOAD cuando esté disponible
	// resolvedSources.download = { ... };

	return resolvedSources;
}

/**
 * Crea un ResolvedSources simple desde una URI directa
 * Útil para casos donde no hay manifests complejos
 */
export function createSimpleResolvedSources(
	uri: string,
	manifest: IManifest,
	headers?: Headers
): ResolvedSources {
	const source = {
		uri,
		manifest,
		headers: headers as Record<string, string> | undefined,
	};

	return {
		local: source,
		cast: source, // Usar el mismo para cast por defecto
	};
}
