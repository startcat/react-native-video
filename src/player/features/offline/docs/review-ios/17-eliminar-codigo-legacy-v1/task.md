# Tarea: Eliminar código legacy Downloads/ v1

> Tarea 17 de 20 | Fase E: Eliminación de complejidad y limpieza
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

El directorio `Downloads/` contiene el sistema de descargas v1 (~900 líneas): `Asset.swift`, `DownloadsModule.swift`, `DownloadsModule.m`, y `Managers/AssetDownloader.swift`. `DownloadsModule2` reimplementa toda la funcionalidad con mejoras (aggregate tasks, persistencia robusta, validación, purga). Mantener ambos módulos registrados en RN crea confusión y riesgo de conflicto en `ContentKeyManager` (NC-005, SA-02, SA-03).

**IDs de auditoría relacionados**: CI-002, SA-02, SA-11, NC-005

## Objetivo

Eliminar completamente el módulo de descargas v1 y `AssetDownloader`, tras verificar que ningún código JS lo referencia.

## Alcance

### Código afectado

- `ios/Downloads/Asset.swift` (114 líneas) — **eliminar**
- `ios/Downloads/DownloadsModule.swift` (344 líneas) — **eliminar**
- `ios/Downloads/DownloadsModule.m` (30 líneas) — **eliminar**
- `ios/Managers/AssetDownloader.swift` (411 líneas) — **eliminar**
- `ios/Downloads_v2/DownloadsModule2.swift` — eliminar métodos legacy: `setItem()`, `addItem()`, `removeItem()`, `getItem()`, `getList()`, `pause()`, `resume()`, `downloadLicense()` (legacy) (líneas 1129-1186)
- `ios/Downloads_v2/DownloadsModule2.m` — eliminar las macros `RCT_EXTERN_METHOD` correspondientes a los métodos legacy
- Verificar si `Asset.swift` se usa en `DownloadDRMManager` (extraído en tarea 15). Si sí, internalizar la creación de `AVURLAsset` en `DownloadDRMManager`.

### Fuera de alcance

- NO eliminar `ContentKeyManager` (se usa por v2 y por el player)
- NO eliminar `LogManager` (se evalúa en tarea 20)

## Requisitos funcionales

1. **[CI-002]**: Eliminar las ~900 líneas de código legacy v1
2. **[NC-005]**: Eliminar el riesgo de conflicto en `ContentKeyManager` al tener un solo módulo de descargas

## Requisitos técnicos

1. Verificar que ningún código TypeScript/JS referencia `NativeModules.DownloadsModule` (sin "2")
2. Eliminar ficheros v1 y `AssetDownloader`
3. Eliminar métodos legacy de `DownloadsModule2`
4. Actualizar `DownloadsModule2.m` para eliminar las macros de métodos legacy
5. Si `Asset.swift` se usa en `DownloadDRMManager.setupDRMForAsset()`, crear el `AVURLAsset` directamente sin depender de `Asset`

## Cambios de contrato

- **[REQ-037]**: Los métodos legacy v1 (`addItem`, `removeItem`, `getItem`, `getList`, `pause`, `resume`) dejan de existir en el bridge nativo. Si algún código JS los llama, recibirá error de "método no encontrado".
- **[CI-002]**: El módulo `DownloadsModule` (v1) deja de estar registrado en React Native.

## Criterios de aceptación

### Funcionales
- [ ] No existen ficheros en `ios/Downloads/`
- [ ] No existe `ios/Managers/AssetDownloader.swift`
- [ ] No existen métodos legacy en `DownloadsModule2`
- [ ] `grep -r "NativeModules.DownloadsModule[^2]" src/` no devuelve resultados
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅ (excepto tests de métodos legacy si los hubiera, que se eliminan)
- [ ] Descarga completa funciona con v2

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador
- [ ] Sin referencias huérfanas a ficheros eliminados

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — valida que las operaciones v2 siguen funcionando

### Tests nuevos a crear

- Ninguno — esta tarea elimina código, no añade funcionalidad.

## Dependencias

### Tareas previas requeridas
- Tarea 15 (DownloadDRMManager): DRM aislado en v2, no depende de `Asset.swift` de v1
- Tarea 16 (ContentKeyPersistence + FPSCertificateProvider): ContentKeyManager tiene dependencias claras

### Tareas que dependen de esta
- Tarea 20 (limpieza final)

## Riesgo

- **Nivel**: alto
- **Principal riesgo**: Algún flujo JS podría usar `NativeModules.DownloadsModule` (v1). Si es así, dejará de funcionar.
- **Mitigación**: Buscar exhaustivamente en el código TypeScript antes de eliminar. Si se encuentra alguna referencia, migrarla a v2 primero.
- **Rollback**: `git revert HEAD` — restaura todos los ficheros eliminados.

## Estimación

1-2 horas

## Notas

- **REQUIERE CONFIRMACIÓN DEL USUARIO** antes de ejecutar. Verificar con el usuario que v1 no se usa.
- El grep debe buscar tanto `DownloadsModule` como `NativeModules.DownloadsModule` para cubrir todos los patrones de uso.
- Si `Asset.swift` se usa en `setupDRMForAsset()` del `DownloadDRMManager`, la solución es crear el `AVURLAsset` directamente: `let asset = AVURLAsset(url: URL(string: uri)!, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])` y registrarlo como recipient en la content key session.
