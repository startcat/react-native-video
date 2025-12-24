/*
 * Servicio para parsear manifests HLS y extraer información de subtítulos y audio
 * Extrae automáticamente las pistas de subtítulos del manifest master HLS
 */

import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { LOGGER_DEFAULTS } from "../../defaultConfigs";
import { SubtitleFormat } from "../../types";

const TAG = LOG_TAGS.STREAM_DOWNLOADER;

export interface HLSSubtitleTrack {
	id: string;
	uri: string;
	language: string;
	label: string;
	format: SubtitleFormat;
	isDefault: boolean;
	groupId?: string;
}

export interface HLSAudioTrack {
	id: string;
	uri: string;
	language: string;
	label: string;
	isDefault: boolean;
	groupId?: string;
	channels?: string;
}

export interface HLSManifestInfo {
	subtitles: HLSSubtitleTrack[];
	audioTracks: HLSAudioTrack[];
	baseUrl: string;
}

export class HLSManifestParser {
	private static instance: HLSManifestParser;
	private currentLogger: Logger;

	private constructor() {
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			prefix: "[HLSManifestParser]",
		});
	}

	public static getInstance(): HLSManifestParser {
		if (!HLSManifestParser.instance) {
			HLSManifestParser.instance = new HLSManifestParser();
		}
		return HLSManifestParser.instance;
	}

	/*
	 * Parsea un manifest HLS y extrae información de subtítulos y audio
	 */
	public async parseManifest(
		manifestUrl: string,
		headers?: Record<string, string>
	): Promise<HLSManifestInfo> {
		this.currentLogger.info(TAG, `Parsing HLS manifest: ${manifestUrl}`);

		try {
			// Obtener el contenido del manifest
			const manifestContent = await this.fetchManifest(manifestUrl, headers);

			// Extraer la URL base para resolver URLs relativas
			const baseUrl = this.getBaseUrl(manifestUrl);

			// Parsear subtítulos
			const subtitles = this.parseSubtitles(manifestContent, baseUrl);

			// Parsear pistas de audio alternativas
			const audioTracks = this.parseAudioTracks(manifestContent, baseUrl);

			this.currentLogger.info(
				TAG,
				`Parsed manifest: ${subtitles.length} subtitles, ${audioTracks.length} audio tracks`
			);

			return {
				subtitles,
				audioTracks,
				baseUrl,
			};
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to parse manifest: ${manifestUrl}`, error);
			// Retornar arrays vacíos en caso de error para no bloquear la descarga
			return {
				subtitles: [],
				audioTracks: [],
				baseUrl: this.getBaseUrl(manifestUrl),
			};
		}
	}

	/*
	 * Obtiene el contenido del manifest HLS
	 */
	private async fetchManifest(url: string, headers?: Record<string, string>): Promise<string> {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				...headers,
				Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
		}

		return response.text();
	}

	/*
	 * Extrae la URL base del manifest para resolver URLs relativas
	 */
	private getBaseUrl(manifestUrl: string): string {
		const lastSlashIndex = manifestUrl.lastIndexOf("/");
		return lastSlashIndex > 0 ? manifestUrl.substring(0, lastSlashIndex + 1) : manifestUrl;
	}

	/*
	 * Parsea las líneas EXT-X-MEDIA con TYPE=SUBTITLES
	 * Formato: #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="es",NAME="Español",DEFAULT=YES,AUTOSELECT=YES,URI="subtitles/es/prog_index.m3u8"
	 */
	private parseSubtitles(manifestContent: string, baseUrl: string): HLSSubtitleTrack[] {
		const subtitles: HLSSubtitleTrack[] = [];
		const lines = manifestContent.split("\n");

		for (const line of lines) {
			if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=SUBTITLES")) {
				const track = this.parseMediaLine(line, baseUrl, "subtitle");
				if (track) {
					subtitles.push(track as HLSSubtitleTrack);
				}
			}
		}

		this.currentLogger.debug(TAG, `Found ${subtitles.length} subtitle tracks`);
		return subtitles;
	}

	/*
	 * Parsea las líneas EXT-X-MEDIA con TYPE=AUDIO
	 * Formato: #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en/prog_index.m3u8"
	 */
	private parseAudioTracks(manifestContent: string, baseUrl: string): HLSAudioTrack[] {
		const audioTracks: HLSAudioTrack[] = [];
		const lines = manifestContent.split("\n");

		for (const line of lines) {
			if (line.startsWith("#EXT-X-MEDIA:") && line.includes("TYPE=AUDIO")) {
				const track = this.parseMediaLine(line, baseUrl, "audio");
				if (track) {
					audioTracks.push(track as HLSAudioTrack);
				}
			}
		}

		this.currentLogger.debug(TAG, `Found ${audioTracks.length} audio tracks`);
		return audioTracks;
	}

	/*
	 * Parsea una línea EXT-X-MEDIA y extrae los atributos
	 */
	private parseMediaLine(
		line: string,
		baseUrl: string,
		type: "subtitle" | "audio"
	): HLSSubtitleTrack | HLSAudioTrack | null {
		// Extraer atributos de la línea
		const attributes = this.parseAttributes(line);

		const uri = attributes.URI;
		const language = attributes.LANGUAGE || "und";
		const name = attributes.NAME || language;
		const isDefault = attributes.DEFAULT === "YES";
		const groupId = attributes["GROUP-ID"];
		const channels = attributes.CHANNELS;

		// Si no hay URI, no podemos descargar el subtítulo/audio
		if (!uri) {
			this.currentLogger.debug(TAG, `Skipping ${type} track without URI: ${name}`);
			return null;
		}

		// Resolver URL relativa
		const fullUri = this.resolveUrl(uri, baseUrl);

		// Generar ID único
		const id = `${type}_${language}_${groupId || "default"}`;

		if (type === "subtitle") {
			// Determinar formato del subtítulo
			const format = this.detectSubtitleFormat(fullUri);

			return {
				id,
				uri: fullUri,
				language,
				label: name,
				format,
				isDefault,
				groupId,
			} as HLSSubtitleTrack;
		} else {
			return {
				id,
				uri: fullUri,
				language,
				label: name,
				isDefault,
				groupId,
				channels,
			} as HLSAudioTrack;
		}
	}

	/*
	 * Parsea los atributos de una línea EXT-X-MEDIA
	 * Maneja valores con comillas y sin comillas
	 */
	private parseAttributes(line: string): Record<string, string> {
		const attributes: Record<string, string> = {};

		// Remover el prefijo #EXT-X-MEDIA:
		const attributeString = line.replace(/^#EXT-X-MEDIA:/, "");

		// Regex para parsear atributos (maneja valores con y sin comillas)
		const regex = /([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g;
		let match;

		while ((match = regex.exec(attributeString)) !== null) {
			const key = match[1];
			const value = match[2] !== undefined ? match[2] : match[3];
			if (key) {
				attributes[key] = value || "";
			}
		}

		return attributes;
	}

	/*
	 * Resuelve una URL relativa contra la URL base
	 */
	private resolveUrl(uri: string, baseUrl: string): string {
		// Si ya es una URL absoluta, retornarla
		if (uri.startsWith("http://") || uri.startsWith("https://")) {
			return uri;
		}

		// Si empieza con /, es relativa al dominio
		if (uri.startsWith("/")) {
			const urlObj = new URL(baseUrl);
			return `${urlObj.protocol}//${urlObj.host}${uri}`;
		}

		// URL relativa al directorio actual
		return baseUrl + uri;
	}

	/*
	 * Detecta el formato del subtítulo basándose en la extensión o contenido
	 */
	private detectSubtitleFormat(uri: string): SubtitleFormat {
		const lowerUri = uri.toLowerCase();

		if (lowerUri.includes(".vtt") || lowerUri.includes("webvtt")) {
			return SubtitleFormat.VTT;
		}
		if (lowerUri.includes(".srt")) {
			return SubtitleFormat.SRT;
		}
		if (lowerUri.includes(".ttml") || lowerUri.includes(".xml")) {
			return SubtitleFormat.TTML;
		}
		if (lowerUri.includes(".ass") || lowerUri.includes(".ssa")) {
			return SubtitleFormat.ASS;
		}

		// Por defecto, HLS usa WebVTT
		return SubtitleFormat.VTT;
	}

	/*
	 * Método conveniente para extraer solo subtítulos
	 */
	public async extractSubtitles(
		manifestUrl: string,
		headers?: Record<string, string>
	): Promise<HLSSubtitleTrack[]> {
		const info = await this.parseManifest(manifestUrl, headers);
		return info.subtitles;
	}

	/*
	 * Método conveniente para extraer solo pistas de audio
	 */
	public async extractAudioTracks(
		manifestUrl: string,
		headers?: Record<string, string>
	): Promise<HLSAudioTrack[]> {
		const info = await this.parseManifest(manifestUrl, headers);
		return info.audioTracks;
	}
}

// Exportar instancia singleton
export const hlsManifestParser = HLSManifestParser.getInstance();
