/*
 * Hook para configuración de descargas
 *
 * Proporciona interfaz reactiva para gestionar la configuración dinámica de descargas
 * según especificación del contexto con integración directa al ConfigManager.
 *
 */

import { useCallback, useEffect, useState } from "react";
import { configManager } from "../managers/ConfigManager";
import { ConfigDownloads, ConfigEventCallback } from "../types";

export interface UseDownloadsConfigReturn {
  // Configuración actual
  config: ConfigDownloads;

  // Métodos de actualización específicos
  updateStreamQuality: (quality: "auto" | "low" | "medium" | "high" | "max") => void;
  updateNetworkPolicy: (policy: boolean) => void; // true = solo WiFi
  updateConcurrentLimit: (limit: number) => void;

  // Método de reset
  resetToDefaults: () => void;

  // Estado del manager
  isInitialized: boolean;
  error: string | null;
}

/*
 * Hook principal useDownloadsConfig
 *
 * Implementa la interfaz especificada en el contexto:
 *  - config: ConfigDownloads actual
 *  - updateStreamQuality: (quality) => void
 *  - updateNetworkPolicy: (policy) => void
 *  - updateConcurrentLimit: (limit) => void
 *  - resetToDefaults: () => void
 *
 */

export function useDownloadsConfig(): UseDownloadsConfigReturn {
  // Estados reactivos
  const [config, setConfig] = useState<ConfigDownloads>(() => configManager.getConfig());
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Inicialización del ConfigManager al montar el componente
  useEffect(() => {
    const initializeConfigManager = async () => {
      try {
        // Inicializar ConfigManager si no está inicializado
        await configManager.initialize({
          logEnabled: true,
          validateOnUpdate: true,
        });

        // Obtener configuración inicial tras inicialización
        const initialConfig = configManager.getConfig();
        setConfig(initialConfig);
        setIsInitialized(true);
        setError(null);
      } catch (err: any) {
        setError(err?.message || "Failed to initialize ConfigManager");
        setIsInitialized(false);
      }
    };

    initializeConfigManager();
  }, []);

  // Suscripción a eventos de configuración
  useEffect(() => {
    const handleConfigUpdate: ConfigEventCallback = updateEvent => {
      if (updateEvent?.config) {
        setConfig(updateEvent.config);
        setError(null); // Limpiar errores en actualizaciones exitosas
      }
    };

    const handleConfigReset: ConfigEventCallback = resetEvent => {
      if (resetEvent?.newConfig) {
        setConfig(resetEvent.newConfig);
        setError(null);
      }
    };

    const handleConfigValidationFailed: ConfigEventCallback = validationEvent => {
      if (validationEvent?.error) {
        const errorMsg = validationEvent.error.message || validationEvent.error.toString();
        setError(`Validation failed for ${validationEvent.property}: ${errorMsg}`);
      }
    };

    const handleConfigLoaded: ConfigEventCallback = loadEvent => {
      if (loadEvent?.config) {
        setConfig(loadEvent.config);
        setError(null);
      }
    };

    // Suscribirse a eventos del ConfigManager
    const unsubscribeUpdate = configManager.subscribe("config_updated", handleConfigUpdate);
    const unsubscribeReset = configManager.subscribe("config_reset", handleConfigReset);
    const unsubscribeValidationFailed = configManager.subscribe(
      "config_validation_failed",
      handleConfigValidationFailed
    );
    const unsubscribeLoaded = configManager.subscribe("config_loaded", handleConfigLoaded);

    return () => {
      // Cleanup: desuscribirse de todos los eventos
      unsubscribeUpdate();
      unsubscribeReset();
      unsubscribeValidationFailed();
      unsubscribeLoaded();
    };
  }, []);

  // Métodos de actualización específicos según contexto (síncronos)

  const updateStreamQuality = useCallback(
    (quality: "auto" | "low" | "medium" | "high" | "max"): void => {
      configManager.updateStreamQuality(quality).catch(err => {
        setError(err?.message || "Failed to update stream quality");
      });
    },
    []
  );

  const updateNetworkPolicy = useCallback((wifiOnly: boolean): void => {
    configManager.updateNetworkPolicy(wifiOnly).catch(err => {
      setError(err?.message || "Failed to update network policy");
    });
  }, []);

  const updateConcurrentLimit = useCallback((limit: number): void => {
    configManager.updateConcurrentLimit(limit).catch(err => {
      setError(err?.message || "Failed to update concurrent limit");
    });
  }, []);

  const resetToDefaults = useCallback((): void => {
    configManager.resetToDefaults().catch(err => {
      setError(err?.message || "Failed to reset to defaults");
    });
  }, []);

  return {
    // Configuración actual
    config,

    // Métodos de actualización específicos
    updateStreamQuality,
    updateNetworkPolicy,
    updateConcurrentLimit,

    // Método de reset
    resetToDefaults,

    // Estado del manager
    isInitialized,
    error,
  };
}

