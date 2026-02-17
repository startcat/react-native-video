# Notas clave — QueueManager Contract Tests

## Desviaciones del spec

### Tests #14 y #17: resumeDownload / resumeAll

**Spec decía**: Estado final = `QUEUED`
**Comportamiento real**: Estado final = `DOWNLOADING`

**Razón**: `resumeDownload` cambia el estado a QUEUED y luego llama `startProcessing()`, que ejecuta `processQueue()` sincrónicamente. `processQueue()` encuentra el item QUEUED, llama a `downloadsManager.startDownloadNow()` y cambia el estado a DOWNLOADING — todo en el mismo tick.

**Impacto para refactorización**: Si se separa `resumeDownload` de `processQueue` (por ejemplo, haciéndolo async con delay), estos tests fallarán y habrá que ajustarlos. Esto es intencional — los tests capturan el comportamiento actual.

- Test #14: `expect(result?.state).toBe(DownloadStates.DOWNLOADING)`
- Test #17: `expect(...).not.toBe(DownloadStates.PAUSED)` (más flexible, acepta QUEUED o DOWNLOADING)

## Configuración Jest

- **No se usa `preset: 'react-native'`** porque los polyfills de Flow (`@react-native/js-polyfills`) no se parsean correctamente con babel.
- Se usa `babel-jest` directo con `@babel/preset-typescript` + `@babel/plugin-transform-modules-commonjs`.
- `__DEV__: true` definido en `globals` porque `Logger.ts` lo usa y no existe en Node.

## Dependencia añadida

- `eventemitter3` añadido como devDependency. QueueManager lo importa directamente pero no estaba en `package.json` (probablemente resuelto por otra dependencia en runtime).

## Deuda técnica menor

- Si se añaden más test files, considerar mover `__DEV__` a un `setupFiles` de Jest.
- Los tests de `resumeAll` (#17) usan aserción negativa (`not.toBe(PAUSED)`) en vez de positiva, lo cual es menos preciso pero más robusto ante cambios de timing en processQueue.
