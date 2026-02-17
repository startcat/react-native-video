# Especificación Técnica: Tests de contrato — ConfigManager

> Generado a partir de task.md el 2026-02-17

## Resumen

Tests de contrato que capturan el comportamiento actual del `ConfigManager` (624 líneas) — singleton que gestiona configuración de descargas con persistencia debounced, validación y eventos reactivos.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/ConfigManager.ts` — código bajo test (NO modificar)

**Indirectos:**

- `services/storage/PersistenceService.ts` — dependencia a mockear
- `types/config.ts` — tipos e interfaces usados en tests

### Dependencias a mockear

| Dependencia | Mock |
|---|---|
| `PersistenceService` | `loadDownloadsConfig`, `saveDownloadsConfig`, `clearDownloadsConfig` |

### Archivos a crear

- `__tests__/managers/ConfigManager.contract.test.ts`

## 2. API pública bajo test

### Métodos del ConfigManager

| Método | Firma | Descripción |
|---|---|---|
| `getInstance()` | `static: ConfigManager` | Singleton factory |
| `initialize(config?)` | `async (Partial<ConfigManagerConfig>) → void` | Inicializa con config opcional, carga persistida |
| `getConfig()` | `() → ConfigDownloads` | Retorna copia de config actual |
| `updateConfig(property, value)` | `async <K>(K, ConfigDownloads[K]) → void` | Actualiza propiedad, valida, emite evento |
| `updateMultipleConfig(updates)` | `async (Partial<ConfigDownloads>) → void` | Actualiza múltiples propiedades atómicamente |
| `updateStreamQuality(quality)` | `async (string) → void` | Convenience: actualiza streamQuality |
| `updateNetworkPolicy(wifiOnly)` | `async (boolean) → void` | Convenience: actualiza download_just_wifi |
| `updateConcurrentLimit(limit)` | `async (number) → void` | Convenience: actualiza max_concurrent_downloads |
| `updateAutoResume(enabled)` | `async (boolean) → void` | Convenience: actualiza auto_resume_on_network |
| `updateStorageThreshold(threshold)` | `async (number) → void` | Convenience: actualiza storage_warning_threshold |
| `resetToDefaults()` | `async () → void` | Restaura DEFAULT_CONFIG, persiste, emite config_reset |
| `clearPersistedConfig()` | `async () → void` | Limpia persistencia, resetea a defaults |
| `subscribe(event, callback)` | `(ConfigEventType \| "all", ConfigEventCallback) → () => void` | Suscribe a eventos, retorna unsubscribe |
| `getDefaultConfig()` | `static: ConfigDownloads` | Retorna copia de DEFAULT_CONFIG |
| `destroy()` | `() → void` | Limpia timers, listeners, resetea estado |

### Tipos clave

```typescript
interface ConfigDownloads {
  logEnabled: boolean;
  logLevel: LogLevel;
  download_just_wifi?: boolean;          // default: true
  max_concurrent_downloads?: number;     // default: 3, rango: 1-10
  activeProfileRequired: boolean;        // default: true
  auto_resume_on_network?: boolean;      // default: true
  streamQuality?: "auto" | "low" | "medium" | "high" | "max"; // default: "auto"
  storage_warning_threshold?: number;    // default: 0.85, rango: 0-1
  min_free_space_mb?: number;            // default: 200, rango: 0-10000
  retry_attempts?: number;               // default: 3, rango: 0-10
  retry_delay_ms?: number;               // default: 5000, rango: 1000-60000
}

interface ConfigManagerConfig {
  logEnabled: boolean;
  logLevel: LogLevel;
  validateOnUpdate?: boolean;  // default: true
}

type ConfigEventType = "config_updated" | "config_reset" | "config_loaded"
                     | "config_validation_failed" | "config_saved";
