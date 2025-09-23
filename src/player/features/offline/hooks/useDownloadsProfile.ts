import { useCallback, useEffect, useMemo, useState } from "react";
import { profileManager } from "../managers/ProfileManager";
import { ProfileContext, ProfileEventType } from "../types";
import { DownloadItem } from "../types/download";

/*
 * Hook para gestión de perfiles en el sistema de descargas
 * Proporciona acceso al perfil activo y filtrado de descargas por perfil
 *
 */

export interface UseDownloadsProfileReturn {
	activeProfile: ProfileContext | null;
	downloadsByProfile: Map<string, DownloadItem[]>;
	filterByActiveProfile: (downloads: DownloadItem[]) => DownloadItem[];
	switchProfile: (profile: ProfileContext | null) => void;
}

export function useDownloadsProfile(): UseDownloadsProfileReturn {
	const [activeProfile, setActiveProfile] = useState<ProfileContext | null>(
		profileManager.getActiveProfile()
	);

	const [allDownloads, setAllDownloads] = useState<DownloadItem[]>([]);

	// Suscribirse a cambios de perfil
	useEffect(() => {
		const unsubscribe = profileManager.subscribe(ProfileEventType.PROFILE_CHANGED, data => {
			setActiveProfile(data.current || null);
		});

		return unsubscribe;
	}, []);

	// Actualizar perfil activo al montar el componente
	useEffect(() => {
		const currentProfile = profileManager.getActiveProfile();
		setActiveProfile(currentProfile);
	}, []);

	// Crear mapa de descargas por perfil
	const downloadsByProfile = useMemo(() => {
		const profileMap = new Map<string, DownloadItem[]>();

		allDownloads.forEach((download: DownloadItem) => {
			// Si el download tiene perfiles asignados
			if (download.profileIds.length > 0) {
				download.profileIds.forEach((profileId: string) => {
					if (!profileMap.has(profileId)) {
						profileMap.set(profileId, []);
					}
					profileMap.get(profileId)!.push(download);
				});
			} else {
				// Contenido sin perfil asignado - disponible para todos
				const globalKey = "__global__";
				if (!profileMap.has(globalKey)) {
					profileMap.set(globalKey, []);
				}
				profileMap.get(globalKey)!.push(download);
			}
		});

		return profileMap;
	}, [allDownloads]);

	// Filtrar descargas por perfil activo
	const filterByActiveProfile = useCallback(
		(downloads: DownloadItem[]): DownloadItem[] => {
			return profileManager.filterByActiveProfile(downloads);
		},
		[activeProfile]
	);

	// Cambiar perfil activo
	const switchProfile = useCallback((profile: ProfileContext | null) => {
		profileManager.setActiveProfile(profile);
	}, []);

	// Hook para actualizar la lista de descargas desde el store principal
	// Esta función debería ser llamada desde el hook principal de descargas
	const updateDownloads = useCallback((downloads: DownloadItem[]) => {
		setAllDownloads(downloads);
	}, []);

	return {
		activeProfile,
		downloadsByProfile,
		filterByActiveProfile,
		switchProfile,
		// Método interno para sincronizar con el hook principal de descargas
		_updateDownloads: updateDownloads,
	} as UseDownloadsProfileReturn & { _updateDownloads: (downloads: DownloadItem[]) => void };
}

/*
 * Hook simplificado que solo proporciona el perfil activo
 *
 */

export function useActiveProfile(): ProfileContext | null {
	const [activeProfile, setActiveProfile] = useState<ProfileContext | null>(
		profileManager.getActiveProfile()
	);

	useEffect(() => {
		const unsubscribe = profileManager.subscribe(ProfileEventType.PROFILE_CHANGED, data => {
			setActiveProfile(data.current || null);
		});

		return unsubscribe;
	}, []);

	return activeProfile;
}

/*
 * Hook para verificar si se puede descargar con el perfil actual
 *
 */

export function useCanDownload(): {
	canDownload: boolean;
	canDownloadContent: (downloadItem: DownloadItem) => boolean;
	activeProfileRequired: boolean;
} {
	const activeProfile = useActiveProfile();
	const [stats, setStats] = useState(profileManager.getContextStats());

	useEffect(() => {
		const unsubscribe = profileManager.subscribe(ProfileEventType.CONFIG_CHANGED, () => {
			setStats(profileManager.getContextStats());
		});

		return unsubscribe;
	}, []);

	const canDownload = useMemo(() => {
		try {
			return profileManager.canDownload();
		} catch (error) {
			// Si el ProfileManager no está inicializado, devolver false
			return false;
		}
	}, [activeProfile, stats.activeProfileRequired]);

	const canDownloadContent = useCallback(
		(downloadItem: DownloadItem) => {
			try {
				return profileManager.canDownloadContent(downloadItem);
			} catch (error) {
				// Si el ProfileManager no está inicializado, devolver false
				return false;
			}
		},
		[activeProfile, stats.activeProfileRequired, stats.filteringEnabled]
	);

	return {
		canDownload,
		canDownloadContent,
		activeProfileRequired: stats.activeProfileRequired ?? false,
	};
}
