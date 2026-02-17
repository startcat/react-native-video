# Tarea: Extraer downloadTaskFactory

> Tarea 06 de 19 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-02) que la lógica de `addDownload` (~150 líneas) está duplicada verbatim en `useDownloadsManager.ts` y `useDownloadsList.ts`. Esto incluye la creación de tasks de descarga, extracción de subtítulos de manifiestos DASH/HLS, asignación de perfiles y ordenación de descargas. Cambios en uno sin actualizar el otro causan bugs silenciosos.

**IDs de auditoría relacionados**: SA-02

## Objetivo

Extraer la lógica compartida de creación de tasks de descarga a una utilidad pura `downloadTaskFactory.ts`, y que ambos hooks la consuman en lugar de duplicarla.

## Alcance

### Código afectado

- `utils/downloadTaskFactory.ts` — **CREAR**: nueva utilidad con funciones `createDownloadTask()`, `extractSubtitlesFromManifest()`, `sortDownloads()`
- `hooks/useDownloadsManager.ts` — **MODIFICAR**: reemplazar lógica inline de `addDownload` por llamada a `createDownloadTask()`; reemplazar `sortDownloads` duplicada por import
- `hooks/useDownloadsList.ts` — **MODIFICAR**: reemplazar lógica inline de `addDownload` por llamada a `createDownloadTask()`; reemplazar `sortDownloads` duplicada por import

### Fuera de alcance

- NO modificar la interfaz pública de los hooks (mismos parámetros y retorno)
- NO modificar managers ni services
- NO cambiar el comportamiento de addDownload (solo mover código)

## Requisitos funcionales

1. **[SA-02]**: La lógica de creación de tasks debe existir en un solo lugar
2. El resultado de `addDownload` en ambos hooks debe ser idéntico al actual

## Requisitos técnicos

1. Utilidad pura (sin efectos secundarios, sin singletons)
2. Interfaz pública:
```typescript
export async function createDownloadTask(params: {
  id: string;
  title: string;
  uri: string;
  type: DownloadType;
  manifestContent?: string;
  drm?: IDrm;
  drmScheme?: string;
  profileId?: string;
  subtitles?: SubtitleTrack[];
}): Promise<{
  task: BinaryDownloadTask | StreamDownloadTask;
  extractedSubtitles: SubtitleTrack[];
}>;

export function extractSubtitlesFromManifest(
  manifestContent: string,
  manifestUrl: string,
  type: 'HLS' | 'DASH'
): SubtitleTrack[];

export function sortDownloads(downloads: DownloadItem[]): DownloadItem[];
```
3. Los parsers de manifiestos (`DASHManifestParser`, `HLSManifestParser`) se importan directamente (son singletons sin estado mutable)

## Cambios de contrato

- **Ninguno** — el comportamiento público de ambos hooks debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `useDownloadsManager.addDownload()` produce el mismo `DownloadItem` que antes
- [ ] `useDownloadsList.addDownload()` produce el mismo `DownloadItem` que antes
- [ ] No existe código duplicado de creación de tasks entre los dos hooks
- [ ] `grep -c "extractSubtitles\|sortDownloads" hooks/useDownloadsManager.ts hooks/useDownloadsList.ts` muestra solo imports, no implementaciones

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos de `downloadTaskFactory` cubren: caso normal (stream con subtítulos), caso normal (binario), caso límite (sin manifest), caso error (URI inválida)

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que addDownloadItem sigue recibiendo items correctos
- `__tests__/offline/managers/DownloadsManager.contract.test.ts` — valida que addDownload sigue delegando correctamente

### Tests nuevos a crear

- `__tests__/offline/utils/downloadTaskFactory.test.ts`:
  - Test 1: `createDownloadTask` con stream DASH y subtítulos → task con subtítulos extraídos
  - Test 2: `createDownloadTask` con stream HLS y subtítulos → task con subtítulos extraídos
  - Test 3: `createDownloadTask` con binario → task binaria sin subtítulos
  - Test 4: `extractSubtitlesFromManifest` con manifest DASH → subtítulos correctos
  - Test 5: `extractSubtitlesFromManifest` con manifest HLS → subtítulos correctos
  - Test 6: `sortDownloads` ordena por estado (DOWNLOADING primero, COMPLETED último)
  - Test 7 — caso límite: `createDownloadTask` sin manifestContent → task sin subtítulos
  - Test 8 — caso error: `createDownloadTask` con URI vacía → error

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato de QueueManager deben estar en verde
- Tarea 02 (Fase A): tests de contrato de DownloadsManager deben estar en verde

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que la extracción omita algún detalle sutil de la lógica duplicada (ej: un hook tiene un fix que el otro no)
- **Mitigación**: diff detallado de ambas implementaciones antes de extraer; verificar que ambos hooks producen resultados idénticos con los mismos inputs
- **Rollback**: `git revert HEAD`

## Estimación

1–2 horas

## Notas

- Antes de extraer, hacer un diff entre las dos implementaciones de `addDownload` para identificar diferencias sutiles. Si hay diferencias, documentarlas y decidir cuál es la correcta.
- Los parsers de manifiestos son singletons pero no tienen estado mutable, así que importarlos directamente es seguro.
