# Guía de Implementación Detallada

## Tabla de Contenidos

1. [Creación del Factory del Proyecto](#creación-del-factory-del-proyecto)
2. [Implementación de Plugins Específicos](#implementación-de-plugins-específicos)
3. [Mapeo de Datos](#mapeo-de-datos)
4. [Validación y Manejo de Errores](#validación-y-manejo-de-errores)
5. [Configuración por Ambientes](#configuración-por-ambientes)

## Creación del Factory del Proyecto

### 1. Estructura Base

Cada proyecto debe crear su propio factory extendiendo `BaseAnalyticsPluginFactory`:

```typescript
// src/analytics/YourProjectAnalyticsFactory.ts
import {
	BaseAnalyticsPluginFactory,
	type PlayerAnalyticsPlugin,
	type AnalyticsFactoryConfig,
} from "@overon/react-native-overon-player-analytics-plugins";

// Define el tipo de datos de tu proyecto
interface YourMediaData {
	id: string;
	title: string;
	contentType: "live" | "vod";
	category: string;
	duration?: number;
	series?: {
		name: string;
		season: number;
		episode: number;
	};
	// ... más campos específicos
}

export class YourProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
	// Implementa mapeo específico para cada proveedor
	protected static mapMediaDataToComscoreMetadata(
		mediaData: YourMediaData
	): any {
		return {
			// Campos requeridos por ComScore
			c3: `${mediaData.contentType}_${mediaData.category}`,
			c4: mediaData.series
				? `${mediaData.series.name}_S${mediaData.series.season}E${mediaData.series.episode}`
				: mediaData.title,
			c6: mediaData.id,
			c12: mediaData.category,

			// Campos específicos de Streaming Tag
			ns_st_ci: mediaData.id,
			ns_st_ep: mediaData.series?.name || mediaData.title,
			ns_st_pr: mediaData.series?.name || "standalone",
			ns_st_sn: mediaData.series?.season?.toString() || "1",
			ns_st_en: mediaData.series?.episode?.toString() || "1",
			ns_st_ge: mediaData.category,
			ns_st_cl: Math.round(mediaData.duration || 0).toString(),
			ns_st_ty: mediaData.contentType === "live" ? "live" : "content",
		};
	}

	protected static mapMediaDataToAdobeMetadata(mediaData: YourMediaData): any {
		return {
			// Campos específicos de Adobe Analytics
			videoName: mediaData.title,
			videoId: mediaData.id,
			videoLength: mediaData.duration || 0,
			videoShow: mediaData.series?.name || "standalone",
			videoSeason: mediaData.series?.season || 1,
			videoEpisode: mediaData.series?.episode || 1,
			videoGenre: mediaData.category,
			videoType: mediaData.contentType,

			// Dimensiones personalizadas (ajustar según proyecto)
			customVar1: mediaData.category,
			customVar2: mediaData.contentType,
		};
	}

	protected static mapMediaDataToYouboraMetadata(
		mediaData: YourMediaData
	): any {
		return {
			// Campos específicos de Youbora
			"content.id": mediaData.id,
			"content.title": mediaData.title,
			"content.duration": mediaData.duration || 0,
			"content.isLive": mediaData.contentType === "live",
			"content.genre": mediaData.category,

			// Series específicas
			"content.tvShow": mediaData.series?.name,
			"content.season": mediaData.series?.season?.toString(),
			"content.episode": mediaData.series?.episode?.toString(),

			// Dimensiones custom de Youbora
			"extraparam.1": mediaData.category,
			"extraparam.2": mediaData.contentType,
		};
	}
}
```

### 2. Creación de Plugins Específicos

Cada proveedor requiere su propia función de creación:

```typescript
export class YourProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
	// Plugin ComScore
	static createComscorePlugin(
		mediaData: YourMediaData
	): PlayerAnalyticsPlugin | null {
		if (!this.validateMediaData(mediaData)) return null;

		try {
			const metadata = this.mapMediaDataToComscoreMetadata(mediaData);

			// Importar SDK específico (instalar: npm install @comscore/streaming-tag)
			// import { ComscoreStreamingTag } from '@comscore/streaming-tag';

			// Crear instancia del SDK
			// const comscore = new ComscoreStreamingTag({
			//     c2: 'YOUR_COMSCORE_C2_ID',
			//     ...metadata
			// });

			return {
				name: "ComScore",
				version: "1.0.0",

				onPlay: () => {
					console.log("[ComScore] Play event");
					// comscore.play();
				},

				onPause: () => {
					console.log("[ComScore] Pause event");
					// comscore.pause();
				},

				onProgress: params => {
					console.log("[ComScore] Progress", params);
					// comscore.setPosition(params.position);
				},

				onEnd: () => {
					console.log("[ComScore] End event");
					// comscore.end();
				},

				destroy: () => {
					console.log("[ComScore] Destroyed");
					// comscore.cleanup();
				},
			};
		} catch (error) {
			console.error("[Analytics] Error creating ComScore plugin:", error);
			return null;
		}
	}

	// Plugin Adobe
	static createAdobePlugin(
		mediaData: YourMediaData
	): PlayerAnalyticsPlugin | null {
		if (!this.validateMediaData(mediaData)) return null;

		try {
			const metadata = this.mapMediaDataToAdobeMetadata(mediaData);

			// Importar SDK de Adobe (instalar: npm install @adobe/media-sdk)
			// import { MediaHeartbeat } from '@adobe/media-sdk';

			return {
				name: "Adobe",
				version: "1.0.0",

				onCreatePlaybackSession: () => {
					console.log("[Adobe] Creating playback session");
					// heartbeat.trackSessionStart(metadata);
				},

				onPlay: () => {
					console.log("[Adobe] Play event");
					// heartbeat.trackPlay();
				},

				onPause: () => {
					console.log("[Adobe] Pause event");
					// heartbeat.trackPause();
				},

				onProgress: params => {
					console.log("[Adobe] Progress", params);
					// heartbeat.trackProgress(params.position);
				},

				destroy: () => {
					console.log("[Adobe] Destroyed");
					// heartbeat.trackComplete();
				},
			};
		} catch (error) {
			console.error("[Analytics] Error creating Adobe plugin:", error);
			return null;
		}
	}

	// Plugin Youbora
	static createYouboraPlugin(
		mediaData: YourMediaData
	): PlayerAnalyticsPlugin | null {
		if (!this.validateMediaData(mediaData)) return null;

		try {
			const metadata = this.mapMediaDataToYouboraMetadata(mediaData);

			// Importar SDK de Youbora (instalar: npm install youbora-adapter-react-native)
			// import { Plugin as YouboraPlugin } from 'youbora-adapter-react-native';

			return {
				name: "Youbora",
				version: "1.0.0",

				onSourceChange: () => {
					console.log("[Youbora] Source change");
					// youbora.setOptions(metadata);
				},

				onPlay: () => {
					console.log("[Youbora] Play event");
					// youbora.playHandler();
				},

				onPause: () => {
					console.log("[Youbora] Pause event");
					// youbora.pauseHandler();
				},

				onProgress: params => {
					console.log("[Youbora] Progress", params);
					// youbora.progressHandler(params.position);
				},

				destroy: () => {
					console.log("[Youbora] Destroyed");
					// youbora.stopHandler();
				},
			};
		} catch (error) {
			console.error("[Analytics] Error creating Youbora plugin:", error);
			return null;
		}
	}

	// Registro de plugins
	static {
		this.registerPlugin("comscore", this.createComscorePlugin.bind(this));
		this.registerPlugin("adobe", this.createAdobePlugin.bind(this));
		this.registerPlugin("youbora", this.createYouboraPlugin.bind(this));
	}
}
```

## Mapeo de Datos

### Campos Comunes por Proveedor

#### ComScore Streaming Tag

```typescript
const comscoreFields = {
	// Campos básicos
	c3: "content_category", // Categoría del contenido
	c4: "content_title", // Título del contenido
	c6: "content_id", // ID único del contenido
	c12: "category", // Categoría secundaria

	// Campos de streaming
	ns_st_ci: "content_id", // Content ID
	ns_st_ep: "episode_name", // Nombre del episodio
	ns_st_pr: "program_name", // Nombre del programa
	ns_st_sn: "season_number", // Número de temporada
	ns_st_en: "episode_number", // Número de episodio
	ns_st_ge: "genre", // Género
	ns_st_cl: "content_length", // Duración en segundos
	ns_st_ty: "content_type", // 'live' o 'content'
};
```

#### Adobe Analytics

```typescript
const adobeFields = {
	videoName: "content_title",
	videoId: "content_id",
	videoLength: "duration_seconds",
	videoShow: "program_name",
	videoSeason: "season_number",
	videoEpisode: "episode_number",
	videoGenre: "genre",
	videoType: "content_type",

	// Variables personalizadas (eVar)
	customVar1: "custom_field_1",
	customVar2: "custom_field_2",
};
```

#### Youbora

```typescript
const youboraFields = {
	"content.id": "content_id",
	"content.title": "content_title",
	"content.duration": "duration_seconds",
	"content.isLive": true / false,
	"content.genre": "genre",
	"content.tvShow": "program_name",
	"content.season": "season_number",
	"content.episode": "episode_number",

	// Parámetros extra (hasta 10)
	"extraparam.1": "custom_field_1",
	"extraparam.2": "custom_field_2",
};
```

## Validación y Manejo de Errores

```typescript
export class YourProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
	// Sobrescribir validación específica del proyecto
	protected static validateMediaData(mediaData: YourMediaData): boolean {
		if (!super.validateMediaData(mediaData)) {
			return false;
		}

		// Validaciones específicas del proyecto
		if (!mediaData.title || mediaData.title.trim() === "") {
			console.warn("[Analytics] Media data missing title");
			return false;
		}

		if (!["live", "vod"].includes(mediaData.contentType)) {
			console.warn("[Analytics] Invalid content type:", mediaData.contentType);
			return false;
		}

		if (mediaData.contentType === "vod" && !mediaData.duration) {
			console.warn("[Analytics] VOD content missing duration");
			return false;
		}

		return true;
	}
}
```

## Configuración por Ambientes

```typescript
export class YourProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
	static getConfigForEnvironment(
		env: "dev" | "staging" | "prod"
	): AnalyticsFactoryConfig {
		const base = {
			plugins: {
				comscore: {
					enabled: true,
					config: {
						c2: env === "prod" ? "PROD_C2_ID" : "DEV_C2_ID",
					},
				},
				adobe: {
					enabled: true,
					config: {
						reportSuite: env === "prod" ? "prod-suite" : "dev-suite",
					},
				},
				youbora: {
					enabled: true,
					config: {
						accountCode: env === "prod" ? "PROD_ACCOUNT" : "DEV_ACCOUNT",
					},
				},
			},
		};

		switch (env) {
			case "dev":
				return {
					...base,
					plugins: {
						comscore: {
							enabled: true,
							debug: true,
							config: base.plugins.comscore.config,
						},
						adobe: { enabled: false }, // Deshabilitado en dev
						youbora: {
							enabled: true,
							debug: true,
							config: base.plugins.youbora.config,
						},
					},
					debug: true,
					environment: "dev",
				};

			case "staging":
				return {
					...base,
					debug: false,
					environment: "staging",
				};

			case "prod":
				return {
					...base,
					debug: false,
					environment: "prod",
				};

			default:
				return { ...base, environment: "prod" };
		}
	}
}
```
