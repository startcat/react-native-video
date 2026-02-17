# Tarea: Extraer DownloadValidator.swift

> Tarea 8 de 20 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene lógica de validación de configuración de descarga y de integridad de assets descargados. Estas son funciones puras (o casi puras) que no dependen del estado del módulo, lo que las hace candidatas ideales para extracción a un enum de utilidad estática.

**IDs de auditoría relacionados**: SA-01, REQ-002, REQ-029

## Objetivo

Extraer la lógica de validación a `DownloadValidator.swift` como enum con métodos estáticos, sin cambiar comportamiento.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `validateDownloadConfig()` (línea 1365), `validateAssetIntegrity()` (líneas 2337-2382), `validateAssetIntegrityRelaxed()` (líneas 2387-2421), `validateDownloadUri()` (líneas 1100-1108)
- `ios/Downloads_v2/DownloadValidator.swift` — **nuevo fichero**

### Fuera de alcance

- NO cambiar la lógica de validación (aunque sea básica, como indica REQ-002)
- NO mejorar la validación en esta tarea

## Requisitos funcionales

1. **[REQ-002]**: Validar configuración de descarga (id, uri, title presentes)
2. **[REQ-029]**: Validar integridad de asset descargado (directorio existe, no vacío, tamaño mínimo)

## Requisitos técnicos

1. Enum `DownloadValidator` en `ios/Downloads_v2/` (enum sin casos = namespace para métodos estáticos)
2. Interfaz pública según sección A5 de `02-propuesta-segmentacion.md`
3. Depende de `DownloadFileManager` (para `calculateAssetSize`, `cleanPath`)
4. Todas las funciones son `static`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Todas las funciones de validación están en `DownloadValidator`
- [ ] `DownloadsModule2` llama a `DownloadValidator.validateXxx()` en vez de métodos propios
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: config válida/inválida, integridad estricta/relajada, URI válida/inválida

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadValidationTests.swift` — valida validación y ficheros
- Estos tests NO se modifican

### Tests nuevos a crear

- `ios/Tests/DownloadValidatorTests.swift`:
  - `testValidateConfig_complete_returnsTrue`: Dict con id+uri+title → true
  - `testValidateConfig_missingId_returnsFalse`: Sin id → false
  - `testValidateConfig_empty_returnsFalse`: Dict vacío → false
  - `testValidateIntegrity_validDir_returnsValid`: Dir con ficheros >1MB → valid
  - `testValidateIntegrity_emptyDir_returnsInvalid`: Dir vacío → invalid
  - `testValidateIntegrityRelaxed_smallDir_returnsValid`: Dir con ficheros pequeños → valid (relajada)
  - `testValidateUri_hls_returnsStream`: .m3u8 → (true, "stream")
  - `testValidateUri_mp4_returnsBinary`: .mp4 → (true, "binary")
  - `testValidateUri_invalid_returnsFalse`: Texto inválido → (false, _)

## Dependencias

### Tareas previas requeridas
- Tarea 07 (DownloadFileManager): usa `calculateAssetSize` y `cleanPath`

### Tareas que dependen de esta
- Tarea 14 (DownloadSessionDelegate): usa `validateAssetIntegrity` en `finalizeDownload`

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: La validación de integridad usa `AVURLAsset` para verificar tracks, lo que puede requerir un asset real en tests
- **Mitigación**: Los tests de integridad usan directorios temporales con ficheros de tamaño conocido. La verificación de tracks se testea con la validación relajada.
- **Rollback**: `git revert HEAD`

## Estimación

1-1.5 horas

## Notas

- `validateDownloadConfig()` actualmente solo verifica presencia de id, uri y title. Es muy básica pero se extrae tal cual. Mejorarla es una tarea futura.
- `validateAssetIntegrity()` y `validateAssetIntegrityRelaxed()` difieren en que la estricta verifica tracks reproducibles con `AVURLAsset`, mientras que la relajada solo verifica existencia y tamaño.
