import { PlayerError } from "../../core/errors";
import { ComponentLogger, Logger } from "../../features/logger";
import { IDrm } from "../../types";
import { getAbsoluteUri, getSourceMessageForCast } from "../../utils";
import { LoggerConfigBasic } from "../logger/types";
import {
	DEFAULT_MESSAGE_CONFIG,
	LOGGER_CONFIG,
	METADATA_CONFIG,
	SUPPORTED_MIME_TYPES,
} from "./constants";
import { CastContentType } from "./types/enums";
import { CastContentMetadata, CastMessageConfig, MessageBuilderConfig } from "./types/types";

const LOG_KEY = "CastMessageBuilder";

/*
 *  Clase para construir mensajes Cast de forma consistente
 *
 */

export class CastMessageBuilder {
	private static instanceCounter = 0;

	private config: MessageBuilderConfig & LoggerConfigBasic;
	private instanceId?: number;

	private playerLogger: Logger;
	private currentLogger: ComponentLogger;

	constructor(config: Partial<MessageBuilderConfig & LoggerConfigBasic> = {}) {
		this.instanceId = ++CastMessageBuilder.instanceCounter;
		this.config = { ...DEFAULT_MESSAGE_CONFIG, ...config };

		this.playerLogger = new Logger(
			{
				enabled: config.enabled ?? LOGGER_CONFIG.enabled,
				prefix: LOGGER_CONFIG.prefix,
				level: config.level ?? LOGGER_CONFIG.level,
				useColors: true,
				includeLevelName: false,
				includeTimestamp: true,
				includeInstanceId: true,
			},
			this.instanceId
		);

		this.currentLogger = this.playerLogger.forComponent(
			LOG_KEY,
			config.enabled ?? LOGGER_CONFIG.enabled,
			config.level ?? LOGGER_CONFIG.level
		);

		this.currentLogger.info(`Initialized: ${JSON.stringify(this.config)}`);
	}

	/*
	 *  Construye un mensaje Cast completo
	 *
	 */

	buildCastMessage(config: CastMessageConfig): any {
		this.currentLogger?.debug(
			`Building cast message ${JSON.stringify({
				sourceUri: config.source.uri,
				contentId: config.metadata.id,
				isLive: config.metadata.isLive,
			})}`
		);

		console.log(`Building cast message from config ${JSON.stringify(config)}`);

		try {
			// Validar configuración
			this.validateConfig(config);

			// Generar ID único para el contenido
			const contentId = this.generateContentId(config);

			// Preparar metadata
			const metadata = this.buildMetadata(config.metadata, config.drm);

			// Calcular posición de inicio
			const startPosition = this.calculateStartPosition(config);

			const streamType = metadata.isLive ? "live" : "buffered";

			// Construir mensaje usando función existente
			const message = getSourceMessageForCast(
				config.source.uri,
				config.manifest,
				config.drm,
				this.config.enableYoubora ? config.youbora : undefined,
				{
					...metadata,
					startPosition,
					adTagUrl: this.config.enableAds ? config.metadata.adTagUrl : "",
				}
			);

			// Agregar información adicional
			if (message && message.mediaInfo) {
				// Determinar el tipo de contenido multimedia
				const mediaType = this.getMediaType(config.source.uri, config.metadata.mediaType);

				message.mediaInfo.contentId = contentId;
				message.mediaInfo.contentType = this.getMimeType(config.source.uri, mediaType);
				message.mediaInfo.streamType = streamType;
				message.mediaInfo.mediaType = mediaType;

				// Agregar metadata personalizada
				message.customData = {
					...message.customData,
					sourceDescription: {
						metadata: metadata,
					},
					streamType: streamType,
					contentType: this.getMimeType(config.source.uri),
					type: this.getContentType(config.metadata),
					mediaType: mediaType,
					buildTimestamp: Date.now(),
					builderVersion: "1.0.0",
					manifest: {
						url: getAbsoluteUri(config.manifest.manifestURL),
						licenseServer: config.manifest?.drmConfig?.licenseAcquisitionURL
							? getAbsoluteUri(config.manifest.drmConfig.licenseAcquisitionURL)
							: undefined,
						certificateUrl: config.manifest?.drmConfig?.certificateURL
							? getAbsoluteUri(config.manifest.drmConfig.certificateURL)
							: undefined,
					},
					...config.customDataForCast,
				};
			}

			console.log(`[CastMessageBuilder] Final enriched message: ${JSON.stringify(message)}`);
			this.currentLogger?.debug(`Cast message built successfully ${JSON.stringify(message)}`);

			return message;
		} catch (error) {
			this.currentLogger?.error(`Error building cast message: ${JSON.stringify(error)}`);

			if (error instanceof PlayerError) {
				throw error;
			} else {
				throw new PlayerError("PLAYER_CAST_MESSAGE_BUILD_FAILED");
			}
		}
	}

	/*
	 *  Actualiza la configuración del builder
	 *
	 */

	updateConfig(newConfig: Partial<MessageBuilderConfig>): void {
		this.config = { ...this.config, ...newConfig };
		this.playerLogger?.updateConfig({
			enabled: this.config.enabled ?? LOGGER_CONFIG.enabled,
			level: this.config.level ?? LOGGER_CONFIG.level,
		});
		this.currentLogger?.debug(`Configuration updated ${JSON.stringify(this.config)}`);
	}

	/*
	 *  Valida la configuración del mensaje
	 *
	 */

	private validateConfig(config: CastMessageConfig): void {
		if (!config.source || !config.source.uri) {
			throw new PlayerError("PLAYER_CAST_INVALID_SOURCE", { url: config.source?.uri });
		}

		if (!config.manifest) {
			throw new PlayerError("PLAYER_CAST_INVALID_MANIFEST");
		}

		if (!config.metadata) {
			throw new PlayerError("PLAYER_CAST_INVALID_METADATA");
		}

		// Validar URL
		if (!this.isValidUrl(config.source.uri)) {
			throw new PlayerError("PLAYER_CAST_INVALID_SOURCE", { url: config.source.uri });
		}
	}