```

### Valores por defecto (DEFAULT_CONFIG en ConfigManager.ts L26-38)

```typescript
{
  logEnabled: true,
  logLevel: LogLevel.INFO,
  download_just_wifi: true,
  max_concurrent_downloads: 3,
  activeProfileRequired: true,
  auto_resume_on_network: true,
  streamQuality: "auto",
  storage_warning_threshold: 0.85,
  min_free_space_mb: 200,
  retry_attempts: 3,
  retry_delay_ms: 5000,
}
```

## 3. Matriz de cobertura de tests

### initialize (#1–#4)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 1 | Carga config por defecto si no hay persistida | normal | `getConfig()` retorna DEFAULT_CONFIG |
| 2 | Config persistida → la carga y mergea con defaults | normal | Mock `loadDownloadsConfig` retorna parcial, verifica merge |
| 3 | Idempotente: segunda llamada no falla | edge | Doble `initialize()` no lanza error |
| 4 | Aplica ConfigManagerConfig parcial | normal | `validateOnUpdate` se respeta |

### getConfig (#5–#6)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 5 | Retorna config actual | normal | Valores coinciden con defaults |
| 6 | Retorna copia (no referencia) | edge | Mutar resultado no afecta config interna |

### updateConfig (#7–#13)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 7 | Actualiza propiedad y emite evento | normal | `getConfig()` refleja cambio, callback recibe `ConfigUpdateEvent` |
| 8 | Valor idéntico → no emite evento | edge | Callback no se invoca |
| 9 | Valor inválido → lanza error (max_concurrent_downloads) | error | `rejects.toThrow()` con valor fuera de rango |
| 10 | Valor inválido → lanza error (storage_warning_threshold) | error | Threshold > 1 rechazado |
| 11 | Valor inválido → emite config_validation_failed | error | Callback de validación recibe evento |
| 12 | Sin inicializar → lanza error | error | `rejects.toThrow()` |
| 13 | Persiste tras actualizar (debounce) | normal | `saveDownloadsConfig` llamado tras `advanceTimersByTime(500)` |

### updateMultipleConfig (#14–#17)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 14 | Actualiza múltiples propiedades | normal | Todas las propiedades reflejadas en `getConfig()` |
| 15 | Emite evento con property="multiple" | normal | Callback recibe `property: "multiple"` |
| 16 | Sin cambios reales → no emite evento | edge | Callback no invocado |
| 17 | Algún valor inválido → rechaza todo (atómico) | error | Config no cambia si validación falla |

### Convenience methods (#18–#22)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 18 | updateStreamQuality delega a updateConfig | normal | `getConfig().streamQuality` actualizado |
| 19 | updateNetworkPolicy delega a updateConfig | normal | `getConfig().download_just_wifi` actualizado |
| 20 | updateConcurrentLimit delega a updateConfig | normal | `getConfig().max_concurrent_downloads` actualizado |
| 21 | updateAutoResume delega a updateConfig | normal | `getConfig().auto_resume_on_network` actualizado |
| 22 | updateStorageThreshold delega a updateConfig | normal | `getConfig().storage_warning_threshold` actualizado |

### resetToDefaults (#23–#25)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 23 | Restaura valores por defecto | normal | Config vuelve a DEFAULT_CONFIG |
| 24 | Emite evento config_reset | normal | Callback recibe `ConfigResetEvent` con oldConfig y newConfig |
| 25 | Sin inicializar → lanza error | error | `rejects.toThrow()` |

### clearPersistedConfig (#26–#28)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 26 | Llama a persistenceService.clearDownloadsConfig | normal | Mock verificado |
| 27 | Resetea config a defaults | normal | `getConfig()` retorna DEFAULT_CONFIG |
| 28 | Emite config_reset con reason="cleared_persistence" | normal | Callback recibe evento con reason |

### subscribe (#29–#32)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 29 | Retorna función de unsubscribe | normal | `typeof unsub === "function"` |
| 30 | Unsubscribe detiene notificaciones | normal | Callback no invocado tras unsubscribe |
| 31 | "all" suscribe a todos los eventos | normal | Callback recibe config_updated y config_reset |
| 32 | "all" unsubscribe limpia todos | normal | Callback no invocado tras unsubscribe de "all" |

### getDefaultConfig (#33)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 33 | Retorna copia de DEFAULT_CONFIG | normal | Valores coinciden, mutar no afecta |

### destroy (#34–#35)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 34 | Resetea estado y config | normal | `getConfig()` retorna defaults, isInitialized false |
| 35 | Limpia listeners sin error | normal | `destroy()` no lanza |

**Total: 35 tests**

## 4. Riesgos

### Debounce de persistencia

- `persistConfig()` usa `setTimeout` con 500ms de debounce
- **Mitigación**: usar `jest.useFakeTimers()` y `jest.advanceTimersByTime(500)` para controlar el timing
- **Nota**: el flag `pendingSave` puede causar que la segunda llamada a `persistConfig` sea no-op si la primera aún no ha completado

### Singleton pattern

- Requiere reset manual de `ConfigManager["instance"]` entre tests
- **Mitigación**: `beforeEach` con `@ts-expect-error` para resetear

### Validación condicional

- La validación solo se ejecuta si `config.validateOnUpdate === true` (default: true)
- Tests de validación deben asegurar que `validateOnUpdate` está habilitado

## 5. Estrategia de testing

### Setup

```typescript
jest.mock("../../services/storage/PersistenceService", () => ({
  persistenceService: {
    loadDownloadsConfig: jest.fn().mockResolvedValue(null),
    saveDownloadsConfig: jest.fn().mockResolvedValue(undefined),
    clearDownloadsConfig: jest.fn().mockResolvedValue(undefined),
  },
}));
```

### Singleton reset

```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  // @ts-expect-error -- reset singleton for testing
  ConfigManager["instance"] = undefined;
  manager = ConfigManager.getInstance();
  await manager.initialize({ logEnabled: false });
});

afterEach(() => {
  manager.destroy();
  jest.useRealTimers();
});
```

### Fake timers para debounce

Para tests que verifican persistencia:
```typescript
await manager.updateConfig("download_just_wifi", false);
jest.advanceTimersByTime(500); // Trigger debounce
await Promise.resolve(); // Flush microtasks
expect(mockedPersistence.saveDownloadsConfig).toHaveBeenCalled();
```

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: ConfigManager es un singleton bien estructurado con API clara. Solo 1 dependencia a mockear. La única complejidad es el debounce de persistencia.
- **Tiempo estimado**: 1 hora

## 7. Preguntas abiertas

### Técnicas

- [x] ¿El debounce `pendingSave` flag puede causar tests flaky? → Mitigado con fake timers
- [x] ¿`validateOnUpdate` está habilitado por defecto? → Sí, `DEFAULT_CONFIG_MANAGER.validateOnUpdate = true`
- [x] ¿Qué eventos emite `initialize`? → `config_loaded` con la config cargada

## Verificación

- [x] Spec generado
- [x] Preguntas resueltas
- [ ] Listo para plan
