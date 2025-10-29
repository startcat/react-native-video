import { PlayerError } from '../../core/errors';
import { ComponentLogger, Logger } from '../../features/logger';
import { getSourceMessageForCast } from '../../utils';
import { LoggerConfigBasic } from '../logger/types';
import {
	DEFAULT_MESSAGE_CONFIG,
	LOGGER_CONFIG,
	METADATA_CONFIG,
	SUPPORTED_MIME_TYPES,
} from './constants';
import { CastContentType } from './types/enums';
import { CastContentMetadata, CastMessageConfig, MessageBuilderConfig } from './types/types';

const LOG_KEY = 'CastMessageBuilder';

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

		try {
			// Validar configuración
			this.validateConfig(config);

			// Generar ID único para el contenido
			const contentId = this.generateContentId(config);

			// Preparar metadata
			const metadata = this.buildMetadata(config.metadata);

			// Calcular posición de inicio
			const startPosition = this.calculateStartPosition(config);

			const streamType = metadata.isLive ? 'live' : 'buffered';

			// Construir mensaje usando función existente
			const message = getSourceMessageForCast(
				config.source.uri,
				config.manifest,
				config.drm,
				this.config.enableYoubora ? config.youbora : undefined,
				{
					...metadata,
					startPosition,
					adTagUrl: this.config.enableAds ? config.metadata.adTagUrl : '',
				}
			);

			// Agregar información adicional
			if (message && message.mediaInfo) {
				message.mediaInfo.contentId = contentId;
				message.mediaInfo.contentType = this.getMimeType(config.source.uri);
				message.mediaInfo.streamType = streamType;

				// Agregar metadata personalizada
				message.mediaInfo.customData = {
					...message.mediaInfo.customData,
					sourceDescription: {
						metadata: metadata,
					},
					streamType: streamType,
					contentType: this.getMimeType(config.source.uri),
					type: this.getContentType(config.metadata),
					buildTimestamp: Date.now(),
					builderVersion: '1.0.0',
				};
			}

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

	private buildMetadata(metadata: CastContentMetadata): CastContentMetadata {
		return {
			id: metadata.id,
			title: this.truncateString(
				metadata.title || 'Sin título',
				METADATA_CONFIG.MAX_TITLE_LENGTH
			),
			subtitle: this.truncateString(
				metadata.subtitle || '',
				METADATA_CONFIG.MAX_TITLE_LENGTH
			),
			description: this.truncateString(
				metadata.description || '',
				METADATA_CONFIG.MAX_DESCRIPTION_LENGTH
			),
			poster: metadata.squaredPoster || metadata.poster || METADATA_CONFIG.DEFAULT_POSTER,
			liveStartDate: metadata.liveStartDate,
			adTagUrl: metadata.adTagUrl,
			hasNext: metadata.hasNext || false,
			isLive: metadata.isLive || false,
			isDVR: metadata.isDVR || false,
			startPosition: metadata.startPosition || this.config.defaultStartPosition || 0,
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

	private getMimeType(uri: string): string {
		const url = uri.toLowerCase();

		if (url.includes('.m3u8') || url.includes('hls')) {
			return SUPPORTED_MIME_TYPES.HLS;
		}

		if (url.includes('.mpd') || url.includes('dash')) {
			return SUPPORTED_MIME_TYPES.DASH;
		}

		if (url.includes('.mp3')) {
			return SUPPORTED_MIME_TYPES.MP3;
		}

		if (url.includes('.mp4')) {
			return SUPPORTED_MIME_TYPES.MP4;
		}

		if (url.includes('.webm')) {
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
			new URL(url);
			return url.startsWith('http://') || url.startsWith('https://');
		} catch {
			return false;
		}
	}

	/*
	 *  Trunca un string a la longitud especificada
	 *
	 */

	private truncateString(str: string, maxLength: number): string {
		if (str.length <= maxLength) {
			return str;
		}
		return str.substring(0, maxLength - 3) + '...';
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
		this.currentLogger?.debug('Configuration reset to defaults');
	}
}
