# Tarea: Extraer DownloadPolicyEngine

> Tarea 17 de 19 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-04) que el DownloadsManager (1630 líneas) concentra la evaluación y aplicación de políticas globales (red, espacio, configuración, perfiles) mezclada con la orquestación de servicios. Los handlers de eventos de red, almacenamiento y configuración contienen lógica de decisión ("si WiFi-only y no hay WiFi → pausar todo") que puede extraerse a una clase dedicada.

**IDs de auditoría relacionados**: SA-04, REQ-011, REQ-012, REQ-013

## Objetivo

Extraer la lógica de evaluación de políticas del DownloadsManager a una clase independiente `DownloadPolicyEngine` que retorne acciones a ejecutar en lugar de ejecutarlas directamente.

## Alcance

### Código afectado

- `managers/policies/DownloadPolicyEngine.ts` — **CREAR**: nueva clase con evaluación de políticas de red, espacio y configuración
- `managers/DownloadsManager.ts` — **MODIFICAR**: reemplazar lógica inline de políticas en `setupGlobalPolicies()` (líneas 307-341), `handleNetworkEvent()` (líneas 607-647), `handleStorageEvent()` (líneas 654-674), `handleConfigEvent()` (líneas 365-427) por delegación a `this.policyEngine.*`

### Fuera de alcance

- NO modificar NetworkService, StorageService ni ConfigManager
- NO cambiar cuándo se pausan/reanudan las descargas (solo mover la decisión)
- NO modificar QueueManager

## Requisitos funcionales

1. **[REQ-011]**: Política WiFi-only evaluada correctamente
2. **[REQ-012]**: Pausa automática sin conectividad
3. **[REQ-013]**: Pausa automática por espacio bajo

## Requisitos técnicos

1. Clase independiente (no singleton)
2. Interfaz pública:
```typescript
export class DownloadPolicyEngine {
  constructor(deps: PolicyDependencies, logger: Logger);
  evaluateNetworkChange(isConnected: boolean, isWifi: boolean): PolicyAction;
  evaluateStorageChange(isLowSpace: boolean, isCritical: boolean): PolicyAction;
  evaluateConfigChange(property: string, newValue: unknown): PolicyAction;
  async validateBeforeDownload(type: DownloadType): Promise<void>;
}

export type PolicyAction = 'pause_all' | 'resume_all' | 'restart_queue' | 'update_services' | 'none';

export interface PolicyDependencies {
  getConfig: () => ConfigDownloads;
  isNetworkAvailable: () => boolean;
  isWifiConnected: () => boolean;
  isLowSpace: () => boolean;
}
```
3. Los métodos `evaluate*` retornan una `PolicyAction`. El DownloadsManager ejecuta la acción.
4. `validateBeforeDownload` lanza `PlayerError` si las políticas no permiten la descarga.

## Cambios de contrato

- **Ninguno** — el comportamiento observable (cuándo se pausa/reanuda) debe ser idéntico.

## Criterios de aceptación

### Funcionales
- [ ] Cambio de red de WiFi a celular con WiFi-only → `pause_all`
- [ ] Cambio de red de celular a WiFi con WiFi-only → `resume_all`
- [ ] Espacio bajo crítico → `pause_all`
- [ ] Cambio de config `download_just_wifi` → `update_services`
- [ ] La lógica de políticas ya no está inline en los handlers del DownloadsManager

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos del DownloadPolicyEngine cubren cada combinación de estado

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/DownloadsManager.contract.test.ts`

### Tests nuevos a crear

- `__tests__/offline/managers/policies/DownloadPolicyEngine.test.ts`:
  - Test 1: WiFi → celular con WiFi-only → `pause_all`
  - Test 2: celular → WiFi con WiFi-only → `resume_all`
  - Test 3: online → offline → `pause_all`
  - Test 4: offline → online (WiFi) → `resume_all`
  - Test 5: espacio bajo no crítico → `none`
  - Test 6: espacio bajo crítico → `pause_all`
  - Test 7: config `download_just_wifi` cambia a true → `update_services`
  - Test 8: config `max_concurrent_downloads` cambia → `restart_queue`
  - Test 9: `validateBeforeDownload` sin red → lanza error
  - Test 10: `validateBeforeDownload` con WiFi-only y sin WiFi → lanza error
  - Test 11 — caso límite: red disponible pero WiFi-only desactivado → `none`

## Dependencias

### Tareas previas requeridas
- Tarea 02 (Fase A): tests de contrato de DownloadsManager deben estar en verde

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: que la separación entre "evaluar" y "ejecutar" introduzca un gap temporal donde el estado cambia entre la evaluación y la ejecución
- **Mitigación**: el DownloadsManager evalúa y ejecuta síncronamente en el mismo handler de evento. No hay gap.
- **Rollback**: `git revert HEAD`

## Estimación

1–2 horas

## Notas

- El PolicyEngine NO ejecuta acciones. Solo las evalúa y retorna. El DownloadsManager es quien ejecuta `pauseAll()`, `resumeAll()`, etc.
- Esto facilita el testing: se puede testear el engine con inputs puros sin mockear servicios.
- La propagación de políticas a servicios (ej: `binaryDownloadService.setNetworkPolicy()`) sigue siendo responsabilidad del DownloadsManager.
