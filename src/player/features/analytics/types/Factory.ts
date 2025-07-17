import { type PlayerAnalyticsPlugin } from './Plugin';

// Interfaz base para configuración de plugins
export interface PluginConfig {
    enabled: boolean;
    debug?: boolean;
    config?: any; // Configuración específica del plugin
}
  
// Interfaz para el registry de plugins
export interface PluginRegistry {
    [key: string]: PluginCreator;
}
  
// Tipo para funciones que crean plugins
export type PluginCreator = (mediaData: any, config?: any) => PlayerAnalyticsPlugin | null;
  
// Configuración base del factory
export interface AnalyticsFactoryConfig {
    plugins: { [pluginName: string]: PluginConfig };
    debug?: boolean;
    environment?: 'dev' | 'staging' | 'prod';
}
