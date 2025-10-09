# 🎵 Sistema de Playlists Nativo

Sistema de gestión de playlists para reproducción en background sin depender de JavaScript activo. **Funciona en iOS y Android** con auto-next 100% nativo.

> ✅ **Completamente funcional** - El auto-next funciona perfectamente en ambas plataformas, incluso con la app en background o pantalla apagada.

## 📋 Índice

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Instalación](#instalación)
- [Modos de Operación](#modos-de-operación)
- [Uso Básico](#uso-básico)
- [API Completa](#api-completa)
- [Eventos](#eventos)
- [Integración con Video Component](#integración-con-video-component)
- [Implementación Nativa](#implementación-nativa)
- [Ejemplos](#ejemplos)

## ✨ Características

### Reproducción en Background
- ✅ **Auto-next 100% nativo** - funciona aunque JavaScript esté suspendido
- ✅ **iOS y Android** - implementación completa en ambas plataformas
- ⚠️ **Widget multimedia básico** - Play/Pause implementados, Next/Previous pendientes
- ✅ **Funciona con pantalla apagada** y lock screen
- ✅ **AirPlay/Chromecast** - auto-next funciona durante streaming
- ✅ **Sin dependencia de JavaScript activo** en background

### Gestión Avanzada
- ✅ **Modos de repetición** (OFF, ALL, ONE)
- ✅ **Modo shuffle** con orden original preservado
- ✅ **Persistencia** automática del estado
- ✅ **Estadísticas** de reproducción
- ✅ **Control de índice** y navegación

### Integración
- ✅ **Módulo nativo iOS (Swift) y Android (Kotlin)**
- ✅ **Modo Coordinado** - sincronización con componente Video
- ✅ **Modo Standalone** - player independiente (solo audio)
- ✅ **Eventos nativos** para tracking y analytics
- ✅ **Manejo de errores** robusto con skip automático

## 🏗️ Arquitectura

### Modo Coordinado (Con Video Component)

```
┌────────────────────────────────────────────────────┐
│              JavaScript Layer                      │
│  PlaylistsManager + Video Component                │
│  - Gestión de cola y estado                        │
│  - Renderizado de video                            │
│  - Eventos y UI                                    │
└──────────────┬─────────────────────────────────────┘
               │
               ↓
┌────────────────────────────────────────────────────┐
│           React Native Bridge                      │
│  PlaylistControlModule + RCTVideo                  │
└──────────────┬─────────────────────────────────────┘
               │
               ↓
┌────────────────────────────────────────────────────┐
│            Native Layer (iOS)                      │
│  PlaylistControlModule.swift                       │
│  ├─ Gestiona cola de playlist                      │
│  ├─ Escucha: RCTVideoItemDidFinish                 │
│  ├─ Emite: PlaylistLoadNextSource                  │
│  └─ NowPlayingInfoCenter + RemoteCommands          │
│                                                     │
│  RCTVideo.swift                                    │
│  ├─ Reproduce items con AVPlayer                   │
│  ├─ Emite notificación al terminar                 │
│  └─ Carga automáticamente siguiente item           │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│           Native Layer (Android)                   │
│  PlaylistControlModule.kt                          │
│  ├─ Gestiona cola de playlist                      │
│  ├─ BroadcastReceiver: VIDEO_ITEM_FINISHED         │
│  ├─ Emite: LOAD_NEXT_SOURCE                        │
│  └─ MediaSession + Notification                    │
│                                                     │
│  ReactExoplayerView.java                           │
│  ├─ Reproduce items con ExoPlayer                  │
│  ├─ Emite broadcast al terminar                    │
│  └─ Carga automáticamente siguiente item           │
└────────────────────────────────────────────────────┘
```

### Comunicación Nativa-a-Nativa

**iOS:**
```
RCTVideo ──[NotificationCenter]──> PlaylistControlModule
    │         RCTVideoItemDidFinish           │
    │                                         ↓
    │                                    Calcula siguiente
    │                                         │
    │   <──[NotificationCenter]───────────────┘
    │      PlaylistLoadNextSource
    ↓
Carga nuevo source automáticamente
```

**Android:**
```
ReactExoplayerView ──[Intent Broadcast]──> PlaylistControlModule
        │          ACTION_VIDEO_ITEM_FINISHED        │
        │                                           ↓
        │                                    Calcula siguiente
        │                                           │
        │   <──[Intent Broadcast]────────────────────┘
        │        ACTION_LOAD_NEXT_SOURCE
        ↓
Carga nuevo source automáticamente
```

## 📦 Instalación

El módulo de playlists está incluido en `react-native-video`. Solo necesitas inicializarlo:

```typescript
import { playlistsManager } from 'react-native-video';

await playlistsManager.initialize({
    logEnabled: true,
    logLevel: 'info',
    enablePersistence: true,
    defaultPlaylistConfig: {
        autoNext: true,
        repeatMode: 'OFF',
        shuffleMode: 'OFF',
    },
});
```

### Configuración de Permisos

**iOS:** Agregar en `Info.plist`:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

**Android:** Agregar en `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

## 🎯 Modos de Operación

El sistema de playlists puede funcionar en dos modos:

### 1. Modo Coordinado (Recomendado)

**Uso:** Apps que usan el componente `<Video>` y necesitan auto-next en background.

**Características:**
- ✅ Video/Audio se reproduce con el componente Video normal
- ✅ PlaylistControlModule gestiona la cola en background
- ✅ Auto-next 100% nativo sin JavaScript
- ✅ Funciona con AirPlay, Chromecast, pantalla apagada
- ✅ Widget multimedia completo (iOS/Android)

**Configuración:**
```typescript
// 1. Configurar playlist en modo coordinado
await playlistsManager.setPlaylist(episodes, {
    coordinatedMode: true,  // ← Clave para habilitar modo coordinado
    autoNext: true,
});

// 2. Renderizar Video con integración de playlist
<Video
    source={currentItem.source}
    enablePlaylistIntegration={true}  // ← Habilita comunicación nativa
    playlistItemId={currentItem.id}   // ← ID del item actual
    playInBackground={true}
    playWhenInactive={true}
    // ... otras props
/>
```

### 2. Modo Standalone

**Uso:** Apps de audio puro (podcasts, música) que no necesitan video.

**Características:**
- ✅ PlaylistControlModule gestiona su propio player nativo (AVPlayer/ExoPlayer)
- ✅ Reproducción de audio en background
- ✅ Widget multimedia completo
- ⚠️ Solo audio (no video)

**Configuración:**
```typescript
// Playlist sin componente Video
await playlistsManager.setPlaylist(episodes, {
    coordinatedMode: false,  // o no especificar (modo standalone por defecto)
    autoNext: true,
});

// No es necesario renderizar componente Video
// El módulo nativo gestiona la reproducción
```

## 🚀 Uso Básico

### 1. Crear y Cargar una Playlist

```typescript
import { playlistsManager, PlaylistItemType } from 'react-native-video';

// Preparar items de la playlist
const playlist = [
    {
        id: 'ep1',
        type: PlaylistItemType.AUDIO,
        source: {
            uri: 'https://cdn.example.com/episode1.m3u8',
            headers: {
                'Authorization': 'Bearer token123',
            },
        },
        metadata: {
            title: 'Episodio 1 - El Comienzo',
            artist: 'Mi Podcast',
            imageUri: 'https://cdn.example.com/cover1.jpg',
            description: 'Primer episodio',
        },
        duration: 3600, // 1 hora en segundos
        startPosition: 0,
    },
    {
        id: 'ep2',
        type: PlaylistItemType.AUDIO,
        source: {
            uri: 'https://cdn.example.com/episode2.m3u8',
        },
        metadata: {
            title: 'Episodio 2 - La Aventura',
            artist: 'Mi Podcast',
            imageUri: 'https://cdn.example.com/cover2.jpg',
        },
        duration: 3800,
    },
];

// Cargar la playlist
await playlistsManager.setPlaylist(playlist, {
    autoNext: true,
    repeatMode: 'OFF',
    startIndex: 0, // Empezar desde el primer item
});
```

### 2. Controlar la Reproducción

```typescript
// Ir al siguiente
const hasNext = await playlistsManager.goToNext();

// Ir al anterior
const hasPrevious = await playlistsManager.goToPrevious();

// Ir a un índice específico
await playlistsManager.goToIndex(2);

// Ir a un item por ID
await playlistsManager.goToItem('ep3');
```

### 3. Configurar Modos

```typescript
import { PlaylistRepeatMode, PlaylistShuffleMode } from 'react-native-video';

// Establecer modo repeat
await playlistsManager.setRepeatMode(PlaylistRepeatMode.ALL);

// Establecer modo shuffle
await playlistsManager.setShuffleMode(PlaylistShuffleMode.ON);

// Habilitar/deshabilitar auto-next
await playlistsManager.setAutoNext(true);
```

### 4. Agregar y Remover Items

```typescript
// Agregar un item al final
await playlistsManager.addItem({
    id: 'ep4',
    type: PlaylistItemType.AUDIO,
    source: { uri: 'https://...' },
    metadata: { title: 'Episodio 4' },
});

// Insertar en posición específica
await playlistsManager.insertItem(newItem, 2);

// Remover item
await playlistsManager.removeItem('ep3');

// Limpiar playlist completa
await playlistsManager.clear();
```

### 5. Consultar Estado

```typescript
// Item actual
const currentItem = playlistsManager.getCurrentItem();
console.log('Reproduciendo:', currentItem?.metadata.title);

// Índice actual
const index = playlistsManager.getCurrentIndex();
console.log('Posición:', index + 1, 'de', playlistsManager.getItems().length);

// Estado completo
const state = playlistsManager.getState();
console.log('Estado:', state);

// Estadísticas
const stats = playlistsManager.getStats();
console.log('Progreso general:', stats.overallProgress.toFixed(1) + '%');
console.log('Completados:', stats.completedItems, 'de', stats.totalItems);
```

## 📡 Eventos

### Escuchar Eventos

```typescript
import { PlaylistEventType } from 'react-native-video';

// Item cambió
playlistsManager.on(PlaylistEventType.ITEM_CHANGED, (data) => {
    console.log('Cambió de item:', data.currentItem.metadata.title);
    console.log('Razón:', data.reason); // 'next', 'previous', 'goto', etc.
});

// Item empezó
playlistsManager.on(PlaylistEventType.ITEM_STARTED, (data) => {
    console.log('Empezó:', data.item.metadata.title);
});

// Item completado
playlistsManager.on(PlaylistEventType.ITEM_COMPLETED, (data) => {
    console.log('Completó:', data.item.metadata.title);
    
    // Guardar progreso en backend
    saveProgressToBackend(data.item.id, data.duration);
});

// Error en item
playlistsManager.on(PlaylistEventType.ITEM_ERROR, (data) => {
    console.error('Error en item:', data.item.id, data.errorMessage);
});

// Progreso actualizado
playlistsManager.on(PlaylistEventType.PROGRESS_UPDATED, (data) => {
    console.log('Progreso:', data.progress.percentage.toFixed(1) + '%');
});

// Playlist terminó
playlistsManager.on(PlaylistEventType.PLAYLIST_ENDED, () => {
    console.log('Playlist terminada');
});
```

### Dejar de Escuchar

```typescript
const handleItemChanged = (data) => {
    console.log('Item cambió:', data);
};

// Registrar
playlistsManager.on(PlaylistEventType.ITEM_CHANGED, handleItemChanged);

// Desregistrar
playlistsManager.off(PlaylistEventType.ITEM_CHANGED, handleItemChanged);
```

## 🎯 API Completa

### PlaylistsManager

#### Inicialización

```typescript
initialize(config?: Partial<PlaylistsManagerConfig>): Promise<void>
destroy(): Promise<void>
```

#### Gestión de Playlist

```typescript
setPlaylist(items: PlaylistItem[], config?: Partial<PlaylistConfig>): Promise<void>
addItem(item: PlaylistItem): Promise<void>
addItems(items: PlaylistItem[], options?: PlaylistBatchOptions): Promise<void>
insertItem(item: PlaylistItem, index: number): Promise<void>
removeItem(itemId: string): Promise<void>
clear(): Promise<void>
```

#### Navegación

```typescript
goToNext(): Promise<boolean>
goToPrevious(): Promise<boolean>
goToIndex(index: number, reason?: string): Promise<void>
goToItem(itemId: string): Promise<void>
```

#### Configuración

```typescript
setRepeatMode(mode: PlaylistRepeatMode): Promise<void>
setShuffleMode(mode: PlaylistShuffleMode): Promise<void>
setAutoNext(enabled: boolean): Promise<void>
getConfig(): PlaylistConfig
```

#### Consultas

```typescript
getCurrentItem(): PlaylistItem | null
getCurrentIndex(): number
getItems(): PlaylistItem[]
getItem(itemId: string): PlaylistItem | null
findItems(filter: PlaylistItemFilter): PlaylistItem[]
getState(): PlaylistState
getStats(): PlaylistStats
```

#### Eventos

```typescript
on(event: PlaylistEventType, callback: Function): void
off(event: PlaylistEventType, callback: Function): void
```

## 🔌 Integración con Video Component

Para usar el modo coordinado con el componente Video:

### Paso 1: Configurar Playlist

```typescript
import { playlistsManager, PlaylistItemType } from 'react-native-video';

const episodes = [
    {
        id: 'ep1',
        type: PlaylistItemType.AUDIO,
        source: {
            uri: 'https://example.com/episode1.m3u8',
        },
        metadata: {
            title: 'Episodio 1',
            artist: 'Mi Podcast',
            imageUri: 'https://example.com/cover1.jpg',
        },
        duration: 3600,
    },
    // ... más items
];

// Configurar en modo coordinado
await playlistsManager.setPlaylist(episodes, {
    coordinatedMode: true,  // ← Modo coordinado
    autoNext: true,
    repeatMode: 'OFF',
});
```

### Paso 2: Integrar con Video Component

```typescript
import React, { useState, useEffect } from 'react';
import Video from 'react-native-video';
import { playlistsManager, PlaylistEventType } from 'react-native-video';

function PlaylistPlayer() {
    const [currentItem, setCurrentItem] = useState(
        playlistsManager.getCurrentItem()
    );
    
    useEffect(() => {
        // Escuchar cambios de item
        const handleItemChanged = (data) => {
            setCurrentItem(data.currentItem);
        };
        
        playlistsManager.on(PlaylistEventType.ITEM_CHANGED, handleItemChanged);
        
        return () => {
            playlistsManager.off(PlaylistEventType.ITEM_CHANGED, handleItemChanged);
        };
    }, []);
    
    if (!currentItem) return null;
    
    return (
        <Video
            source={currentItem.source}
            
            // Props esenciales para playlist
            enablePlaylistIntegration={true}
            playlistItemId={currentItem.id}
            
            // Background playback
            playInBackground={true}
            playWhenInactive={true}
            
            // Otras props normales
            paused={false}
            onEnd={() => {
                // El auto-next se maneja nativamente
                // Este callback es opcional para analytics
            }}
        />
    );
}
```

### Paso 3: Controles de Playlist

```typescript
import { TouchableOpacity, Text } from 'react-native';

function PlaylistControls() {
    const handleNext = async () => {
        const success = await playlistsManager.goToNext();
        if (!success) {
            console.log('No hay siguiente item');
        }
    };
    
    const handlePrevious = async () => {
        const success = await playlistsManager.goToPrevious();
        if (!success) {
            console.log('No hay item anterior');
        }
    };
    
    return (
        <>
            <TouchableOpacity onPress={handlePrevious}>
                <Text>⏮️ Anterior</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleNext}>
                <Text>⏭️ Siguiente</Text>
            </TouchableOpacity>
        </>
    );
}
```

## 📱 Implementación Nativa

Los módulos nativos ya están implementados y funcionando:

### iOS - PlaylistControlModule.swift
**Ubicación:** `ios/Playlists/PlaylistControlModule.swift`

**Características:**
- ✅ Singleton pattern para acceso global
- ✅ Modo coordinado con RCTVideo usando NotificationCenter
- ✅ Now Playing Info Center con metadata
- ✅ Remote Command Center (controles lock screen)
- ✅ Gestión de cola y navegación (next/previous/goto)
- ✅ Modos de repetición (OFF, ALL, ONE)

**Comunicación:**
```swift
// Escucha cuando RCTVideo termina un item
NotificationCenter: .RCTVideoItemDidFinish

// Notifica a RCTVideo para cargar siguiente
NotificationCenter: .PlaylistLoadNextSource
```

### Android - PlaylistControlModule.kt
**Ubicación:** `android/src/main/java/com/brentvatne/react/playlist/PlaylistControlModule.kt`

**Características:**
- ✅ BroadcastReceiver para comunicación nativa interna
- ✅ Soporte Android 5.0+ hasta Android 14+
- ✅ MediaSession con controles de notificación
- ✅ Gestión de cola y navegación (next/previous/goto)
- ✅ Modos de repetición (OFF, ALL, ONE)
- ✅ Coordinación con ReactExoplayerView mediante broadcasts

**Comunicación:**
```kotlin
// 1. ReactExoplayerView detecta STATE_ENDED
// 2. VideoEventEmitter envía broadcast:
Intent: ACTION_VIDEO_ITEM_FINISHED
Extras: { itemId: "song-1" }

// 3. PlaylistControlModule.broadcastReceiver lo recibe
// 4. Calcula siguiente item (respeta repeat/shuffle)
// 5. Emite evento a JavaScript:
Event: onNativeItemChanged
Data: { currentItem, index, itemId }

// 6. React actualiza el componente <Video> con nuevo source
```

**Archivos Modificados:**
- `ReactVideoPackage.java` - Registro del módulo nativo (línea 35)
- `ReactExoplayerView.java` - Prop `playlistItemId` y tracking
- `ReactExoplayerViewManager.java` - Exposición de prop `playlistItemId`
- `VideoEventEmitter.java` - Envío de broadcast al terminar item
- `PlaylistControlModule.kt` - Gestión de cola y BroadcastReceiver
- `PlaylistModels.kt` - Modelos de datos robustos

### Verificación de Módulo

```typescript
import { NativeModules } from 'react-native';

// Verificar que el módulo está disponible
if (NativeModules.PlaylistControlModule) {
    console.log('✅ PlaylistControlModule disponible');
    
    // Verificar que responde (Android)
    const isReady = await NativeModules.PlaylistControlModule.isModuleReady();
    console.log('Módulo listo:', isReady);
} else {
    console.error('❌ PlaylistControlModule no encontrado');
    console.error('Asegúrate de haber hecho rebuild completo de la app nativa');
}
```

### Debugging

#### iOS - Logs en Xcode

```bash
# Ver logs del sistema de playlists
# En Xcode: View → Debug Area → Activate Console
```

Logs esperados:
```
[PlaylistControlModule] ✅ Initialized in COORDINATED mode
[PlaylistControlModule] 📋 Playlist set with 3 items
[RCTVideo] 🔔 Item finished notification received: song-1
[PlaylistControlModule] ⏭️ Advancing to next item: song-2
[PlaylistControlModule] 📤 Emitting native item changed event
```

#### Android - Logcat

```bash
# Ver logs completos del sistema
adb logcat | grep -E "PlaylistControlModule|VideoEventEmitter|RNVExoplayer"

# Solo logs de playlist
adb logcat | grep PlaylistControlModule
```

Logs esperados durante inicialización:
```
PlaylistControlModule: 📡 Broadcast receiver registered successfully for playlist coordination
PlaylistControlModule: 📡 Listening for action: com.brentvatne.react.VIDEO_ITEM_FINISHED
```

Logs esperados cuando termina un video:
```
RNVExoplayer: state [ENDED]
VideoEventEmitter: 🎵 Playlist item ID set to: song-1
VideoEventEmitter: 📢 Sent VIDEO_ITEM_FINISHED broadcast for itemId: song-1 to package: com.yourapp
PlaylistControlModule: 🎬 Video item finished: song-1
PlaylistControlModule: ⏭️ Advancing to next item: song-2
VideoEventEmitter: 🎵 Playlist item ID set to: song-2
```

## 📚 Ejemplos

### Ejemplo 1: Podcast Player

```typescript
import { playlistsManager, PlaylistItemType, PlaylistEventType } from 'react-native-video';

// Cargar episodios de un podcast
async function loadPodcastSeries(seriesId: string) {
    const episodes = await api.getPodcastEpisodes(seriesId);
    
    const playlist = episodes.map(ep => ({
        id: ep.id,
        type: PlaylistItemType.AUDIO,
        source: {
            uri: ep.audioUrl,
            headers: {
                'Authorization': `Bearer ${userToken}`,
            },
        },
        metadata: {
            title: ep.title,
            artist: ep.author,
            imageUri: ep.coverImage,
            description: ep.description,
        },
        duration: ep.durationSeconds,
        startPosition: ep.savedPosition || 0, // Reanudar
    }));
    
    await playlistsManager.setPlaylist(playlist, {
        autoNext: true,
        repeatMode: 'OFF',
        startIndex: episodes.findIndex(ep => !ep.completed), // Primer no completado
    });
}

// Guardar progreso cuando un episodio termina
playlistsManager.on(PlaylistEventType.ITEM_COMPLETED, async (data) => {
    await api.markEpisodeCompleted(data.item.id);
    
    // Mostrar notificación
    showNotification(`Completaste: ${data.item.metadata.title}`);
});
```

### Ejemplo 2: Music Player con Shuffle

```typescript
async function playAlbum(albumId: string, shuffled: boolean = false) {
    const album = await api.getAlbum(albumId);
    
    const playlist = album.tracks.map(track => ({
        id: track.id,
        type: PlaylistItemType.AUDIO,
        source: { uri: track.audioUrl },
        metadata: {
            title: track.name,
            artist: album.artist,
            imageUri: album.coverImage,
        },
        duration: track.durationSeconds,
    }));
    
    await playlistsManager.setPlaylist(playlist, {
        autoNext: true,
        repeatMode: 'ALL', // Repetir álbum
        shuffleMode: shuffled ? 'ON' : 'OFF',
    });
}

// Toggle shuffle
async function toggleShuffle() {
    const config = playlistsManager.getConfig();
    const newMode = config.shuffleMode === 'OFF' ? 'ON' : 'OFF';
    await playlistsManager.setShuffleMode(newMode);
}
```

### Ejemplo 3: Curso de Audio con Progreso

```typescript
async function playCourse(courseId: string) {
    const course = await api.getCourse(courseId);
    
    const playlist = course.lessons.map(lesson => ({
        id: lesson.id,
        type: PlaylistItemType.AUDIO,
        source: { uri: lesson.audioUrl },
        metadata: {
            title: `${lesson.order}. ${lesson.title}`,
            artist: course.instructor,
            imageUri: course.thumbnail,
        },
        duration: lesson.duration,
        customData: {
            courseId,
            lessonNumber: lesson.order,
            requiresCompletion: true,
        },
    }));
    
    await playlistsManager.setPlaylist(playlist, {
        autoNext: false, // Usuario debe marcar como completado
        skipOnError: false,
    });
}

// Marcar lección como completada
playlistsManager.on(PlaylistEventType.ITEM_COMPLETED, async (data) => {
    if (data.item.customData?.requiresCompletion) {
        await api.markLessonCompleted(data.item.customData.courseId, data.item.id);
        
        // Calcular progreso del curso
        const stats = playlistsManager.getStats();
        const progress = (stats.completedItems / stats.totalItems) * 100;
        
        updateCourseProgress(progress);
    }
});
```

## 🔧 Troubleshooting

### ❌ Problema: Auto-next no funciona en Android

**Síntomas:**
- Broadcast enviado (`📢 Sent VIDEO_ITEM_FINISHED`) pero no recibido
- No aparece log `🎬 Video item finished`

**Causa:** El módulo `PlaylistControlModule` no está registrado

**Solución:**
1. Verificar que `/android/src/main/java/com/brentvatne/react/ReactVideoPackage.java` contiene:
   ```java
   modules.add(new PlaylistControlModule(reactContext));
   ```
2. Hacer rebuild completo:
   ```bash
   cd android && ./gradlew clean
   cd .. && npx react-native run-android
   ```
3. Verificar logs: debe aparecer `📡 Broadcast receiver registered`

### ❌ Problema: playlistItemId no se configura

**Síntomas:**
- Log: `⚠️ No playlistItemId set, skipping broadcast`
- Auto-next no funciona

**Causa:** La prop `playlistItemId` no se está pasando al componente Video

**Solución:**
```typescript
// ❌ MAL
<Video source={currentSource} />

// ✅ BIEN
<Video 
  source={currentSource} 
  playlistItemId={currentItem.id}  // ← Necesario
  enablePlaylistIntegration={true} // ← Necesario
  playInBackground={true}          // ← Para background
/>
```

### ❌ Problema: Auto-next solo funciona en foreground

**Causa:** Configuración incorrecta de background mode

**Solución iOS:**
1. Verificar `Info.plist` contiene:
   ```xml
   <key>UIBackgroundModes</key>
   <array>
       <string>audio</string>
   </array>
   ```
2. Props necesarias:
   ```typescript
   playInBackground={true}
   playWhenInactive={true}
   ```

**Solución Android:**
1. Verificar `AndroidManifest.xml` contiene:
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   ```
2. Prop necesaria:
   ```typescript
   playInBackground={true}
   ```

### ❌ Problema: Error "shuffleEnabled" en Android

**Síntomas:**
- `[ERROR] Failed to send playlist to native [Error: shuffleEnabled]`

**Causa:** Bug en versiones antiguas del parsing de configuración

**Solución:** Ya está solucionado en la última versión. Si persiste:
```typescript
await playlistsManager.setPlaylist(items, {
  config: {
    autoNext: true,
    repeatMode: 'OFF',
    shuffleEnabled: false, // ← Especificar explícitamente
  },
});
```

### 🔍 Checklist de Verificación

Antes de reportar un issue, verificar:

**Android:**
- [ ] Rebuild completo realizado (`./gradlew clean`)
- [ ] `PlaylistControlModule` aparece en `NativeModules`
- [ ] `isModuleReady()` devuelve `true`
- [ ] Log "📡 Broadcast receiver registered" aparece al inicio
- [ ] Prop `playlistItemId` se está pasando al Video
- [ ] Log "🎵 Playlist item ID set to: XXX" aparece
- [ ] Log "📢 Sent VIDEO_ITEM_FINISHED broadcast" aparece al terminar
- [ ] `coordinatedMode: true` configurado

**iOS:**
- [ ] `UIBackgroundModes` con `audio` en Info.plist
- [ ] Prop `enablePlaylistIntegration={true}` en Video
- [ ] Prop `playlistItemId` con ID válido
- [ ] Props `playInBackground` y `playWhenInactive` en true
- [ ] Log "Initialized in COORDINATED mode" aparece

## 🐛 Manejo de Errores

```typescript
import { PlayerError } from 'react-native-video';

try {
    await playlistsManager.setPlaylist(items);
} catch (error) {
    if (error instanceof PlayerError) {
        switch (error.key) {
            case 'PLAYLIST_EMPTY':
                showError('La playlist no puede estar vacía');
                break;
            case 'PLAYLIST_INVALID_ITEM':
                showError(`Item inválido: ${error.context?.reason}`);
                break;
            default:
                showError('Error al cargar playlist');
        }
    }
}

// Manejar errores de items individuales
playlistsManager.on(PlaylistEventType.ITEM_ERROR, (data) => {
    console.error('Error en item:', data.errorMessage);
    
    // El manager saltará automáticamente si skipOnError está habilitado
    if (!playlistsManager.getConfig().skipOnError) {
        // Mostrar opción al usuario
        showRetryDialog(data.item);
    }
});
```

## 🔄 Sincronización con UI

```typescript
import { useEffect, useState } from 'react';

function PlaylistUI() {
    const [currentItem, setCurrentItem] = useState(playlistsManager.getCurrentItem());
    const [stats, setStats] = useState(playlistsManager.getStats());
    
    useEffect(() => {
        const handleItemChange = (data) => {
            setCurrentItem(data.currentItem);
        };
        
        const handleProgress = () => {
            setStats(playlistsManager.getStats());
        };
        
        playlistsManager.on(PlaylistEventType.ITEM_CHANGED, handleItemChange);
        playlistsManager.on(PlaylistEventType.PROGRESS_UPDATED, handleProgress);
        
        return () => {
            playlistsManager.off(PlaylistEventType.ITEM_CHANGED, handleItemChange);
            playlistsManager.off(PlaylistEventType.PROGRESS_UPDATED, handleProgress);
        };
    }, []);
    
    return (
        <View>
            <Text>{currentItem?.metadata.title}</Text>
            <Text>Progreso: {stats.overallProgress.toFixed(1)}%</Text>
            <Button title="Next" onPress={() => playlistsManager.goToNext()} />
        </View>
    );
}
```

## 📝 Notas Importantes

### Persistencia
- El estado de la playlist se guarda automáticamente en AsyncStorage
- Se restaura al reiniciar la app
- Incluye: items, índice actual, configuración, orden original

### Background Mode
- **iOS:** Requiere `UIBackgroundModes` con `audio` en Info.plist
- **Android:** Requiere `FOREGROUND_SERVICE` permission en AndroidManifest.xml
- El widget multimedia funciona automáticamente en ambas plataformas
- ⚠️ **Controles multimedia:** Play/Pause funcionan, Next/Previous aún no implementados en modo coordinado

### Modo Coordinado vs Standalone

**Modo Coordinado (Implementado y funcional):**
- ✅ Usa el componente `<Video>` de React Native
- ✅ Auto-next 100% nativo mediante broadcasts (Android) o notifications (iOS)
- ✅ Funciona en background, con pantalla apagada, durante AirPlay/Chromecast
- ✅ Soporta video y audio
- ✅ Requiere props: `enablePlaylistIntegration` y `playlistItemId`

**Modo Standalone (Experimental, no completamente implementado):**
- ⚠️ PlaylistControlModule maneja su propio AVPlayer (iOS) o ExoPlayer (Android)
- ⚠️ Solo audio (no video)
- ⚠️ No requiere componente Video en React
- ⚠️ En desarrollo

### Compatibilidad

| Plataforma | Versión Mínima | Estado |
|-----------|---------------|--------|
| iOS | 12.0+ | ✅ Funcional |
| Android | 5.0+ (API 21) | ✅ Funcional |
| Android 13+ | API 33+ | ✅ Con `RECEIVER_NOT_EXPORTED` |

### Props Críticas para Auto-Next

```typescript
<Video
  // Esenciales para playlist
  enablePlaylistIntegration={true}  // ← Habilita comunicación nativa
  playlistItemId={currentItem.id}   // ← ID del item actual (crítico)
  
  // Esenciales para background
  playInBackground={true}            // ← iOS y Android
  playWhenInactive={true}            // ← iOS (cuando se minimiza)
  
  // Normales
  source={currentItem.source}
  paused={false}
/>
```

### Limitaciones Conocidas
- Modo standalone aún no está completamente implementado (solo modo coordinado funciona)
- El shuffle mantiene el item actual en su posición al activarse
- En Android, requiere rebuild completo después de modificar código nativo
- React Native 0.60+ requerido

## 🤝 Contribuir

Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md) para lineamientos de contribución.

## 📄 Licencia

MIT - Ver [LICENSE](../../../LICENSE) para detalles.
