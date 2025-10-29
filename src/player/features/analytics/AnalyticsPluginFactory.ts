/*
 *  PLANTILLA BASE - AnalyticsPluginFactory
 *
 *  Gestiona la creación de plugins de analytics en cada proyecto
 *  Debemos copiar la plantilla y adaptarla a los datos con los que trabajemos
 *
 *  NOTA:
 *      - Debemos tipar mediaData con el esquema del proyecto
 *      - Debemos implementar la función que mapee los campos al plugin (Ejemplos: mapMediaDataToComscoreMetadata y mapMediaDataToAdobeMetadata)
 *
 */

import {
	type AnalyticsFactoryConfig,
	type PlayerAnalyticsPlugin,
	type PluginConfig,
	type PluginCreator,
	type PluginRegistry,
} from "./types";

import { PlayerError } from "../../core/errors";

export abstract class BaseAnalyticsPluginFactory {
	protected static registry: PluginRegistry = {};

	protected static defaultConfig: AnalyticsFactoryConfig = {
		plugins: {},
		debug: false,
		environment: "prod",
	};

	// Registrar creadores de plugins
	static registerPlugin(name: string, creator: PluginCreator): void {
		this.registry[name] = creator;
		console.log(`[Analytics Factory] Registered plugin: ${name}`);
	}

	// Crear todos los plugins basado en configuración
	static createPlugins(
		mediaData: any,
		config: AnalyticsFactoryConfig = this.defaultConfig
	): PlayerAnalyticsPlugin[] {
		const plugins: PlayerAnalyticsPlugin[] = [];

		Object.entries(config.plugins).forEach(([pluginName, pluginConfig]) => {
			if (!pluginConfig.enabled) {
				if (config.debug) {
					console.log(`[Analytics Factory] Plugin ${pluginName} is disabled`);
				}
				return;
			}

			const plugin = this.createPlugin(pluginName, mediaData, pluginConfig, config.debug);

			if (plugin) {
				plugins.push(plugin);
			}
		});

		if (config.debug) {
			console.log(
				`[Analytics Factory] Created ${plugins.length} plugins:`,
				plugins.map(p => `${p.name} v${p.version}`)
			);
		}

		return plugins;
	}

	// Crear un plugin específico
	static createPlugin(
		pluginName: string,
		mediaData: any,
		pluginConfig: PluginConfig,
		debug: boolean = false
	): PlayerAnalyticsPlugin | null {
		const creator = this.registry[pluginName];

		if (!creator) {
			console.warn(`[Analytics Factory] Plugin creator not found: ${pluginName}`);
			return null;
		}

		try {
			const plugin = creator(mediaData, pluginConfig.config);

			if (plugin) {
				if (debug) {
					console.log(
						`[Analytics Factory] Created plugin: ${plugin.name} v${plugin.version}`
					);
				}
				return plugin;
			} else {
				console.warn(`[Analytics Factory] Plugin creator returned null: ${pluginName}`);
				return null;
			}
		} catch (error) {
			console.error(`[Analytics Factory] Error creating plugin ${pluginName}:`, error);
			throw new PlayerError("PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED", {
				pluginName,
				originalError: error,
			});
		}
	}

	// Utilidades para mapeo de datos (para extender en cada proyecto)
	protected static mapMediaDataToComscoreMetadata(mediaData: any): any {
		// SOBRESCRIBIR en cada proyecto con su mapeo específico
		throw new Error(
			"mapMediaDataToComscoreMetadata must be implemented in project-specific factory"
		);
	}

	protected static mapMediaDataToAdobeMetadata(mediaData: any): any {
		// SOBRESCRIBIR en cada proyecto con su mapeo específico
		throw new Error(
			"mapMediaDataToAdobeMetadata must be implemented in project-specific factory"
		);
	}

	// Método helper para validar datos de media
	protected static validateMediaData(mediaData: any): boolean {
		if (!mediaData) {
			console.warn("[Analytics Factory] Media data is null or undefined");
			return false;
		}

		// Validaciones básicas - personalizar en cada proyecto
		if (!mediaData.id && !mediaData.contentId) {
			console.warn("[Analytics Factory] Media data missing ID field");
			return false;
		}

		return true;
	}

	// Configuraciones predefinidas por entorno
	static getConfigForEnvironment(env: "dev" | "staging" | "prod"): AnalyticsFactoryConfig {
		const base = {
			plugins: {
				comscore: { enabled: true },
				adobe: { enabled: true },
			},
		};

		switch (env) {
			case "dev":
				return {
					...base,
					plugins: {
						comscore: { enabled: true, debug: true },
						adobe: { enabled: false }, // Solo ComScore en dev
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
