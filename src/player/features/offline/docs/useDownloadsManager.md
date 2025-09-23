# useDownloadsManager Hook

Hook principal unificado del sistema de descargas que proporciona una API completa para gestión de descargas binarias y streams.

## Importación

```typescript
import { useDownloadsManager } from 'react-native-video/offline';
import { UsableDownloadItem, DownloadType } from 'react-native-video/offline/types';
```

## Interfaz

### Parámetros de Configuración

```typescript
interface UseDownloadsManagerOptions {
    autoInit?: boolean;                    // Auto-inicializar el manager (default: true)
    config?: Partial<DownloadsManagerConfig>; // Configuración del manager
    onError?: (error: PlayerError) => void; // Callback de errores
    onDownloadStarted?: (downloadId: string) => void;
    onDownloadCompleted?: (downloadId: string) => void;
    onDownloadFailed?: (downloadId: string, error: PlayerError) => void;
}
```

### Valor de Retorno

```typescript
interface UseDownloadsManagerReturn {
    // Estado
    downloads: DownloadItem[];
    activeDownloads: DownloadItem[];
    queuedDownloads: DownloadItem[];
    completedDownloads: DownloadItem[];
    failedDownloads: DownloadItem[];

    // Estadísticas globales
    queueStats: QueueStats;
    totalProgress: number;
    globalSpeed: number;

    // Acciones principales
    addDownload: (item: UsableDownloadItem) => Promise<string>;
    removeDownload: (id: string) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    resumeDownload: (id: string) => Promise<void>;
    cancelDownload: (id: string) => Promise<void>;

    // Acciones masivas
    clearCompleted: () => Promise<void>;
    clearFailed: () => Promise<void>;
    pauseAll: () => Promise<void>;
    resumeAll: () => Promise<void>;

    // Estado del sistema
    isInitialized: boolean;
    isProcessing: boolean;
    isPaused: boolean;
    error: PlayerError | null;
}
```

## Uso Básico

### Configuración del Hook

```typescript
const {
    downloads,
    addDownload,
    removeDownload,
    pauseDownload,
    resumeDownload,
    isInitialized,
    error
} = useDownloadsManager({
    autoInit: true,
    onError: (error) => {
        console.error('Download error:', error.message);
    },
    onDownloadCompleted: (downloadId) => {
        console.log('Download completed:', downloadId);
    }
});
```

## Método addDownload

El método `addDownload` ha sido completamente rediseñado para seguir la nueva arquitectura:

### Funcionalidades Implementadas

1. **Recibe UsableDownloadItem**: Acepta objetos que contienen la información básica para crear una descarga
2. **Verificación de duplicados**: Comprueba automáticamente si ya existe una descarga con el mismo ID
3. **Asignación de perfil activo**: Asigna automáticamente el perfil activo obtenido del ProfileManager
4. **Creación de tareas específicas**: Convierte el UsableDownloadItem en tareas BinaryDownloadTask o StreamDownloadTask según el tipo

### Signature

```typescript
addDownload: (item: UsableDownloadItem) => Promise<string>
```

### Ejemplo de Uso - Descarga Binaria

```typescript
const downloadBinaryFile = async () => {
    try {
        const usableItem: UsableDownloadItem = {
            // ID es opcional - se generará automáticamente desde la URI si no se proporciona
            id: 'video_123', // Opcional
            type: DownloadType.BINARY,
            title: 'Mi Video Favorito',
            uri: 'https://ejemplo.com/video.mp4',
            media: {
                // Metadatos específicos del proyecto
                genre: 'Acción',
                duration: 7200,
                thumbnail: 'https://ejemplo.com/thumbnail.jpg'
            },
            licenseExpirationDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 días
        };

        const downloadId = await addDownload(usableItem);
        console.log('Download started with ID:', downloadId);
    } catch (error) {
        console.error('Failed to start download:', error);
    }
};
```

### Ejemplo de Uso - ID Generado Automáticamente

```typescript
const downloadWithAutoId = async () => {
    try {
        const usableItem: UsableDownloadItem = {
            // Sin ID - se generará automáticamente desde la URI
            type: DownloadType.BINARY,
            title: 'Video sin ID especificado',
            uri: 'https://example.com/movies/action/video name with spaces.mp4?quality=hd&lang=es',
            // URI con espacios y query strings - se procesará automáticamente
        };

        const downloadId = await addDownload(usableItem);
        console.log('Download started with auto-generated ID:', downloadId);
        // ID será algo como: 'download-example.com-movies-action-video-name-with-spaces.mp4-lx2k9r4s'
    } catch (error) {
        console.error('Failed to start download:', error);
    }
};
```

### Ejemplo de Uso - Descarga de Stream

