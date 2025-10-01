# SubtitleDownloadService

Servicio dedicado para descargar subtítulos asociados a streams. Usa llamadas HTTP simples sin sistema de colas ya que los subtítulos son archivos pequeños de texto plano.

## Características

- ✅ **Descargas HTTP simples** - Sin colas ni complejidad innecesaria
- ✅ **Descarga en paralelo** - Múltiples subtítulos a la vez (configurable)
- ✅ **Reintentos automáticos** - Retry con backoff exponencial
- ✅ **Validación de contenido** - Verifica formato VTT, SRT, TTML, etc.
- ✅ **Eventos en tiempo real** - Progress, completed, failed
- ✅ **Gestión de almacenamiento** - Organizado en `/Downloads/Subtitles/`
- ✅ **Múltiples formatos** - VTT, SRT, TTML, DFXP, SSA, ASS, SMI, SAMI, SUB

## Uso

### 1. Inicialización

```typescript
import { subtitleDownloadService } from './services/download/SubtitleDownloadService';
import { LogLevel } from './types';

await subtitleDownloadService.initialize({
    maxConcurrentDownloads: 5,
    requestTimeout: 30000,
    maxRetries: 2,
    validateContent: true,
    logEnabled: true,
    logLevel: LogLevel.INFO,
});
```

### 2. Descargar subtítulos

```typescript
const subtitles: SubtitleDownloadTask[] = [
    {
        id: 'sub_es',
        downloadId: 'stream_12345',
        uri: 'https://example.com/subtitles/spanish.vtt',
        language: 'es',
        label: 'Español',
        format: SubtitleFormat.VTT,
        isDefault: true,
        encoding: 'utf-8',
    },
    {
        id: 'sub_en',
        downloadId: 'stream_12345',
        uri: 'https://example.com/subtitles/english.vtt',
        language: 'en',
        label: 'English',
        format: SubtitleFormat.VTT,
        isDefault: false,
    },
];

// Descarga todos en paralelo
const results = await subtitleDownloadService.downloadSubtitles('stream_12345', subtitles);

// Resultado
results.forEach((subtitle) => {
    if (subtitle.state === SubtitleDownloadState.COMPLETED) {
        console.log(`✅ ${subtitle.label}: ${subtitle.localPath}`);
    } else {
        console.log(`❌ ${subtitle.label}: ${subtitle.error?.message}`);
    }
});
```

### 3. Eventos

```typescript
// Suscribirse a eventos
const unsubscribe = subtitleDownloadService.subscribe(
    SubtitleDownloadEventType.COMPLETED,
    (data) => {
        console.log('Subtitle downloaded:', data.localPath);
    }
);

// Desuscribirse
unsubscribe();
```

### 4. Obtener subtítulos descargados

```typescript
const subtitles = subtitleDownloadService.getSubtitlesForDownload('stream_12345');
console.log(`${subtitles.length} subtitles downloaded`);
```

### 5. Eliminar subtítulos

```typescript
// Eliminar todos los subtítulos de una descarga
await subtitleDownloadService.deleteSubtitles('stream_12345');
```

### 6. Cancelar descargas activas

```typescript
// Cancelar un subtítulo específico
subtitleDownloadService.cancelDownload('sub_es');

// Cancelar todas las descargas
subtitleDownloadService.cancelAllDownloads();
```

## Integración automática con StreamDownloadService

Los subtítulos se descargan **automáticamente** cuando se completa una descarga de stream:

```typescript
const streamTask: StreamDownloadTask = {
    id: 'stream_12345',
    manifestUrl: 'https://example.com/video.m3u8',
    title: 'My Video',
    config: {
        type: 'HLS',
        quality: 'auto',
    },
    subtitles: [
        {
            id: 'sub_es',
            uri: 'https://example.com/subtitles/spanish.vtt',
            language: 'es',
            label: 'Español',
            format: SubtitleFormat.VTT,
            isDefault: true,
        },
    ],
};

// Al descargar el stream, los subtítulos se descargan automáticamente al completarse
await streamDownloadService.startDownload(streamTask);
```

## Eventos disponibles

```typescript
enum SubtitleDownloadEventType {
    STARTED = "subtitle_download_started",
    PROGRESS = "subtitle_download_progress",
    COMPLETED = "subtitle_download_completed",
    FAILED = "subtitle_download_failed",
}
```

## Configuración

