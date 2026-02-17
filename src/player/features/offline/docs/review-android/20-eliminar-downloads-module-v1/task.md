# Tarea: Eliminar DownloadsModule v1

> Tarea 20 de 22 | Fase F: Eliminación y consolidación
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule.java` (1149 líneas) es una versión legacy del módulo de descargas que duplica funcionalidad de `DownloadsModule2.java`. La auditoría documenta 11 funcionalidades duplicadas (SA-05) y lo identifica como complejidad innecesaria (CI-001). Ambos módulos están registrados simultáneamente en `ReactVideoPackage.java`, obligando a mantener fixes en dos sitios.

**IDs de auditoría relacionados**: CI-001, CI-003, NC-001, NC-013

## Objetivo

Eliminar `DownloadsModule.java` completamente y actualizar `ReactVideoPackage.java` para que solo registre `DownloadsModule2`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule.java` — **eliminar fichero completo**
- `android/src/main/java/com/brentvatne/react/ReactVideoPackage.java` (línea ~34) — eliminar `new DownloadsModule(reactContext)`
- Código JS/TS — migrar cualquier referencia a `NativeModules.Downloads` → `NativeModules.Downloads2`

### Fuera de alcance

- NO modificar `DownloadsModule2.java` (ya refactorizado en tareas 05-08)
- NO renombrar `DownloadsModule2` a `DownloadsModule` (cambio de nombre del módulo RN afectaría a JS)

## Requisitos funcionales

1. **[CI-001]**: Solo existe un módulo de descargas (`DownloadsModule2`)
2. **[NC-001]**: La race condition de `currentMediaItem` estático desaparece con la eliminación
3. **[NC-013]**: La falta de validación de ID duplicado desaparece con la eliminación

## Requisitos técnicos

1. Eliminar `DownloadsModule.java`
2. Actualizar `ReactVideoPackage.java`
3. Buscar y migrar referencias JS/TS a `NativeModules.Downloads` (sin "2")

## Cambios de contrato

- **[CI-001]**: El módulo RN `"Downloads"` (sin "2") deja de existir. Código JS que lo referencia dejará de funcionar. Migrar a `"Downloads2"`.

## Criterios de aceptación

### Funcionales
- [ ] `DownloadsModule.java` no existe
- [ ] `ReactVideoPackage.java` no registra `DownloadsModule`
- [ ] No hay referencias a `NativeModules.Downloads` (sin "2") en código JS/TS
- [ ] El flujo completo de descarga offline funciona desde JS usando `Downloads2`

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Los tests de contrato que referenciaban lógica de `DownloadsModule` siguen pasando (la lógica ahora está en las clases extraídas)

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DownloadErrorClassifierTest.java` — la lógica de `getDownloadStateAsString()` (CI-003) ya está en `DownloadErrorClassifier`
- `DownloadStatsCalculatorTest.java`
- `DownloadTrackSelectorTest.java`
- `DrmLicenseQueueTest.java`

### Tests nuevos a crear

- Ninguno (la eliminación no requiere tests nuevos)

## Dependencias

### Tareas previas requeridas
- Tarea 05: DownloadErrorClassifier extraído
- Tarea 06: DownloadStatsCalculator extraído
- Tarea 07: DownloadTrackSelector extraído
- Tarea 08: DrmLicenseQueue extraído

### Tareas que dependen de esta
- Tarea 22: Limpieza final

## Riesgo

- **Nivel**: medio-alto
- **Principal riesgo**: código JS que referencia `NativeModules.Downloads` dejará de funcionar
- **Mitigación**: **ANTES de ejecutar**, buscar exhaustivamente `"Downloads"` (sin "2") en todo el código JS/TS del proyecto. Si se encuentra, migrar primero.
- **Rollback**: `git revert HEAD` (restaura el fichero y el registro en ReactVideoPackage)

## Estimación

1-2 horas

## Notas

- **CRÍTICO**: Ejecutar `grep -r "NativeModules.Downloads[^2]" src/` y `grep -r '"Downloads"' src/` ANTES de eliminar. Si hay resultados, migrar primero.
- La eliminación resuelve automáticamente NC-001 (race condition en `currentMediaItem` estático) y NC-013 (descarga con ID duplicado), ya que ambos problemas solo existían en `DownloadsModule.java`.
- CI-003 (`getDownloadStateAsString()` con if-else chain) se elimina automáticamente con el fichero.
