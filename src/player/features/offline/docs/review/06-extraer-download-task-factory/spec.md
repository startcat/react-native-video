# Especificación Técnica: Extraer downloadTaskFactory

> Generado a partir de task.md el 2026-02-17

## Resumen

Extraer la lógica duplicada de creación de tasks de descarga (~150 líneas) de `useDownloadsManager.ts` y `useDownloadsList.ts` a una utilidad pura `downloadTaskFactory.ts`. Ambos hooks consumirán la nueva utilidad.

## 1. Análisis de duplicación

### Diff entre hooks

Comparando `useDownloadsManager.addDownload` (L379-588) con `useDownloadsList.addDownload` (L215-383):

| Aspecto | useDownloadsManager | useDownloadsList | Diferencia |
|---|---|---|---|
| URI validation | ✅ idéntico | ✅ idéntico | — |
| ensureDownloadId | ✅ idéntico | ✅ idéntico | — |
| profileManager.canDownload | ✅ idéntico | ✅ idéntico | — |
| downloadService.isTypeEnabled | Mensaje incluye `BINARY_DOWNLOADS_DISABLED` | Mensaje genérico | **Menor** |
| Existing download check | ✅ idéntico | ✅ idéntico | — |
| Profile assignment | ✅ idéntico | ✅ idéntico | — |
| DownloadItem creation | ✅ idéntico | ✅ idéntico | — |
| Binary task creation | ✅ idéntico | ✅ idéntico | — |
| Stream task creation | ✅ idéntico | ✅ idéntico | — |
| Subtitle extraction | ✅ idéntico (con logs) | ✅ idéntico (con logs) | Solo log prefix |
| console.log statements | Más verbose | Menos verbose | **Menor** |
| Error handling | Calls `onError` callback | Only sets state | **Hook-specific** |

**Conclusión**: La lógica de creación de tasks (pasos 1-8) es idéntica. Las diferencias son solo en logging y error handling post-creación, que permanecen en los hooks.

### `sortDownloads` — duplicación exacta

La función `sortDownloads` (L119-157 en useDownloadsManager, L69-99 en useDownloadsList) es **idéntica** en ambos hooks.

## 2. Alcance de extracción

### Funciones a extraer a `downloadTaskFactory.ts`

```typescript
// 1. Crea la task de descarga (Binary o Stream) con subtítulos extraídos
export async function createDownloadTask(params: CreateDownloadTaskParams): Promise<CreateDownloadTaskResult>;

// 2. Extrae subtítulos de un manifest HLS o DASH
export async function extractSubtitlesFromManifest(
  uri: string,
  headers?: Record<string, string>
): Promise<SubtitleTrackForTask[]>;

// 3. Ordena descargas por prioridad de estado
export function sortDownloads(items: DownloadItem[]): DownloadItem[];
```

### Tipos nuevos

```typescript
interface CreateDownloadTaskParams {
  item: UsableDownloadItem & { id: string };  // Item con ID garantizado
  binariesDir: string;                         // Directorio de binarios (de storageService)
}

interface SubtitleTrackForTask {
  id: string;
  uri: string;
  language: string;
  label: string;
  format: SubtitleFormat;
  isDefault: boolean;
  encoding?: string;
}

interface CreateDownloadTaskResult {
  task: BinaryDownloadTask | StreamDownloadTask;
  extractedSubtitles: SubtitleTrackForTask[];
}
```

### Lo que NO se extrae (permanece en hooks)

- URI validation (`isValidUri`)
- `ensureDownloadId` call
- `profileManager.canDownload()` check
- `downloadService.isTypeEnabled()` check
- Existing download check (`queueManager.getDownload`)
- Profile assignment
- DownloadItem creation and `queueManager.addDownloadItem`
- `downloadsManager.addDownload` call
- Error handling and state updates
- `console.log` statements

**Razón**: Estas operaciones dependen de singletons (`profileManager`, `queueManager`, `downloadService`, `storageService`) y del estado del hook. Extraer solo la creación de tasks mantiene la utilidad pura.

## 3. Cambios en hooks

### useDownloadsManager.ts

- **Eliminar**: `sortDownloads` inline (L119-157)
- **Importar**: `sortDownloads` de `downloadTaskFactory`
- **Eliminar**: Lógica de creación de task en `addDownload` (L441-552)
- **Reemplazar**: Con llamada a `createDownloadTask`

### useDownloadsList.ts

- **Eliminar**: `sortDownloads` inline (L69-99)
- **Importar**: `sortDownloads` de `downloadTaskFactory`
- **Eliminar**: Lógica de creación de task en `addDownload` (L268-363)
- **Reemplazar**: Con llamada a `createDownloadTask`

## 4. Tests nuevos

8 tests en `__tests__/utils/downloadTaskFactory.contract.test.ts`:

| # | Test | Tipo |
|---|---|---|
| 1 | createDownloadTask con stream HLS → task con config HLS | normal |
| 2 | createDownloadTask con stream DASH → task con config DASH | normal |
| 3 | createDownloadTask con binario → task binaria | normal |
| 4 | createDownloadTask con subtítulos proporcionados → usa los proporcionados | normal |
| 5 | createDownloadTask sin subtítulos → extrae del manifest | normal |
| 6 | createDownloadTask con tipo inválido → error | error |
| 7 | sortDownloads ordena por prioridad de estado | normal |
| 8 | sortDownloads con array vacío → array vacío | edge |

## 5. Verificación

### Fase A tests (regresión)
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
# Esperado: 219+ tests passing
```

### Tests nuevos
```bash
npx jest src/player/features/offline/__tests__/utils/downloadTaskFactory.contract.test.ts --no-coverage
# Esperado: 8 tests passing
```

### Lint
```bash
npx eslint src/player/features/offline/utils/downloadTaskFactory.ts src/player/features/offline/hooks/useDownloadsManager.ts src/player/features/offline/hooks/useDownloadsList.ts
```
