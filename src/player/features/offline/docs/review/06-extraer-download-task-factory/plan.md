# Plan de Implementación: Extraer downloadTaskFactory

> Generado a partir de spec.md el 2026-02-17

## Resumen

- **Archivos a crear**: 1 (`utils/downloadTaskFactory.ts`)
- **Archivos a modificar**: 2 (`hooks/useDownloadsManager.ts`, `hooks/useDownloadsList.ts`)
- **Tests a crear**: 1 (`__tests__/utils/downloadTaskFactory.contract.test.ts`)
- **Estimación**: 1-2 horas

## Fase 1: Crear downloadTaskFactory.ts

1. Create `utils/downloadTaskFactory.ts` with:
   - `createDownloadTask()` — pure function, extracts task creation logic
   - `extractSubtitlesFromManifest()` — extracts subtitle extraction logic
   - `sortDownloads()` — extracts sort logic
   - Types: `CreateDownloadTaskParams`, `SubtitleTrackForTask`, `CreateDownloadTaskResult`

### Verificación
```bash
npx tsc --noEmit --skipLibCheck  # No type errors
```

## Fase 2: Refactor hooks

1. Modify `useDownloadsManager.ts`:
   - Import `createDownloadTask`, `sortDownloads` from factory
   - Remove inline `sortDownloads` (L119-157)
   - Replace task creation block in `addDownload` (L441-552) with `createDownloadTask` call
2. Modify `useDownloadsList.ts`:
   - Import `createDownloadTask`, `sortDownloads` from factory
   - Remove inline `sortDownloads` (L69-99)
   - Replace task creation block in `addDownload` (L268-363) with `createDownloadTask` call

### Verificación
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage  # 219 tests still pass
```

## Fase 3: Write tests

1. Create `__tests__/utils/downloadTaskFactory.contract.test.ts` with 8 tests
2. Mock manifest parsers (they do HTTP fetches)

### Verificación
```bash
npx jest src/player/features/offline/__tests__/utils/downloadTaskFactory.contract.test.ts --no-coverage
```

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
npx eslint src/player/features/offline/utils/downloadTaskFactory.ts src/player/features/offline/hooks/useDownloadsManager.ts src/player/features/offline/hooks/useDownloadsList.ts
```

## Rollback

```bash
git checkout -- src/player/features/offline/hooks/useDownloadsManager.ts src/player/features/offline/hooks/useDownloadsList.ts
rm src/player/features/offline/utils/downloadTaskFactory.ts
rm src/player/features/offline/__tests__/utils/downloadTaskFactory.contract.test.ts
```