/*
 * Hook extendido con funcionalidades adicionales
 *
 * Proporciona más métodos de configuración y utilidades avanzadas
 * para casos de uso más complejos.
 *
 */

export interface UseDownloadsConfigExtendedReturn extends UseDownloadsConfigReturn {
  // Métodos adicionales de configuración
  updateAutoResume: (enabled: boolean) => Promise<void>;
  updateStorageThreshold: (threshold: number) => Promise<void>;
  updateRetryAttempts: (attempts: number) => Promise<void>;
  updateMinFreeSpace: (spaceMB: number) => Promise<void>;
  updateLogLevel: (level: "DEBUG" | "INFO" | "WARN" | "ERROR") => Promise<void>;

  // Actualización múltiple
  updateMultipleConfig: (updates: Partial<ConfigDownloads>) => Promise<void>;

  // Métodos de utilidad
  getDefaultConfig: () => ConfigDownloads;
  hasUnsavedChanges: boolean;
  isDifferentFromDefaults: boolean;

  // Control avanzado de eventos
  subscribeToConfigEvents: (callback: ConfigEventCallback) => () => void;
}

export function useDownloadsConfigExtended(): UseDownloadsConfigExtendedReturn {
  const baseHook = useDownloadsConfig();

  // Estado adicional
  const [defaultConfig] = useState<ConfigDownloads>(() => configManager.getConfig());

  // Métodos asíncronos adicionales
  const updateAutoResume = useCallback(async (enabled: boolean): Promise<void> => {
    await configManager.updateAutoResume(enabled);
  }, []);

  const updateStorageThreshold = useCallback(async (threshold: number): Promise<void> => {
    await configManager.updateStorageThreshold(threshold);
  }, []);

  const updateRetryAttempts = useCallback(async (attempts: number): Promise<void> => {
    await configManager.updateConfig("retry_attempts", attempts);
  }, []);

  const updateMinFreeSpace = useCallback(async (spaceMB: number): Promise<void> => {
    await configManager.updateConfig("min_free_space_mb", spaceMB);
  }, []);

  const updateLogLevel = useCallback(
    async (level: "DEBUG" | "INFO" | "WARN" | "ERROR"): Promise<void> => {
      // Mapear string a LogLevel enum
      const logLevelMap: Record<string, any> = {
        DEBUG: "DEBUG",
        INFO: "INFO",
        WARN: "WARN",
        ERROR: "ERROR",
      };
      await configManager.updateConfig("logLevel", logLevelMap[level]);
    },
    []
  );

  const updateMultipleConfig = useCallback(
    async (updates: Partial<ConfigDownloads>): Promise<void> => {
      await configManager.updateMultipleConfig(updates);
    },
    []
  );

  // Métodos de utilidad
  const getDefaultConfig = useCallback((): ConfigDownloads => {
    return configManager.getConfig();
  }, []);

  const subscribeToConfigEvents = useCallback((callback: ConfigEventCallback): (() => void) => {
    return configManager.subscribe("all", callback);
  }, []);

  // Cálculos derivados
  const hasUnsavedChanges = false; // ConfigManager persiste automáticamente
  const isDifferentFromDefaults = JSON.stringify(baseHook.config) !== JSON.stringify(defaultConfig);

  return {
    ...baseHook,

    // Métodos adicionales
    updateAutoResume,
    updateStorageThreshold,
    updateRetryAttempts,
    updateMinFreeSpace,
    updateLogLevel,
    updateMultipleConfig,

    // Métodos de utilidad
    getDefaultConfig,
    hasUnsavedChanges,
    isDifferentFromDefaults,
    subscribeToConfigEvents,
  };
}