```typescript
const downloadStream = async () => {
    try {
        const streamItem: UsableDownloadItem = {
            id: 'stream_456',
            type: DownloadType.STREAM,
            title: 'Stream en Vivo',
            uri: 'https://ejemplo.com/playlist.m3u8', // HLS
            drm: {
                type: 'widevine',
                licenseServer: 'https://ejemplo.com/license',
                headers: {
                    'Authorization': 'Bearer token123'
                }
            },
            subtitles: [
                {
                    id: 'sub_es',
                    language: 'es',
                    label: 'Español',
                    uri: 'https://ejemplo.com/subtitles_es.vtt',
                    format: SubtitleFormat.VTT,
                    isDefault: true,
                    state: SubtitleDownloadState.NOT_DOWNLOADED,
                    retryCount: 0
                }
            ]
        };

        const downloadId = await addDownload(streamItem);
        console.log('Stream download started:', downloadId);
    } catch (error) {
        console.error('Failed to start stream download:', error);
    }
};
```

### Flujo Interno del Método addDownload

1. **Validación de URI**: Verifica que la URI sea válida para descargas (protocolo HTTP/HTTPS)
2. **Generación de ID**: Si no se proporciona ID, genera uno automáticamente basado en la URI
3. **Validación de perfil**: Verifica si se puede descargar según el perfil activo usando `ProfileManager.canDownload()`
4. **Verificación de duplicados**: Comprueba si ya existe una descarga con el mismo ID usando `QueueManager.getDownload()`
5. **Asignación de perfil**: Obtiene el perfil activo y lo asigna al array `profileIds`
6. **Creación de DownloadItem**: Convierte el UsableDownloadItem en un DownloadItem completo con estado QUEUED y estadísticas iniciales
7. **Adición a la cola**: Agrega el DownloadItem al QueueManager usando `addDownloadItem()` (nueva arquitectura)
8. **Creación de tareas**: Convierte el item en BinaryDownloadTask o StreamDownloadTask según el tipo
9. **Inicio de descarga**: Inicia la descarga real a través del DownloadsManager

### Manejo de Errores

El método puede lanzar los siguientes errores:

- **Invalid URI**: Cuando la URI no es válida (debe usar protocolo HTTP/HTTPS)
- **No active profile**: Cuando no hay perfil activo y es requerido para descargas
- **Invalid download type**: Cuando el tipo de descarga no es válido (debe ser BINARY o STREAM)
- **Queue errors**: Errores relacionados con la cola de descargas
- **Manager errors**: Errores del DownloadsManager al iniciar la descarga

```typescript
try {
    const downloadId = await addDownload(item);
} catch (error) {
    if (error instanceof PlayerError) {
        switch (error.code) {
            case 'DOWNLOAD_FAILED':
                // Manejar error general de descarga
                break;
            // Otros códigos de error...
        }
    }
}
```

## Ejemplo Completo - Componente de Descarga

```typescript
import React from 'react';
import { View, Button, Text, FlatList } from 'react-native';
import { useDownloadsManager } from 'react-native-video/offline';
import { UsableDownloadItem, DownloadType } from 'react-native-video/offline/types';

const DownloadsScreen = () => {
    const {
        downloads,
        addDownload,
        removeDownload,
        pauseDownload,
        resumeDownload,
        totalProgress,
        isInitialized
    } = useDownloadsManager({
        onDownloadCompleted: (id) => console.log('Completed:', id),
        onDownloadFailed: (id, error) => console.error('Failed:', id, error),
    });

    const handleAddDownload = async () => {
        const item: UsableDownloadItem = {
            id: `download_${Date.now()}`,
            type: DownloadType.BINARY,
            title: 'Nuevo Video',
            uri: 'https://ejemplo.com/video.mp4',
        };

        try {
            await addDownload(item);
        } catch (error) {
            console.error('Error adding download:', error);
        }
    };

    if (!isInitialized) {
        return <Text>Inicializando sistema de descargas...</Text>;
    }

    return (
        <View>
            <Text>Progreso total: {totalProgress}%</Text>
            <Button title="Añadir Descarga" onPress={handleAddDownload} />
            
            <FlatList
                data={downloads}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View>
                        <Text>{item.title}</Text>
                        <Text>Estado: {item.state}</Text>
                        <Text>Progreso: {item.stats.progressPercent}%</Text>
                        <Button 
                            title="Pausar" 
                            onPress={() => pauseDownload(item.id)} 
                        />
                        <Button 
                            title="Eliminar" 
                            onPress={() => removeDownload(item.id)} 
                        />
                    </View>
                )}
            />
        </View>
    );
};
```

## Notas Importantes

- **IDs Opcionales**: El ID es opcional en `UsableDownloadItem`. Si no se proporciona, se genera automáticamente basado en la URI
- **Generación de ID desde URI**: Los IDs generados automáticamente eliminan protocolo, query strings, espacios y caracteres especiales para crear IDs limpios
- **URI Única**: No puede haber dos descargas con la misma URI. El sistema previene duplicados automáticamente
- **Perfiles obligatorios**: Si la configuración requiere un perfil activo, el método fallará si no hay ningún perfil activo
- **IDs únicos**: Cada descarga debe tener un ID único. Si intentas añadir una descarga con un ID existente, devolverá el ID existente
- **Tipos automáticos**: El hook detecta automáticamente si un URI es HLS (.m3u8) o DASH para streams
- **Validación de URI**: Solo se aceptan URIs con protocolos HTTP/HTTPS
- **Persistencia**: Todas las descargas se persisten automáticamente y se recuperan al reiniciar la aplicación
- **Profile Management**: El perfil asignado determina qué usuarios pueden ver la descarga
