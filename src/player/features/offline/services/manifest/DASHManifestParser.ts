/*
 * Servicio para parsear manifests DASH (MPD) y extraer información de subtítulos y audio
 * Extrae automáticamente las pistas de subtítulos del manifest DASH
 */

import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { LOGGER_DEFAULTS } from "../../defaultConfigs";
import { SubtitleFormat } from "../../types";

const TAG = LOG_TAGS.STREAM_DOWNLOADER;

export interface DASHSubtitleTrack {
	id: string;
	uri: string;
	language: string;
	label: string;
	format: SubtitleFormat;
	isDefault: boolean;
	mimeType?: string;
}

export interface DASHAudioTrack {
	id: string;
	uri: string;
	language: string;
	label: string;
	isDefault: boolean;
	mimeType?: string;
	channels?: string;
}

export interface DASHManifestInfo {
	subtitles: DASHSubtitleTrack[];
	audioTracks: DASHAudioTrack[];
	baseUrl: string;
}

export class DASHManifestParser {
	private static instance: DASHManifestParser;
	private currentLogger: Logger;

	private constructor() {
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			prefix: "[DASHManifestParser]",
		});
	}

	public static getInstance(): DASHManifestParser {
		if (!DASHManifestParser.instance) {
			DASHManifestParser.instance = new DASHManifestParser();
		}
		return DASHManifestParser.instance;
	}

	/*
	 * Parsea un manifest DASH y extrae información de subtítulos y audio
	 */
	public async parseManifest(
		manifestUrl: string,
		headers?: Record<string, string>
	): Promise<DASHManifestInfo> {
		this.currentLogger.info(TAG, `Parsing DASH manifest: ${manifestUrl}`);

		try {
			const manifestContent = await this.fetchManifest(manifestUrl, headers);
			const baseUrl = this.getBaseUrl(manifestUrl);

			const subtitles = this.parseSubtitles(manifestContent, baseUrl, manifestUrl);
			const audioTracks = this.parseAudioTracks(manifestContent, baseUrl);

			this.currentLogger.info(
				TAG,
				`Parsed DASH manifest: ${subtitles.length} subtitles, ${audioTracks.length} audio tracks`
			);

			return {
				subtitles,
				audioTracks,
				baseUrl,
			};
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to parse DASH manifest: ${manifestUrl}`, error);
			return {
				subtitles: [],
				audioTracks: [],
				baseUrl: this.getBaseUrl(manifestUrl),
			};
		}
	}

	/*
	 * Extrae solo los subtítulos del manifest DASH
	 */
	public async extractSubtitles(
		manifestUrl: string,
		headers?: Record<string, string>
	): Promise<DASHSubtitleTrack[]> {
		const info = await this.parseManifest(manifestUrl, headers);
		return info.subtitles;
	}

	private async fetchManifest(url: string, headers?: Record<string, string>): Promise<string> {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "react-native-video-offline/1.0",
				...headers,
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.text();
	}

	private getBaseUrl(manifestUrl: string): string {
		const lastSlashIndex = manifestUrl.lastIndexOf("/");
		return lastSlashIndex > 0 ? manifestUrl.substring(0, lastSlashIndex + 1) : manifestUrl;
	}

	/*
	 * Parsea subtítulos del manifest DASH (MPD)
	 * Busca AdaptationSet con contentType="text" o mimeType que contenga "vtt" o "ttml"
	 */
	private parseSubtitles(
		manifestContent: string,
		baseUrl: string,
		manifestUrl: string
	): DASHSubtitleTrack[] {
		const subtitles: DASHSubtitleTrack[] = [];

		// Buscar AdaptationSets de subtítulos
		// Patrones: contentType="text", mimeType="text/vtt", mimeType="application/ttml+xml"
		const adaptationSetRegex = /<AdaptationSet[^>]*>([\s\S]*?)<\/AdaptationSet>/gi;
		let match;

		while ((match = adaptationSetRegex.exec(manifestContent)) !== null) {
			const adaptationSetContent = match[0];
			const innerContent = match[1] || "";

			// Verificar si es un AdaptationSet de subtítulos
			if (!this.isSubtitleAdaptationSet(adaptationSetContent)) {
				continue;
			}

			// Extraer atributos del AdaptationSet
			const language = this.extractAttribute(adaptationSetContent, "lang") || "und";
			const label =
				this.extractAttribute(adaptationSetContent, "label") ||
				this.getLanguageLabel(language);
			const mimeType = this.extractAttribute(adaptationSetContent, "mimeType") || "";

			// Buscar BaseURL dentro del AdaptationSet
			let subtitleUrl: string | null = this.extractBaseUrl(innerContent);

			// Si no hay BaseURL, buscar en Representation
			if (!subtitleUrl && innerContent) {
				subtitleUrl = this.extractRepresentationUrl(innerContent);
			}

			// Si aún no hay URL, intentar construirla desde el manifest URL
			if (!subtitleUrl) {
				// Algunos DASH usan URLs relativas basadas en el ID
				const id = this.extractAttribute(adaptationSetContent, "id");
				if (id) {
					// Construir URL de subtítulo basada en patrón común
					subtitleUrl = this.constructSubtitleUrl(manifestUrl, id, language);
				}
			}

			if (subtitleUrl) {
				// Resolver URL relativa
				const resolvedUrl = this.resolveUrl(subtitleUrl, baseUrl);

				const format = this.detectSubtitleFormat(mimeType || "", resolvedUrl);

				subtitles.push({
					id: `subtitle_${language}_${subtitles.length}`,
					uri: resolvedUrl,
					language,
					label: label || language,
					format,
					isDefault: language === "ca" || language === "es" || subtitles.length === 0,
					mimeType: mimeType || undefined,
				});

				this.currentLogger.info(TAG, `Found DASH subtitle: ${language} - ${resolvedUrl}`);
			}
		}

		return subtitles;
	}

	private isSubtitleAdaptationSet(content: string): boolean {
		const contentType = this.extractAttribute(content, "contentType");
		const mimeType = this.extractAttribute(content, "mimeType");

		// Verificar contentType="text"
		if (contentType === "text") {
			return true;
		}

		// Verificar mimeType de subtítulos
		if (mimeType) {
			const subtitleMimeTypes = [
				"text/vtt",
				"application/ttml+xml",
				"application/x-subrip",
				"text/plain",
			];
			return subtitleMimeTypes.some(type => mimeType.includes(type));
		}

		return false;
	}

	private extractAttribute(content: string, attributeName: string): string | null {
		// Buscar atributo con comillas dobles o simples
		const regex = new RegExp(`${attributeName}=["']([^"']+)["']`, "i");
		const match = content.match(regex);
		return match && match[1] ? match[1] : null;
	}

	private extractBaseUrl(content: string): string | null {
		const baseUrlRegex = /<BaseURL[^>]*>([^<]+)<\/BaseURL>/i;
		const match = content.match(baseUrlRegex);
		return match && match[1] ? match[1].trim() : null;
	}

	private extractRepresentationUrl(content: string): string | null {
		// Buscar URL en Representation > BaseURL
		const representationRegex = /<Representation[^>]*>([\s\S]*?)<\/Representation>/i;
		const repMatch = content.match(representationRegex);

		if (repMatch && repMatch[1]) {
			const baseUrl = this.extractBaseUrl(repMatch[1]);
			if (baseUrl) {
				return baseUrl;
			}

			// Buscar SegmentTemplate con media attribute
			const segmentTemplateRegex = /<SegmentTemplate[^>]*media=["']([^"']+)["']/i;
			const segMatch = repMatch[1].match(segmentTemplateRegex);
			if (segMatch && segMatch[1]) {
				return segMatch[1];
			}
		}

		return null;
	}

	private constructSubtitleUrl(
		manifestUrl: string,
		_id: string,
		language: string
	): string | null {
		// Patrón común: reemplazar .mpd con /sub-{index}.vtt o similar
		// Esto es específico del servidor, ajustar según sea necesario
		const baseManifestUrl = manifestUrl.replace(/\.mpd$/, "");

		// Intentar patrón común de 3cat
		// Ejemplo: https://pro.3cat.website/api/manifest/v1/20404/0/dash.mpd
		// Subtítulos: https://pro.3cat.website/api/manifest/v1/20404/0/sub-0.vtt
		if (manifestUrl.includes("3cat")) {
			// Mapear idioma a índice (basado en el orden típico)
			const langIndex = this.getLanguageIndex(language);
			return `${baseManifestUrl.replace("/dash", "")}/sub-${langIndex}.vtt`;
		}

		return null;
	}

	private getLanguageIndex(language: string): number {
		const langOrder: Record<string, number> = {
			ca: 0,
			es: 1,
			en: 2,
			fr: 3,
			de: 4,
			it: 5,
			pt: 6,
		};
		return langOrder[language] ?? 0;
	}

	private resolveUrl(url: string, baseUrl: string): string {
		if (url.startsWith("http://") || url.startsWith("https://")) {
			return url;
		}

		if (url.startsWith("/")) {
			// URL absoluta desde la raíz del dominio
			const urlObj = new URL(baseUrl);
			return `${urlObj.protocol}//${urlObj.host}${url}`;
		}

		// URL relativa
		return baseUrl + url;
	}

	private detectSubtitleFormat(mimeType: string, url: string): SubtitleFormat {
		if (mimeType.includes("vtt") || url.includes(".vtt")) {
			return SubtitleFormat.VTT;
		}
		if (mimeType.includes("ttml") || url.includes(".ttml")) {
			return SubtitleFormat.TTML;
		}
		if (url.includes(".srt")) {
			return SubtitleFormat.SRT;
		}
		// Default a VTT
		return SubtitleFormat.VTT;
	}

	private getLanguageLabel(langCode: string): string {
		const labels: Record<string, string> = {
			ca: "Català",
			es: "Español",
			en: "English",
			fr: "Français",
			de: "Deutsch",
			it: "Italiano",
			pt: "Português",
			und: "Unknown",
		};
		return labels[langCode] || langCode.toUpperCase();
	}

	/*
	 * Parsea pistas de audio alternativas del manifest DASH
	 */
	private parseAudioTracks(manifestContent: string, baseUrl: string): DASHAudioTrack[] {
		const audioTracks: DASHAudioTrack[] = [];

		const adaptationSetRegex = /<AdaptationSet[^>]*>([\s\S]*?)<\/AdaptationSet>/gi;
		let match;

		while ((match = adaptationSetRegex.exec(manifestContent)) !== null) {
			const adaptationSetContent = match[0];
			const innerContent = match[1];

			// Verificar si es un AdaptationSet de audio
			const contentType = this.extractAttribute(adaptationSetContent, "contentType");
			const mimeType = this.extractAttribute(adaptationSetContent, "mimeType") || "";

			if (contentType !== "audio" && !mimeType.includes("audio")) {
				continue;
			}

			if (!innerContent) {
				continue;
			}

			const language = this.extractAttribute(adaptationSetContent, "lang") || "und";
			const label =
				this.extractAttribute(adaptationSetContent, "label") ||
				this.getLanguageLabel(language);

			let audioUrl = this.extractBaseUrl(innerContent);
			if (!audioUrl) {
				audioUrl = this.extractRepresentationUrl(innerContent);
			}

			if (audioUrl) {
				const resolvedUrl = this.resolveUrl(audioUrl!, baseUrl);

				audioTracks.push({
					id: `audio_${language}_${audioTracks.length}`,
					uri: resolvedUrl,
					language,
					label,
					isDefault: audioTracks.length === 0,
					mimeType,
				});
			}
		}

		return audioTracks;
	}
}

// Exportar instancia singleton
export const dashManifestParser = DASHManifestParser.getInstance();
