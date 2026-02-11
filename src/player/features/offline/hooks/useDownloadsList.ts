/*
 * Hook ligero para lista de descargas con throttle configurable
 *
 * Proporciona la lista de descargas ordenada y acciones principales.
 * Los eventos PROGRESS se throttlean (default 3s) para reducir re-renders.
 * Los cambios de estado (STARTED, COMPLETED, FAILED, REMOVED) son inmediatos.
 *
 * Usar en lugar de useDownloadsManager cuando NO se necesita:
 * - Estadísticas globales (queueStats, totalProgress, globalSpeed)
 * - Acciones masivas (pauseAll, resumeAll)
 * - Estado del sistema (isProcessing, isPaused)
 *
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerError } from "../../../core/errors";
import { downloadsManager } from "../managers/DownloadsManager";
import { profileManager } from "../managers/ProfileManager";
import { queueManager } from "../managers/QueueManager";
import { downloadService } from "../services/download/DownloadService";
import { dashManifestParser } from "../services/manifest/DASHManifestParser";
import { hlsManifestParser } from "../services/manifest/HLSManifestParser";
import { storageService } from "../services/storage/StorageService";
import {
	BinaryDownloadTask,
	DownloadEventType,
	DownloadItem,
	DownloadStates,
	DownloadType,
	StreamDownloadTask,
	UsableDownloadItem,
} from "../types";
import { ensureDownloadId, isValidUri } from "../utils/downloadsUtils";

export interface UseDownloadsListReturn {
	// Lista de descargas (ordenada)
	downloads: DownloadItem[];

	// Estado
	isInitialized: boolean;

	// Acciones principales
	addDownload: (item: UsableDownloadItem) => Promise<string>;
	removeDownload: (id: string) => Promise<void>;
	cancelDownload: (id: string) => Promise<void>;
}

interface UseDownloadsListOptions {
	autoInit?: boolean;
	throttleMs?: number;
}

/*
 * Hook para lista de descargas con throttle de progreso
 *
 * @param options Opciones de configuración
 * @returns Lista de descargas ordenada y acciones
 *
 */

