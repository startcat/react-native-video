# Tarea: Tests de contrato — ConfigManager

> Tarea 03 de 19 | Fase A: Red de seguridad
> Plan de refactorización de `src/player/features/offline/`

## Contexto

El `ConfigManager` (624 líneas) gestiona la configuración de descargas con persistencia, validación y eventos reactivos. Aunque es un fichero bien estructurado que no requiere segmentación, sus contratos deben estar capturados antes de que las tareas de Fase C (eliminación de código muerto) y Fase D (extracción de DownloadPolicyEngine) modifiquen cómo se consume la configuración.

**IDs de auditoría cubiertos**: REQ-015

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual del `ConfigManager` para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección **3.1.3 ConfigManager — Tests de contrato**. Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `managers/ConfigManager.ts` — métodos: `initialize()`, `getConfig()`, `updateConfig()`, `updateMultipleConfig()`, `updateStreamQuality()`, `updateNetworkPolicy()`, `updateConcurrentLimit()`, `resetToDefaults()`, `clearPersistedConfig()`, `subscribe()`

### Ficheros de test a crear

- `__tests__/offline/managers/ConfigManager.contract.test.ts`

### Fuera de alcance

- NO modificar código de producción
- NO testear la persistencia real (mockear PersistenceService)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|---|---|---|---|---|
| `initialize()` | Carga config por defecto si no hay persistida | Config persistida → la carga | — | — |
| `getConfig()` | Retorna config actual | — | — | — |
| `updateConfig()` | Actualiza propiedad, emite evento | Valor idéntico → no emite evento | Valor inválido → lanza error | Persiste con debounce |
| `updateMultipleConfig()` | Actualiza varias propiedades | — | Algún valor inválido → rechaza todo | — |
| `resetToDefaults()` | Restaura valores por defecto | — | — | Emite evento de reset |
| `subscribe()` | Recibe eventos, unsubscribe funciona | — | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas
- [ ] Los tests son independientes entre sí
- [ ] El comando `npx jest __tests__/offline/managers/ConfigManager.contract.test.ts` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- Todas las tareas de Fase B+ que lean configuración

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: el debounce de persistencia (500ms) puede causar tests flaky si no se usan fake timers
- **Mitigación**: usar `jest.useFakeTimers()` para controlar el debounce

## Estimación

1 hora

## Notas

- El ConfigManager usa `setTimeout` para debounce de persistencia. Usar `jest.useFakeTimers()` y `jest.advanceTimersByTime()` para testear la persistencia.
- La validación de valores (`validateConfigValue`) es lógica pura y fácil de testear exhaustivamente.
