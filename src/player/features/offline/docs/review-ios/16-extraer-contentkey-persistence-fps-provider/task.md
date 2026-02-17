# Tarea: Extraer ContentKeyPersistence + FPSCertificateProvider

> Tarea 16 de 20 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`ContentKeyManager.swift` (772 líneas) mezcla tres responsabilidades: delegado de `AVContentKeySession`, persistencia de claves en disco, y obtención de certificados FPS por red. Extraer las dos últimas a clases dedicadas reduce el singleton a ~350-400 líneas y prepara la refactorización de la tarea 19. Además, `requestContentKeyFromKeySecurityModule()` usa `URLSession.synchronousDataTask()` que bloquea el hilo (NC-011).

**IDs de auditoría relacionados**: SA-01, REQ-020, REQ-026, NC-011, SA-09

## Objetivo

Extraer la persistencia de claves FairPlay a `ContentKeyPersistence.swift` y la obtención de certificados a `FPSCertificateProvider.swift`.

## Alcance

### Código afectado

- `ios/Managers/ContentKeyManager.swift` — extraer:
  - Persistencia: `writePersistableContentKey()`, `deletePeristableContentKey()`, `deleteAllPeristableContentKeys()`, propiedad `contentKeyDirectory` (líneas ~600-716)
  - Certificados: `requestApplicationCertificate()` (líneas ~650-706)
- `ios/Managers/ContentKeyPersistence.swift` — **nuevo fichero**
- `ios/Managers/FPSCertificateProvider.swift` — **nuevo fichero**

### Fuera de alcance

- NO refactorizar `ContentKeyManager` en esta tarea (tarea 19)
- NO convertir `requestContentKeyFromKeySecurityModule()` a async (tarea 19)
- NO cambiar el singleton pattern de `ContentKeyManager`

## Requisitos funcionales

1. **[REQ-020]**: Persistir claves DRM FairPlay en disco (write, read, delete)
2. **[REQ-026]**: Obtener certificado FairPlay desde URL

## Requisitos técnicos

1. Clase `ContentKeyPersistence` en `ios/Managers/` — interfaz según sección B2 de `02-propuesta-segmentacion.md`
2. Clase `FPSCertificateProvider` en `ios/Managers/` — interfaz según sección B1 de `02-propuesta-segmentacion.md`
3. `ContentKeyPersistence` no tiene dependencias externas (solo FileManager)
4. `FPSCertificateProvider` usa URLSession directamente (mantener síncrono por ahora, async en tarea 19)
5. `ContentKeyManager` crea instancias y delega: `let keyPersistence = ContentKeyPersistence()`, `let certificateProvider = FPSCertificateProvider()`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `ContentKeyPersistence` gestiona escritura/lectura/eliminación de claves en disco
- [ ] `FPSCertificateProvider` obtiene certificados FPS desde URL
- [ ] `ContentKeyManager` delega a ambas clases
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: write/read/delete claves, obtención de certificado (mock)

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/ContentKeyPersistenceTests.swift` — valida persistencia de claves DRM

### Tests nuevos a crear

- `ios/Tests/ContentKeyPersistenceUnitTests.swift`:
  - `testWriteAndRead_roundtrip`: Write → read → datos coinciden
  - `testDelete_removesFile`: Write → delete → not exists
  - `testDeleteAll_removesAllForAsset`: Write 3 → deleteAll → none exist
  - `testExists_afterWrite_returnsTrue`: Write → exists → true
  - `testExists_beforeWrite_returnsFalse`: exists → false
  - `testContentKeyDirectory_exists`: El directorio se crea si no existe

- `ios/Tests/FPSCertificateProviderTests.swift`:
  - `testRequestCertificate_validURL_returnsData`: Mock URLSession → data válida
  - `testRequestCertificate_invalidURL_throwsError`: URL inválida → error
  - `testRequestCertificate_serverError_throwsError`: HTTP 500 → error

## Dependencias

### Tareas previas requeridas
- Tareas 01-04 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Tarea 17 (eliminar legacy): necesita que ContentKeyManager tenga dependencias claras
- Tarea 19 (refactorizar ContentKeyManager): usa las clases extraídas

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: `ContentKeyManager` es un singleton usado por múltiples módulos. Cambiar su estructura interna puede afectar el timing de operaciones DRM.
- **Mitigación**: Solo extraer, no cambiar la lógica. `ContentKeyManager` sigue siendo el punto de entrada. Las clases extraídas son implementaciones internas.
- **Rollback**: `git revert HEAD`

## Estimación

1.5-2.5 horas

## Notas

- El typo `deletePeristableContentKey` (falta una 's') se mantiene tal cual en esta tarea para no romper compatibilidad. Se corregirá en la tarea 19 o 20.
- `FPSCertificateProvider` mantiene la llamada síncrona por ahora. La conversión a async/await se hará en la tarea 19 cuando se refactorice `ContentKeyManager`.
- `ContentKeyPersistence` usa `FileManager.default` directamente. Para tests, se crea un directorio temporal.