export function useDownloadsList(options: UseDownloadsListOptions = {}): UseDownloadsListReturn {
	const { autoInit = true, throttleMs = 3000 } = options;

	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [isInitialized, setIsInitialized] = useState(false);
	const [_error, setError] = useState<PlayerError | null>(null);

	// Función de ordenamiento de descargas (misma lógica que useDownloadsManager)
	const sortDownloads = useCallback((items: DownloadItem[]): DownloadItem[] => {
		const statePriority: Record<DownloadStates, number> = {
			[DownloadStates.DOWNLOADING]: 1,
			[DownloadStates.DOWNLOADING_ASSETS]: 1,
			[DownloadStates.PREPARING]: 1,
			[DownloadStates.QUEUED]: 2,
			[DownloadStates.PAUSED]: 2,
			[DownloadStates.WAITING_FOR_NETWORK]: 2,
			[DownloadStates.FAILED]: 3,
			[DownloadStates.COMPLETED]: 4,
			[DownloadStates.RESTART]: 5,
			[DownloadStates.RESTARTING]: 5,
			[DownloadStates.REMOVING]: 5,
			[DownloadStates.STOPPED]: 5,
			[DownloadStates.NOT_DOWNLOADED]: 5,
		};

		return [...items].sort((a, b) => {
			const priorityA = statePriority[a.state] || 5;
			const priorityB = statePriority[b.state] || 5;

			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			const timeA = a.stats.startedAt || 0;
			const timeB = b.stats.startedAt || 0;

			return timeB - timeA;
		});
	}, []);

	// Actualizar lista desde el manager
	const updateList = useCallback(() => {
		if (downloadsManager.isInitialized()) {
			const newDownloads = downloadsManager.getDownloads();
			const sortedDownloads = sortDownloads(newDownloads);
			setDownloads(sortedDownloads);
		}
	}, [sortDownloads]);

	// Inicialización
	useEffect(() => {
		if (autoInit && !isInitialized) {
			const init = async () => {
				try {
					await downloadsManager.initialize();
					updateList();
					setIsInitialized(true);
					setError(null);
				} catch (err) {
					const caughtError =
						err instanceof PlayerError
							? err
							: new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", {
									originalError: err,
								});
					setError(caughtError);
				}
			};
			init();
		}
	}, [autoInit, isInitialized, updateList]);

	// Ref para throttle de eventos PROGRESS
	const progressThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Suscripción a eventos
	useEffect(() => {
		if (!downloadsManager.isInitialized()) {
			return;
		}

		const unsubscribers: (() => void)[] = [];

		// Eventos inmediatos (cambios de lista)
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.STARTED, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.COMPLETED, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.FAILED, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.REMOVED, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.QUEUED, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.STATE_CHANGE, () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("downloads:change", () => {
				updateList();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("profile:profile_changed", () => {
				updateList();
			})
		);

		// Eventos de progreso (THROTTLEADO)
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.PROGRESS, () => {
				if (!progressThrottleRef.current) {
					progressThrottleRef.current = setTimeout(() => {
						progressThrottleRef.current = null;
						updateList();
					}, throttleMs);
				}
			})
		);

		return () => {
			unsubscribers.forEach(unsubscriber => unsubscriber());
			if (progressThrottleRef.current) {
				clearTimeout(progressThrottleRef.current);
				progressThrottleRef.current = null;
			}
		};
	}, [isInitialized, updateList, throttleMs]);

	// Acciones principales (misma lógica que useDownloadsManager)
	const addDownload = useCallback(
		async (item: UsableDownloadItem): Promise<string> => {
			try {
				if (!isValidUri(item.uri)) {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadId: item.id,
						title: item.title,
						message: `Invalid download URI: ${item.uri}`,
					});
				}

				const itemWithId = ensureDownloadId(item);

				if (!profileManager.canDownload()) {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadId: itemWithId.id,
						title: itemWithId.title,
						message: "No active profile available for downloads",
					});
				}

				if (!downloadService.isTypeEnabled(itemWithId.type)) {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadId: itemWithId.id,
						title: itemWithId.title,
						message: `Download type ${itemWithId.type} is not enabled.`,
					});
				}

				const existingDownload = queueManager.getDownload(itemWithId.id);
				if (existingDownload) {
					return itemWithId.id;
				}

				const activeProfileId = profileManager.getActiveProfileId();
				const profileIds = activeProfileId ? [activeProfileId] : [];

				const downloadItem: DownloadItem = {
					...itemWithId,
					profileIds,
					state: DownloadStates.QUEUED,
					stats: {
						progressPercent: 0,
						bytesDownloaded: 0,
						totalBytes: 0,
						retryCount: 0,
					},
				};

				const downloadId = await queueManager.addDownloadItem(downloadItem);

				let task: BinaryDownloadTask | StreamDownloadTask;

				if (itemWithId.type === DownloadType.BINARY) {
					const binariesDir = storageService.getBinariesDirectory();
					task = {
						id: itemWithId.id,
						url: itemWithId.uri,
						destination: `${binariesDir}/${itemWithId.id}`,
						title: itemWithId.title,
						headers: {},
						resumable: true,
					} as BinaryDownloadTask;
				} else if (itemWithId.type === DownloadType.STREAM) {
					let subtitlesForTask = itemWithId.subtitles
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

					const hasValidSubtitles = subtitlesForTask && subtitlesForTask.length > 0;
					if (!hasValidSubtitles) {
						const isHLS = itemWithId.uri.includes(".m3u8");
						const isDASH = itemWithId.uri.includes(".mpd");

						if (isHLS) {
							try {
								const manifestSubtitles = await hlsManifestParser.extractSubtitles(
									itemWithId.uri,
									itemWithId.headers
								);
								if (manifestSubtitles.length > 0) {
									subtitlesForTask = manifestSubtitles.map(sub => ({
										id: sub.id,
										uri: sub.uri,
										language: sub.language,
										label: sub.label,
										format: sub.format,
										isDefault: sub.isDefault,
										encoding: undefined,
									}));
								}
							} catch (manifestError) {
								console.warn(
									"[useDownloadsList] Failed to extract subtitles from HLS manifest:",
									manifestError
								);
							}
						} else if (isDASH) {
							try {
								const manifestSubtitles = await dashManifestParser.extractSubtitles(
									itemWithId.uri,
									itemWithId.headers
								);
								if (manifestSubtitles.length > 0) {
									subtitlesForTask = manifestSubtitles.map(sub => ({
										id: sub.id,
										uri: sub.uri,
										language: sub.language,
										label: sub.label,
										format: sub.format,
										isDefault: sub.isDefault,
										encoding: undefined,
									}));
								}
							} catch (manifestError) {
								console.warn(
									"[useDownloadsList] Failed to extract subtitles from DASH manifest:",
									manifestError
								);
							}
						}
					}

					task = {
						id: itemWithId.id,
						manifestUrl: itemWithId.uri,
						title: itemWithId.title,
						headers: itemWithId.headers,
						config: {
							type: itemWithId.uri.includes(".m3u8") ? "HLS" : "DASH",
							quality: "auto",
							drm: itemWithId.drm,
						},
						subtitles: subtitlesForTask,
					} as StreamDownloadTask;
				} else {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadType: itemWithId.type,
						downloadId: itemWithId.id,
						message: `Invalid download type: ${itemWithId.type}`,
					});
				}

				await downloadsManager.addDownload(task, itemWithId.type);

				updateList();
				return downloadId;
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: item.id || "unknown",
								title: item.title,
							});
				setError(caughtError);
				throw caughtError;
			}
		},
		[updateList]
	);

	const removeDownload = useCallback(
		async (id: string): Promise<void> => {
			try {
				await downloadsManager.removeDownload(id);
				updateList();
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: id,
							});
				setError(caughtError);
				throw caughtError;
			}
		},
		[updateList]
	);

	const cancelDownload = useCallback(
		async (id: string): Promise<void> => {
			return removeDownload(id);
		},
		[removeDownload]
	);

	return {
		downloads,
		isInitialized,
		addDownload,
		removeDownload,
		cancelDownload,
	};
}