```typescript
import { LogLevel } from './types';

interface SubtitleServiceConfig {
    maxConcurrentDownloads: number;  // Default: 5
    requestTimeout: number;          // Default: 30000 (30s)
    maxRetries: number;              // Default: 2
    validateContent: boolean;        // Default: true
    logEnabled: boolean;             // Default: true
    logLevel: LogLevel;              // Default: LogLevel.INFO
}

// LogLevel valores disponibles:
// LogLevel.DEBUG = 0
// LogLevel.INFO = 1
// LogLevel.WARN = 2
// LogLevel.ERROR = 3
// LogLevel.NONE = 4 (desactiva logs)
```

## Formatos soportados

- **VTT** - WebVTT (Web Video Text Tracks) `.vtt`
- **SRT** - SubRip `.srt`
- **TTML** - Timed Text Markup Language `.ttml`
- **DFXP** - Distribution Format Exchange Profile `.dfxp`
- **SSA** - SubStation Alpha `.ssa`
- **ASS** - Advanced SubStation Alpha `.ass`
- **SMI** - SAMI (Microsoft) `.smi`
- **SAMI** - SAMI variant `.sami`
- **SUB** - MicroDVD `.sub`

## Validación de contenido

El servicio valida automáticamente el contenido de los subtítulos descargados:

- **VTT**: Verifica que comience con `WEBVTT`
- **SRT**: Verifica números de secuencia
- **TTML**: Verifica elemento raíz `<tt>`
- **Otros**: Verificación básica de archivo no vacío

Si la validación falla, el subtítulo se marca como `FAILED` con el error correspondiente.

## Estructura de archivos

Los subtítulos se almacenan en:

```
/Downloads/Subtitles/
└── stream_12345_es_1234567890.vtt
└── stream_12345_en_1234567891.vtt
```

Formato del nombre: `{downloadId}_{language}_{timestamp}.{extension}`

## Estadísticas

```typescript
const stats = subtitleDownloadService.getStats();
console.log(stats);
// {
//     activeDownloads: 2,
//     totalDownloaded: 15,
//     downloadsByLanguage: Map {
//         'es' => 8,
//         'en' => 5,
//         'fr' => 2
//     }
// }
```

## Limpieza

```typescript
// Al destruir el servicio
subtitleDownloadService.destroy();
```

## Notas importantes

1. **Sin colas**: Los subtítulos se descargan inmediatamente en paralelo, sin sistema de colas
2. **Archivos pequeños**: Optimizado para archivos de texto plano (generalmente < 500KB)
3. **No bloquea streams**: Las descargas de subtítulos ocurren después de completar el stream principal
4. **Tolerante a fallos**: Si falla la descarga de un subtítulo, no afecta al stream ni otros subtítulos
5. **Validación opcional**: Puede desactivarse si ya confías en el servidor origen

## Ejemplo completo

```typescript
import { subtitleDownloadService } from './services/download/SubtitleDownloadService';
import { 
    SubtitleDownloadEventType,
    SubtitleFormat,
    SubtitleDownloadTask,
    LogLevel 
} from './types';

// 1. Inicializar
await subtitleDownloadService.initialize();

// 2. Suscribirse a eventos
subtitleDownloadService.subscribe(SubtitleDownloadEventType.COMPLETED, (data) => {
    console.log(`✅ Subtitle completed: ${data.localPath}`);
});

subtitleDownloadService.subscribe(SubtitleDownloadEventType.FAILED, (data) => {
    console.error(`❌ Subtitle failed: ${data.error}`);
});

// 3. Preparar tareas de descarga
const tasks = [
    {
        id: 'sub_es',
        downloadId: 'video_001',
        uri: 'https://cdn.example.com/subs/video_es.vtt',
        language: 'es',
        label: 'Español',
        format: SubtitleFormat.VTT,
        isDefault: true,
    },
    {
        id: 'sub_en',
        downloadId: 'video_001',
        uri: 'https://cdn.example.com/subs/video_en.vtt',
        language: 'en',
        label: 'English',
        format: SubtitleFormat.VTT,
        isDefault: false,
    },
];

// 4. Descargar
try {
    const results = await subtitleDownloadService.downloadSubtitles('video_001', tasks);
    
    const downloaded = results.filter(r => r.state === SubtitleDownloadState.COMPLETED).length;
    console.log(`Downloaded ${downloaded}/${results.length} subtitles`);
    
    // 5. Recuperar después
    const savedSubtitles = subtitleDownloadService.getSubtitlesForDownload('video_001');
    
    // 6. Limpiar cuando sea necesario
    await subtitleDownloadService.deleteSubtitles('video_001');
} catch (error) {
    console.error('Failed to download subtitles:', error);
}
```
