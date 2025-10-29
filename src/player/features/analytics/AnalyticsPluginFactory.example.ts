/*
 *  EJEMPLO DE IMPLEMENTACIÓN EN PROYECTO
 *
 *  Ejemplo con el Plugin de Comscore
 *
 */

import { BaseAnalyticsPluginFactory } from "./AnalyticsPluginFactory";
import { type PlayerAnalyticsPlugin } from "./types";

export class SampleAnalyticsFactory extends BaseAnalyticsPluginFactory {
	/*
	 *  Imaginemos que en este ejemplo mediaData tiene la siguiente estructura:
	 *
	 *  mediaData: MediaDto | StreamDto | null
	 *
	 */

	// @ts-ignore
	protected static mapMediaDataToComscoreMetadata(mediaData: MediaDto | StreamDto | null): any {
		return {
			// Mapeo específico del proyecto A
			c3: `${mediaData.contentType}_${mediaData.category}`,
			c4: mediaData.series
				? `${mediaData.series.name}_S${mediaData.series.season}E${mediaData.series.episode}`
				: mediaData.title,
			c6: mediaData.id,
			c12: mediaData.category,
			ns_st_ci: mediaData.id,
			ns_st_ep: mediaData.series?.name || mediaData.title,
			ns_st_pr: mediaData.series?.name || "standalone",
			ns_st_sn: mediaData.series?.season?.toString() || "1",
			ns_st_en: mediaData.series?.episode?.toString() || "1",
			ns_st_ge: mediaData.category,
			ns_st_cl: Math.round(mediaData.duration).toString(),
			ns_st_ty: mediaData.contentType === "live" ? "live" : "content",
		};
	}

	// @ts-ignore
	protected static mapMediaDataToAdobeMetadata(mediaData: MediaDto | StreamDto | null): any {
		return {
			videoName: mediaData.title,
			videoId: mediaData.id,
			videoLength: mediaData.duration,
			videoShow: mediaData.series?.name || "standalone",
			videoSeason: mediaData.series?.season || 1,
			videoEpisode: mediaData.series?.episode || 1,
			videoGenre: mediaData.category,
			videoType: mediaData.contentType,
		};
	}

	// Creador específico de ComScore
	// @ts-ignore
	static createComscorePlugin(
		mediaData: MediaDto | StreamDto | null
	): PlayerAnalyticsPlugin | null {
		if (!this.validateMediaData(mediaData)) {
			return null;
		}

		try {
			// @ts-ignore
			const comscoreMetadata = this.mapMediaDataToComscoreMetadata(mediaData);

			// Importar el creador específico (debes importar tu módulo ComScore)
			// return createComscorePlugin(mediaData, { metadata: comscoreMetadata });

			// Placeholder - reemplazar con tu implementación real
			return {
				name: "ComScore",
				version: "1.0.0",
				onPlay: () => console.log("ComScore: Play event"),
				onPause: () => console.log("ComScore: Pause event"),
				onProgress: params => console.log("ComScore: Progress", params),
				destroy: () => console.log("ComScore: Destroyed"),
			};
		} catch (error) {
			console.error("[Project A] Error creating ComScore plugin:", error);
			return null;
		}
	}

	// Creador específico de Adobe
	// @ts-ignore
	static createAdobePlugin(mediaData: MediaDto | StreamDto | null): PlayerAnalyticsPlugin | null {
		if (!this.validateMediaData(mediaData)) {
			return null;
		}

		try {
			// @ts-ignore
			const adobeMetadata = this.mapMediaDataToAdobeMetadata(mediaData);

			// Importar el creador específico (debes importar tu módulo Adobe)
			// return createAdobePlugin(mediaData, { metadata: adobeMetadata });

			// Placeholder - reemplazar con tu implementación real
			return {
				name: "Adobe",
				version: "1.0.0",
				onPlay: () => console.log("Adobe: Play event"),
				onPause: () => console.log("Adobe: Pause event"),
				onProgress: params => console.log("Adobe: Progress", params),
				destroy: () => console.log("Adobe: Destroyed"),
			};
		} catch (error) {
			console.error("[Project A] Error creating Adobe plugin:", error);
			return null;
		}
	}

	// Registro de plugins
	static {
		this.registerPlugin("comscore", this.createComscorePlugin.bind(this));
		this.registerPlugin("adobe", this.createAdobePlugin.bind(this));
	}
}
