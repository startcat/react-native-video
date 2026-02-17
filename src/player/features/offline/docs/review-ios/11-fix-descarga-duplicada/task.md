# Tarea: Fix descarga duplicada sin protección (NC-001)

> Tarea 11 de 20 | Fase C: Correcciones críticas
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.addDownload()` no verifica si ya existe una descarga con el mismo ID antes de crear una nueva tarea. Si se llama dos veces con el mismo ID, se crea una segunda tarea que sobrescribe la referencia en `downloadTasks`, perdiendo el control de la primera. Esto es uno de los 2 casos no contemplados de prioridad crítica (NC-001).

**IDs de auditoría relacionados**: NC-001, NC-010 (parcial)

## Objetivo

Añadir verificación de descarga duplicada en `addDownload()` y opcionalmente verificación de espacio disponible pre-descarga (NC-010).

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — `addDownload()` (líneas ~600-700): añadir guard al inicio que verifique `activeDownloads[downloadId]`

### Fuera de alcance

- NO refactorizar `addDownload()` más allá de la verificación
- NO implementar retry automático (NC-003)

## Requisitos funcionales

1. **[NC-001]**: Si se llama a `addDownload` con un ID que ya existe en `activeDownloads`, rechazar la promesa con error descriptivo
2. **[NC-010]** (parcial): Verificar espacio disponible antes de iniciar descarga. Si el espacio es menor que un umbral configurable, rechazar con error descriptivo.

## Requisitos técnicos

1. Guard al inicio de `addDownload()`: `guard activeDownloads[downloadId] == nil else { reject("DOWNLOAD_ALREADY_EXISTS", "Download with id \(downloadId) already exists", nil); return }`
2. Verificación opcional de espacio: `let availableSpace = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())[.systemFreeSize] as? Int64`
3. No introducir dependencias nuevas

## Cambios de contrato

- **[NC-001]**: `addDownload` con ID duplicado ahora rechaza en vez de crear una segunda tarea silenciosamente. Si algún código JS depende de poder llamar `addDownload` múltiples veces con el mismo ID, deberá adaptarse.

## Criterios de aceptación

### Funcionales
- [ ] `addDownload` con ID nuevo → resolve (sin cambio)
- [ ] `addDownload` con ID existente → reject con código "DOWNLOAD_ALREADY_EXISTS"
- [ ] `addDownload` con espacio insuficiente → reject con código "INSUFFICIENT_SPACE" (si se implementa NC-010)

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Test nuevo: `testAddDownload_duplicateId_rejects`
- [ ] Test nuevo: `testAddDownload_insufficientSpace_rejects` (si aplica)

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — los tests existentes de `addDownload` con config válida siguen pasando (no hay duplicados en los tests)

### Tests nuevos a crear

- En `ios/Tests/DownloadsModule2StateTests.swift` (o fichero nuevo):
  - `testAddDownload_duplicateId_rejects`: Añadir descarga → añadir otra con mismo ID → reject
  - `testAddDownload_insufficientSpace_rejects`: Mock espacio bajo → reject (si se implementa)

## Dependencias

### Tareas previas requeridas
- Tareas 01-04 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Ninguna directa

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Algún flujo JS podría depender de poder re-añadir una descarga con el mismo ID (ej: retry). Si es así, el reject rompería ese flujo.
- **Mitigación**: Verificar en el código TypeScript si hay llamadas a `addDownload` que puedan enviar IDs duplicados. Si las hay, considerar un comportamiento alternativo (ej: si ya existe y está fallida, permitir re-crear).
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1 hora

## Notas

- La verificación de espacio (NC-010) es opcional en esta tarea. Si se implementa, usar un umbral conservador (ej: 100MB mínimo libre) y hacerlo configurable.
- Considerar si el comportamiento correcto para un ID duplicado es: (a) reject siempre, (b) reject solo si está activa/downloading, (c) resume si está pausada. La opción (a) es la más segura y simple.
