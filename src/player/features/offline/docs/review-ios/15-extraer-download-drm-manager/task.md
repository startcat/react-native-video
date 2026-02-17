# Tarea: Extraer DownloadDRMManager.swift

> Tarea 15 de 20 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene ~100 líneas de lógica de DRM para descargas: configuración de DRM para assets, descarga/verificación/renovación/liberación de licencias. Varios de estos métodos son stubs que resuelven sin hacer nada (SA-04, CI-008). Extraerlos a un manager dedicado permite identificar claramente qué está implementado y qué no.

**IDs de auditoría relacionados**: SA-01, SA-04, REQ-028, CI-008, NC-012

## Objetivo

Extraer la lógica de DRM para descargas a `DownloadDRMManager.swift`, haciendo explícito qué métodos son stubs y cuáles tienen implementación real.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `setupDRMForAsset()` (líneas 1563-1595), `downloadLicense()` (líneas 927-942), `checkLicense()` (líneas 944-958), `renewLicense()` (línea 961), `releaseLicense()` (líneas 966-969), `releaseAllLicenses()` (líneas 971-974), `downloadLicenseForContent()` (línea 1869), `checkLicenseValidity()` (línea 1873), `releaseLicenseForDownload()` (línea 1865)
- `ios/Downloads_v2/DownloadDRMManager.swift` — **nuevo fichero**

### Fuera de alcance

- NO implementar los métodos stub en esta tarea (solo moverlos)
- NO refactorizar `ContentKeyManager` (tarea 19)
- NO cambiar la API pública de `DownloadsModule2` hacia React Native

## Requisitos funcionales

1. **[REQ-028]**: Configurar DRM para descarga (setupDRMForAsset)
2. **[CI-008]**: Hacer explícitos los métodos stub marcándolos con `// STUB: Not implemented`

## Requisitos técnicos

1. Clase `DownloadDRMManager` en `ios/Downloads_v2/`
2. Interfaz pública según sección A8 de `02-propuesta-segmentacion.md`
3. Depende de `ContentKeyManager` (singleton existente)
4. Los métodos stub se marcan con comentario `// STUB: Not implemented — resolve without action`
5. `DownloadsModule2` crea instancia y delega

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después (incluyendo los stubs que resuelven sin hacer nada).

## Criterios de aceptación

### Funcionales
- [ ] Toda la lógica DRM de descargas está en `DownloadDRMManager`
- [ ] Los métodos stub están claramente marcados
- [ ] `setupDRMForAsset()` sigue configurando `ContentKeyManager` correctamente
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: setupDRM con config válida, métodos stub resuelven sin error

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/ContentKeyPersistenceTests.swift` — valida persistencia de claves DRM

### Tests nuevos a crear

- `ios/Tests/DownloadDRMManagerTests.swift`:
  - `testRenewLicense_stub_resolvesNil`: Verifica que el stub resuelve sin error
  - `testReleaseAllLicenses_stub_resolvesNil`: Verifica que el stub resuelve sin error
  - `testCheckLicenseValidity_stub_returnsTrue`: Verifica que siempre devuelve true
  - `testSetupDRM_configuresContentKeyManager`: Verifica que CKM recibe los parámetros correctos (mock)

## Dependencias

### Tareas previas requeridas
- Tarea 05 (DownloadTypes): necesita tipos base

### Tareas que dependen de esta
- Tarea 17 (eliminar legacy): la eliminación de v1 requiere que DRM esté aislado en v2

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: `setupDRMForAsset()` configura el singleton `ContentKeyManager` con URLs y asset. Si la extracción cambia el timing de esta configuración, puede afectar la obtención de claves.
- **Mitigación**: Mover la función tal cual, sin cambiar el orden de operaciones. Verificar con descarga DRM real.
- **Rollback**: `git revert HEAD`

## Estimación

1.5-2 horas

## Notas

- Los métodos stub (renewLicense, releaseAllLicenses, checkLicenseValidity, etc.) se mueven tal cual. La decisión de implementarlos o eliminarlos del bridge se toma en la tarea 18.
- `setupDRMForAsset()` crea un `Asset` (de `Downloads/Asset.swift`) solo para registrarlo como recipient en la content key session. Si se elimina v1 (tarea 17), habrá que verificar si `Asset.swift` sigue siendo necesario o si se puede crear el AVURLAsset directamente.
