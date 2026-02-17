# Tarea: Tests de contrato — ProfileManager

> Tarea 04 de 19 | Fase A: Red de seguridad
> Plan de refactorización de `src/player/features/offline/`

## Contexto

El `ProfileManager` (321 líneas) gestiona el perfil activo y el filtrado de descargas por perfil. Aunque es compacto y bien enfocado, su contrato de filtrado (`shouldShowContent`, `canDownload`, `filterByActiveProfile`) es crítico para la correcta visualización de descargas en la UI. La tarea 17 (extracción de DownloadPolicyEngine) consumirá estos contratos.

**IDs de auditoría cubiertos**: REQ-014

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual del `ProfileManager` para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección **3.1.4 ProfileManager — Tests de contrato**. Usar ese código como punto de partida.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `managers/ProfileManager.ts` — métodos: `initialize()`, `setActiveProfile()`, `getActiveProfile()`, `hasActiveProfile()`, `getActiveProfileId()`, `isChildProfile()`, `shouldShowContent()`, `canDownload()`, `canDownloadContent()`, `filterByActiveProfile()`, `setProfileFiltering()`, `setActiveProfileRequired()`, `subscribe()`

### Ficheros de test a crear

- `__tests__/offline/managers/ProfileManager.contract.test.ts`

### Fuera de alcance

- NO modificar código de producción
- NO testear integración con DownloadsManager

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|---|---|---|---|---|
| `setActiveProfile()` | Establece perfil, emite evento | null → limpia perfil | — | — |
| `getActiveProfile()` | Retorna perfil activo | Sin perfil → null | — | — |
| `hasActiveProfile()` | true con perfil, false sin | — | — | — |
| `shouldShowContent()` | profileIds vacío → visible para todos | profileIds con perfil activo → visible | profileIds sin perfil activo → no visible | Filtrado desactivado → siempre visible |
| `canDownload()` | true con perfil activo | false si se requiere perfil y no hay | — | — |
| `filterByActiveProfile()` | Filtra array de items por perfil | Array vacío → array vacío | — | — |
| `subscribe()` | Recibe eventos, unsubscribe funciona | — | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas
- [ ] Los tests son independientes entre sí
- [ ] El comando `npx jest __tests__/offline/managers/ProfileManager.contract.test.ts` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- 17 (DownloadPolicyEngine consume ProfileManager)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: mínimo. ProfileManager no tiene dependencias externas significativas.
- **Mitigación**: —

## Estimación

1 hora

## Notas

- ProfileManager es el manager más simple del sistema. No tiene dependencias externas (no usa PersistenceService, NetworkService, etc.).
- La lógica de filtrado es pura y determinista, ideal para tests unitarios exhaustivos.
