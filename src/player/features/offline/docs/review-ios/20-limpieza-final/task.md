# Tarea: Limpieza final

> Tarea 20 de 20 | Fase E: Eliminación de complejidad y limpieza
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

Tras completar todas las extracciones, correcciones y eliminaciones, quedan varios items menores de limpieza identificados en la auditoría: simplificar `LogManager` (CI-003), hacer configurable la modificación Axinom (CI-006), extraer la estimación de 500MB a constante (CI-007), corregir valores hardcodeados restantes (SA-13), y limpiar catch vacíos restantes (SA-14).

**IDs de auditoría relacionados**: CI-003, CI-006, CI-007, SA-10, SA-13, SA-14

## Objetivo

Realizar la limpieza final del código: simplificar LogManager, hacer configurable la respuesta DRM Axinom, reemplazar valores hardcodeados por constantes, y limpiar catch vacíos restantes.

## Alcance

### Código afectado

- `ios/Extensions + Utils/LogManager.swift` — eliminar dependencia de `UITextView`, mantener solo logging a consola (CI-003, SA-10)
- `ios/Video/Features/RCTVideoDRM.swift` — hacer configurable el decode base64 de respuesta DRM (CI-006)
- `ios/Downloads_v2/DownloadsModule2.swift` — reemplazar valores hardcodeados restantes por constantes de `DownloadConstants` (CI-007, SA-13)
- `ios/Downloads_v2/DownloadsModule2.swift` — reemplazar catch vacíos restantes por logging (SA-14)

### Fuera de alcance

- NO hacer cambios funcionales significativos
- NO añadir funcionalidad nueva

## Requisitos funcionales

1. **[CI-003]**: `LogManager` no depende de UIKit
2. **[CI-006]**: La respuesta DRM puede ser base64 o raw, configurable
3. **[CI-007]**: La estimación de 500MB usa `DownloadConstants.DEFAULT_ESTIMATED_SIZE`
4. **[SA-14]**: Los catch vacíos loguean el error

## Requisitos técnicos

1. `LogManager`: eliminar `import UIKit`, eliminar propiedad `textView`, mantener `log()` con `print()`/`RCTLog`
2. `RCTVideoDRM`: añadir parámetro `base64EncodedResponse: Bool` (default: `false` para compatibilidad Axinom)
3. Valores hardcodeados: usar constantes de `DownloadConstants` definidas en tarea 05
4. Catch vacíos: añadir `RCTLog("Warning: ...")` en cada catch vacío restante

## Cambios de contrato

- **[CI-003]**: Si algún código asigna `LogManager.singletonInstance.textView`, dejará de compilar. Verificar que no se usa.
- **[CI-006]**: El comportamiento por defecto no cambia (sin base64 decode, compatible con Axinom).

## Criterios de aceptación

### Funcionales
- [ ] `LogManager` no importa UIKit
- [ ] `RCTVideoDRM` tiene parámetro configurable para base64
- [ ] No quedan valores hardcodeados sin constante nombrada en `DownloadsModule2`
- [ ] No quedan catch vacíos sin logging
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador
- [ ] `DownloadsModule2.swift` tiene ≤800 líneas

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- Todos los tests de Fase A deben seguir en verde

### Tests nuevos a crear

- Ninguno significativo — son cambios de limpieza.

## Dependencias

### Tareas previas requeridas
- Tarea 17 (eliminar legacy)
- Tarea 18 (eliminar duplicación)
- Tarea 19 (refactorizar ContentKeyManager)

### Tareas que dependen de esta
- Ninguna — esta es la última tarea del plan.

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Eliminar `UITextView` de `LogManager` puede romper alguna pantalla de debug
- **Mitigación**: Verificar que `LogManager.singletonInstance.textView` no se asigna en ningún lugar del proyecto
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1.5 horas

## Notas

- Esta tarea es la "escoba" final. Cada item es pequeño e independiente. Si alguno causa problemas, se puede omitir y documentar como deuda técnica.
- Verificar las métricas de éxito del plan maestro al completar esta tarea:
  - [ ] Ningún fichero supera 800 líneas
  - [ ] No hay dependencias circulares
  - [ ] Los code smells SA-01 a SA-17 están resueltos o documentados
  - [ ] NC-001 y NC-006 (críticos) están resueltos
  - [ ] CI-001 a CI-008 de prioridad alta están eliminados