	/*
	 *  Genera el contentId
	 *
	 */

	private generateContentId(config: CastMessageConfig): string {
		const { source } = config;

		return source.uri;
	}

	/*
	 *  Construye metadata para Cast
	 *
	 */

	private buildMetadata(metadata: CastContentMetadata, drm?: IDrm): CastContentMetadata {
		return {
			id: metadata.id,
			title: this.truncateString(
				metadata.title || "Sin título",
				METADATA_CONFIG.MAX_TITLE_LENGTH
			),
			subtitle: this.truncateString(
				metadata.subtitle || "",
				METADATA_CONFIG.MAX_TITLE_LENGTH
			),
			description: this.truncateString(
				metadata.description || "",
				METADATA_CONFIG.MAX_DESCRIPTION_LENGTH
			),
			poster: metadata.squaredPoster || metadata.poster || METADATA_CONFIG.DEFAULT_POSTER,
			liveStartDate: metadata.liveStartDate,
			adTagUrl: metadata.adTagUrl,
			hasNext: metadata.hasNext || false,
			isLive: metadata.isLive || false,
			isDVR: metadata.isDVR || false,
			startPosition: metadata.startPosition || this.config.defaultStartPosition || 0,
			mediaType: metadata.mediaType,
			licenseAcquisitionURL: drm?.licenseServer
				? getAbsoluteUri(drm.licenseServer)
				: undefined,
			certificateUrl: drm?.certificateUrl ? getAbsoluteUri(drm.certificateUrl) : undefined,
			drmType: drm?.type,
		};
	}

	/*
	 *  Calcula la posición de inicio para el contenido
	 *
	 */

	private calculateStartPosition(config: CastMessageConfig): number {
		const { metadata } = config;

		/*
		 *  Esto es estándar en el protocolo de Cast:
		 *
		 *  startTime: -1 → empieza a reproducir desde el final del buffer, es decir, el live edge del stream.
		 *
		 */

		// Para contenido live/DVR, usar lógica específica
		if (metadata.isLive) {
			if (metadata.isDVR) {
				// Para DVR, usar startPosition del metadata o -1
				return metadata.startPosition || -1;
			} else {
				// Para live, siempre empezar en el liveEdge (-1)
				return -1;
			}
		}

		// Para VOD, usar startPosition del metadata
		return metadata.startPosition || this.config.defaultStartPosition || 0;
	}

	/*
	 *  Obtiene el tipo MIME basado en la URL
	 *
	 */

	private getMimeType(uri: string, mediaType?: "video" | "audio"): string {
		const url = uri.toLowerCase();

		if (mediaType !== "audio" && (url.includes(".m3u8") || url.includes("hls"))) {
			return SUPPORTED_MIME_TYPES.HLS;
		}

		if (mediaType !== "audio" && (url.includes(".mpd") || url.includes("dash"))) {
			return SUPPORTED_MIME_TYPES.DASH;
		}

		if (url.includes(".mp3") || mediaType === "audio") {
			return SUPPORTED_MIME_TYPES.MP3;
		}

		if (url.includes(".mp4")) {
			return SUPPORTED_MIME_TYPES.MP4;
		}

		if (url.includes(".webm")) {
			return SUPPORTED_MIME_TYPES.WEBM;
		}

		// Default para streaming
		return SUPPORTED_MIME_TYPES.DASH;
	}

	/*
	 *  Determina el tipo de contenido
	 *
	 */

	private getContentType(metadata: CastContentMetadata): CastContentType {
		if (metadata.isLive) {
			return metadata.isDVR ? CastContentType.DVR : CastContentType.LIVE;
		}

		return CastContentType.VOD;
	}

	/*
	 *  Valida si una URL es válida
	 *
	 */

	private isValidUrl(url: string): boolean {
		try {
			return url.startsWith("http://") || url.startsWith("https://");
		} catch {
			return false;
		}
	}

	/*
	 *  Determina el tipo de contenido multimedia (audio/video)
	 *
	 */

	private getMediaType(uri: string, explicitMediaType?: "video" | "audio"): "video" | "audio" {
		// Si se especifica explícitamente, usar ese valor
		if (explicitMediaType) {
			return explicitMediaType;
		}

		// Detectar automáticamente basándose en el MIME type
		const mimeType = this.getMimeType(uri);

		// Los MP3 son claramente audio
		if (mimeType === SUPPORTED_MIME_TYPES.MP3) {
			return "audio";
		}

		// Para streams DASH/HLS, por defecto asumir video a menos que se especifique
		// El receptor de cast puede usar esta información para renderizar correctamente
		return "video";
	}

	/*
	 *  Trunca un string a la longitud especificada
	 *
	 */

	private truncateString(str: string, maxLength: number): string {
		if (str.length <= maxLength) {
			return str;
		}
		return str.substring(0, maxLength - 3) + "...";
	}

	/*
	 *  Obtiene la configuración actual
	 *
	 */

	getConfig(): MessageBuilderConfig {
		return { ...this.config };
	}

	/*
	 *  Resetea la configuración a valores por defecto
	 *
	 */

	resetConfig(): void {
		this.config = { ...DEFAULT_MESSAGE_CONFIG };
		this.playerLogger?.updateConfig({
			enabled: this.config.enabled ?? LOGGER_CONFIG.enabled,
			level: this.config.level ?? LOGGER_CONFIG.level,
		});
		this.currentLogger?.debug("Configuration reset to defaults");
	}
}
