# Tarea: Extraer DownloadPersistenceManager.swift

> Tarea 6 de 20 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene ~270 líneas de lógica de persistencia en UserDefaults distribuidas en 15 funciones (SA-01, SA-07). Hay triple persistencia redundante para la ubicación de assets (CI-001): `activeDownloads[id].assetPath`, `saveAssetPath()` y `saveAssetBookmark()`. Extraer toda la persistencia a un manager dedicado es el primer paso para simplificar este mecanismo.

**IDs de auditoría relacionados**: SA-01, SA-07, CI-001, REQ-016, REQ-017, REQ-018, REQ-019

## Objetivo

Extraer toda la lógica de persistencia en UserDefaults a `DownloadPersistenceManager.swift`, sin cambiar comportamiento. Documentar la triple persistencia como deuda técnica a simplificar en una tarea futura.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `persistDownloadState()`, `restoreDownloadStates()`, `saveAssetPath()`, `loadAssetPaths()`, `removeAssetPath()`, `clearAllAssetPaths()`, `saveAssetBookmark()`, `loadAssetBookmarks()`, `resolveAssetBookmark()`, `removeAssetBookmark()`, `saveSubtitleBookmark()`, `loadSubtitleBookmarks()`, `resolveSubtitleBookmark()`, `removeSubtitleBookmark()`, `removeAllSubtitleBookmarks()` (líneas ~2622-2896)
- `ios/Downloads_v2/DownloadPersistenceManager.swift` — **nuevo fichero**

### Fuera de alcance

- NO simplificar la triple persistencia en esta tarea (solo mover)
- NO cambiar la API pública de `DownloadsModule2` hacia React Native
- NO tocar `ContentKeyManager` (tiene su propia persistencia de claves, tarea 16)

## Requisitos funcionales

1. **[REQ-016]**: Persistir/restaurar estado de descargas entre sesiones
2. **[REQ-017]**: Persistir ubicación de assets descargados
3. **[REQ-018]**: Persistir bookmarks sandbox-safe
4. **[REQ-019]**: Persistir bookmarks de subtítulos

## Requisitos técnicos

1. Clase `DownloadPersistenceManager` en `ios/Downloads_v2/`
2. Interfaz pública según sección A2 de `02-propuesta-segmentacion.md`
3. Depende de `DownloadTypes` (para `DownloadInfo`, `DownloadConstants`)
4. Inyectar `UserDefaults` como dependencia para testabilidad (default: `.standard`)
5. `DownloadsModule2` crea una instancia `private let persistenceManager = DownloadPersistenceManager()` y delega todas las llamadas

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Todas las funciones de persistencia están en `DownloadPersistenceManager`
- [ ] `DownloadsModule2` delega a `persistenceManager` en todos los puntos donde antes llamaba directamente a UserDefaults
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos de `DownloadPersistenceManager` cubren: save/load roundtrip, remove, bookmark resolve, subtitle composite key
- [ ] Si hay cambios de contrato: tests actualizados con justificación en comentario

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — valida que la persistencia sigue funcionando tras la extracción
- Estos tests NO se modifican

### Tests nuevos a crear

- `ios/Tests/DownloadPersistenceManagerTests.swift`:
  - `testPersistAndRestoreDownloadStates_roundtrip`: Save → restore → datos coinciden
  - `testSaveAndLoadAssetPath`: Save path → load → correcto
  - `testRemoveAssetPath_nonExistent_noError`: No crash
  - `testSaveAndResolveBookmark`: Save → resolve → URL válida
  - `testSubtitleBookmark_compositeKey`: Clave downloadId:language funciona
  - `testRemoveAllSubtitleBookmarks_onlyAffectsTargetId`: No afecta otros IDs

## Dependencias

### Tareas previas requeridas
- Tarea 05 (DownloadTypes): necesita `DownloadInfo`, `DownloadConstants`

### Tareas que dependen de esta
- Tarea 07 (DownloadFileManager): usa `DownloadPersistenceManager` para resolución de bookmarks
- Tarea 09 (DownloadStorageCalculator): usa `DownloadPersistenceManager` para asset paths

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Olvidar reemplazar alguna llamada directa a UserDefaults en `DownloadsModule2`
- **Mitigación**: Buscar todas las ocurrencias de `UserDefaults` y las constantes de keys en el fichero original
- **Rollback**: `git revert HEAD`

## Estimación

1.5-2.5 horas

## Notas

- La triple persistencia (CI-001) se mantiene tal cual en esta tarea. Solo se mueve a un lugar centralizado. La simplificación se hará en una tarea futura cuando haya tests suficientes para validar que los bookmarks son suficientes como mecanismo único.
- Inyectar `UserDefaults` como parámetro del init permite usar `UserDefaults(suiteName:)` en tests sin contaminar el estado global.
