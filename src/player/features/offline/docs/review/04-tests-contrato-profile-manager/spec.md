# Especificación Técnica: Tests de contrato — ProfileManager

> Generado a partir de task.md el 2026-02-17

## Resumen

Tests de contrato que capturan el comportamiento actual del `ProfileManager` (321 líneas) — singleton que gestiona el perfil activo y filtrado de descargas por perfil. Sin dependencias externas a mockear.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/ProfileManager.ts` — código bajo test (NO modificar)

**Indirectos:**

- `types/profiles.ts` — tipos e interfaces usados en tests
- `types/download.ts` — `DownloadItem`, `DownloadStates`, `DownloadType`

### Dependencias a mockear

Ninguna. ProfileManager no tiene dependencias externas.

### Archivos a crear

- `__tests__/managers/ProfileManager.contract.test.ts`

## 2. API pública bajo test

| Método | Firma | Descripción |
|---|---|---|
| `getInstance()` | `static: ProfileManager` | Singleton factory |
| `initialize(config?)` | `async (Partial<ProfileManagerConfig>) → void` | Inicializa con config opcional |
| `setActiveProfile(profile)` | `(ProfileContext \| null) → void` | Establece perfil activo, emite evento |
| `getActiveProfile()` | `() → ProfileContext \| null` | Retorna copia del perfil activo |
| `hasActiveProfile()` | `() → boolean` | true si hay perfil activo |
| `getActiveProfileId()` | `() → string \| null` | ID del perfil activo |
| `isChildProfile()` | `() → boolean` | true si perfil activo es infantil |
| `shouldShowContent(item)` | `(DownloadItem) → boolean` | Filtrado por perfil |
| `canDownload()` | `() → boolean` | Puede descargar según reglas de perfil |
| `canDownloadContent(item)` | `(DownloadItem) → boolean` | canDownload + shouldShowContent |
| `filterByActiveProfile(items)` | `(DownloadItem[]) → DownloadItem[]` | Filtra array por perfil |
| `subscribe(event, callback)` | `(ProfileEventType \| "all", callback) → () => void` | Suscribe a eventos |
| `setProfileFiltering(enabled)` | `(boolean) → void` | Habilita/deshabilita filtrado |
| `setActiveProfileRequired(required)` | `(boolean) → void` | Requiere perfil para descargar |
| `getContextStats()` | `() → object` | Estadísticas del contexto |
| `destroy()` | `() → void` | Limpia recursos |

### Tipos clave

```typescript
interface ProfileContext {
  id: string;
  name: string;
  isChild: boolean;
}

enum ProfileEventType {
  PROFILE_CHANGED = "profile_changed",
  FILTERING_CHANGED = "filtering_changed",
  CONFIG_CHANGED = "config_changed",
}

interface ProfileManagerConfig {
  logEnabled: boolean;
  logLevel: LogLevel;
  enableProfileFiltering: boolean;   // default: true
  activeProfileRequired: boolean;    // default: true
}
```

## 3. Matriz de cobertura de tests

### initialize (#1–#2)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 1 | Inicializa sin perfil activo | normal | `hasActiveProfile()` false, `getActiveProfileId()` null |
| 2 | Idempotente | edge | Segunda llamada no falla |

### setActiveProfile / getActiveProfile (#3–#7)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 3 | Establece y obtiene perfil | normal | `hasActiveProfile()` true, datos correctos |
| 4 | null → limpia perfil | edge | `hasActiveProfile()` false |
| 5 | Emite PROFILE_CHANGED al cambiar | normal | Callback con previous y current |
| 6 | No emite si mismo ID | edge | Callback no invocado |
| 7 | getActiveProfile retorna copia | edge | Mutar no afecta interno |

### hasActiveProfile / getActiveProfileId / isChildProfile (#8–#11)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 8 | hasActiveProfile true/false | normal | Refleja estado |
| 9 | getActiveProfileId retorna ID o null | normal | Correcto en ambos casos |
| 10 | isChildProfile true para perfil infantil | normal | `isChild: true` → true |
| 11 | isChildProfile false sin perfil | edge | Sin perfil → false |

### shouldShowContent (#12–#16)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 12 | profileIds vacío → visible para todos | normal | true |
| 13 | profileIds con perfil activo → visible | normal | true |
| 14 | profileIds sin perfil activo → no visible | normal | false |
| 15 | Sin perfil activo + profileIds no vacío → false | edge | false |
| 16 | Filtrado desactivado → siempre true | edge | true independiente de profileIds |

### canDownload / canDownloadContent (#17–#21)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 17 | canDownload true con perfil activo | normal | true |
| 18 | canDownload false si requiere perfil y no hay | normal | false |
| 19 | canDownload true si no requiere perfil | edge | true sin perfil |
| 20 | canDownloadContent combina canDownload + shouldShowContent | normal | Verifica ambas condiciones |
| 21 | canDownload sin inicializar → error | error | throws |

### filterByActiveProfile (#22–#24)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 22 | Filtra items por perfil activo | normal | Solo items del perfil |
| 23 | Array vacío → array vacío | edge | [] |
| 24 | Filtrado desactivado → retorna todo | edge | Mismo array |

### setProfileFiltering / setActiveProfileRequired (#25–#27)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 25 | setProfileFiltering emite FILTERING_CHANGED | normal | Callback con { enabled } |
| 26 | setActiveProfileRequired emite CONFIG_CHANGED | normal | Callback con { activeProfileRequired } |
| 27 | setActiveProfileRequired cambia comportamiento canDownload | normal | Efecto verificado |

### subscribe (#28–#30)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 28 | Retorna unsubscribe | normal | typeof function |
| 29 | Unsubscribe detiene notificaciones | normal | Callback no invocado |
| 30 | "all" suscribe a todos los eventos | normal | Recibe múltiples tipos |

### getContextStats / destroy (#31–#33)

| # | Caso | Tipo | Qué verificar |
|---|---|---|---|
| 31 | getContextStats retorna datos correctos | normal | Todas las propiedades |
| 32 | destroy limpia perfil y estado | normal | hasActiveProfile false |
| 33 | destroy no lanza error | normal | No throw |

**Total: 33 tests**

## 4. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Sin dependencias externas, lógica pura y determinista
- **Tiempo estimado**: 45 minutos
