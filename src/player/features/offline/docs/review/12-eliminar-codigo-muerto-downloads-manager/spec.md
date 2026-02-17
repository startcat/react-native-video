# Spec: Eliminar código muerto en DownloadsManager

> Especificación técnica | Tarea 12/19 | Fase C
> IDs auditoría: CI-003, CI-004, SA-12

## 1. Objetivo

Eliminar ~200 líneas de código muerto en `DownloadsManager.ts`: métodos que nunca se invocan porque la suscripción a DownloadService está deshabilitada (comentario en línea ~280). La lógica real de reintentos y coordinación ya está en QueueManager.

## 2. Métodos a eliminar

| Método                        | Líneas aprox. | Razón                                               |
| ----------------------------- | ------------- | --------------------------------------------------- |
| `handleDownloadEvent()`       | ~451-488      | Nunca invocado — suscripción deshabilitada          |
| `notifyQueueManagerOfEvent()` | ~496-600      | Solo llamado desde handleDownloadEvent              |
| `handleAutoRetry()`           | ~698-712      | TODO sin implementar, lógica real en QueueManager   |
| `enforceGlobalLimits()`       | ~714-730      | Stub sin implementar                                |
| `applyGlobalPolicies()`       | ~681-691      | Solo invoca a handleAutoRetry y enforceGlobalLimits |

## 3. Pre-condiciones (verificar con /verify)

- [ ] Confirmar que ningún método se llama fuera de su propia definición (grep exhaustivo)
- [ ] Confirmar que `applyGlobalPolicies()` solo invoca a los métodos eliminados
- [ ] Verificar si hay imports que quedarán sin usar tras la eliminación
- [ ] Tests de contrato pasando (baseline)

## 4. Contratos

### Contratos que NO cambian

- API pública de DownloadsManager (todos los métodos públicos)
- Comportamiento observable idéntico (métodos eliminados nunca se ejecutaban)

### Contratos que cambian

- Ninguno

## 5. Riesgos

| Riesgo                           | Probabilidad | Impacto | Mitigación                      |
| -------------------------------- | ------------ | ------- | ------------------------------- |
| Método no es realmente muerto    | Baja         | Alto    | grep exhaustivo + tsc --noEmit  |
| Import sin usar post-eliminación | Baja         | Bajo    | Verificar imports tras eliminar |

### Rollback

1. `git revert HEAD`

## 6. Complejidad estimada

- **Nivel**: Muy baja
- **Justificación**: Solo eliminación de código, sin cambios de lógica
- **Tiempo estimado**: 20-30 minutos

## 7. Preguntas resueltas por /verify

- [x] ¿`applyGlobalPolicies()` tiene lógica útil? → **NO** — solo invoca `handleAutoRetry()` y `enforceGlobalLimits()`, ambos stubs con TODOs
- [x] ¿Hay otros métodos privados que solo se llaman desde los eliminados? → **NO** — `notifyQueueManagerOfEvent()` solo se llama desde `handleDownloadEvent()`
- [x] ¿El comentario de suscripción deshabilitada (línea 280) debe eliminarse? → **NO** — el comentario documenta la arquitectura real (eventos fluyen NativeManager → QueueManager → DownloadsManager), es útil mantenerlo
- [x] ¿`handleDownloadEvent` se llama desde algún sitio? → **NO** — solo definición en línea 451, nunca invocado (suscripción deshabilitada en línea 280)

### Cadena de llamadas completa (toda muerta)

```
handleDownloadEvent() → notifyQueueManagerOfEvent()
                      → applyGlobalPolicies() → handleAutoRetry()
                                               → enforceGlobalLimits()
```

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
