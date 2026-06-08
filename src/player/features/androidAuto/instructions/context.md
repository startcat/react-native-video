# Android Auto Integration - Contexto y Arquitectura

## Visión General

## Objetivo

Integrar Android Auto con `react-native-video` de forma:
- **Opcional:** No afecta apps que no lo usen
- **Mínimamente invasiva:** Sin modificar lógica core
- **Funcional con app cerrada:** Navegación Y reproducción sin JavaScript activo
- **Reproducción nativa:** ExoPlayer directo con notificación multimedia
- **Sincronizada**: Cambios en Android Auto se reflejan en móvil y viceversa

---

## Principios Fundamentales

### 1. **Integración Opcional**

```typescript
// ❌ NO DEBE SER OBLIGATORIO
import { AudioFlavour } from 'react-native-video';

// ✅ DEBE SER OPT-IN
import { AudioFlavour, AndroidAutoControl } from 'react-native-video';

// Solo si la app quiere Android Auto
AndroidAutoControl.enable();
```

**Reglas:**
- El módulo Android Auto NO se inicializa automáticamente
- Si no se usa, NO debe consumir recursos
- NO debe afectar el funcionamiento normal del reproductor
- Debe ser posible compilar sin soporte Android Auto

---

### 2. **Arquitectura Coordinada (No Standalone)**

```
┌─────────────────────────────────────────────────────────────┐
│                    MODO COORDINADO                          │
│  JavaScript es el cerebro, Android Auto es una UI más      │
└─────────────────────────────────────────────────────────────┘

    ANDROID AUTO UI          MÓVIL UI
    ┌──────────┐            ┌──────────┐
    │ Browse   │            │ Audio    │
    │ Now Play │            │ Flavour  │
    └────┬─────┘            └────┬─────┘
         │                       │
         └───────┬───────────────┘
                 ▼
         ┌──────────────┐
         │ MediaSession │ ◄─── Única fuente de verdad
         │ (VideoPlay   │
         │  backService)│
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │  ExoPlayer   │ ◄─── Controlado por <Video>
         │  (Único)     │
         └──────────────┘
                ▲
                │
         ┌──────┴───────┐
         │ JavaScript   │ ◄─── Controla todo
         │ AudioFlavour │
         └──────────────┘
```

**Reglas:**
- JavaScript SIEMPRE controla el reproductor (`<Video>` component)
- Android Auto es solo otra **interfaz de usuario**
- MediaSession es la **única fuente de verdad** del estado
- NO hay lógica de reproducción duplicada en nativo

---

### 3. **Mínimo Impacto en Código Existente**

**Archivos que NO deben modificarse:**
- ❌ `AudioFlavour/index.tsx` - Solo añadir hooks opcionales
- ❌ `VideoPlaybackService.kt` - Solo añadir método getter
- ❌ `ReactExoplayerView.java` - Sin cambios

**Archivos nuevos (aislados):**
- ✅ `src/player/features/androidAuto/` - Todo el código Android Auto
- ✅ `android/.../exoplayer/MediaBrowserService.kt` - Servicio aislado
- ✅ `android/.../exoplayer/AndroidAutoModule.kt` - Bridge aislado

**Regla de oro:**
> Si se elimina la carpeta `androidAuto/`, el reproductor debe seguir funcionando perfectamente.

---

## Arquitectura de Componentes

### **Capa 1: Servicio Nativo (Android)**

```kotlin
// MediaBrowserService.kt
// - Responde a solicitudes de Android Auto
// - NO gestiona reproducción directamente
// - Delega todo a JavaScript vía eventos

class MediaBrowserService : MediaLibraryService() {
    
    // Retorna MediaSession del VideoPlaybackService existente
    override fun onGetSession(...): MediaLibrarySession? {
        return VideoPlaybackService.getSharedMediaSession()
    }
    
    // Solicita contenido a JavaScript
    override fun onGetChildren(...) {
        sendEventToJS("onBrowseRequest", parentId)
        return waitForJSResponse()
    }
    
    // Notifica a JavaScript que usuario quiere reproducir
    override fun onPlayFromMediaId(...) {
        sendEventToJS("onPlayFromMediaId", mediaId)
    }
}
```

---

### **Capa 2: Bridge Nativo-JavaScript**

```kotlin
// AndroidAutoModule.kt
// - Expone API nativa a JavaScript
// - Emite eventos de Android Auto a JS
// - Recibe biblioteca de medios desde JS

class AndroidAutoModule : ReactContextBaseJavaModule() {
    
    @ReactMethod
    fun enable(promise: Promise) {
        // Inicializar MediaBrowserService
    }
    
    @ReactMethod
    fun setMediaLibrary(items: ReadableArray, promise: Promise) {
        // Guardar biblioteca para Android Auto
    }
    
    @ReactMethod
    fun updateNowPlaying(metadata: ReadableMap) {
        // Actualizar MediaSession
    }
    
    // Eventos emitidos a JS:
    // - onBrowseRequest(parentId)
    // - onSearchRequest(query)
    // - onPlayFromMediaId(mediaId)
}
```

---

### **Capa 3: API JavaScript**

```typescript
// AndroidAutoControl.ts
// - API simple para apps
// - Gestiona comunicación con módulo nativo
// - Registra callbacks de eventos

export class AndroidAutoControl {
    
    // Habilitar Android Auto
    static async enable(): Promise<void> {
        if (Platform.OS !== 'android') return;
        return AndroidAutoModule.enable();
    }
    
    // Configurar biblioteca de medios
    static async setMediaLibrary(items: MediaItem[]): Promise<void> {
        return AndroidAutoModule.setMediaLibrary(items);
    }
    
    // Actualizar metadata del contenido actual
    static updateNowPlaying(metadata: MediaMetadata): void {
        AndroidAutoModule.updateNowPlaying(metadata);
    }
    
    // Registrar callback cuando Android Auto solicita contenido
    static onBrowseRequest(callback: (parentId: string) => MediaItem[]): void {
        DeviceEventEmitter.addListener('onBrowseRequest', callback);
    }
    
    // Registrar callback cuando usuario selecciona item
    static onPlayFromMediaId(callback: (mediaId: string) => void): void {
        DeviceEventEmitter.addListener('onPlayFromMediaId', callback);
    }
}
```

---

### **Capa 4: Integración con AudioFlavour (Opcional)**

```typescript
// AudioFlavour/index.tsx
// - Hook opcional para Android Auto
// - Solo se activa si la app lo habilita

export function AudioFlavour(props: AudioFlavourProps) {
    
    // ... código existente sin cambios ...
    
    // ✅ HOOK OPCIONAL - Solo si app habilita Android Auto
    useAndroidAuto({
        enabled: props.androidAuto?.enabled,
        library: props.androidAuto?.library,
        onPlayFromMediaId: (mediaId) => {
            // Cargar contenido cuando usuario selecciona en Android Auto
            const item = findItemById(mediaId);
            loadContent(item);
        }
    });
    
    // ... resto del código sin cambios ...
}
```

---

## Flujos de Datos

### **Flujo 1: Navegación en Android Auto**

```
1. Usuario abre Android Auto
   ↓
2. Android Auto solicita contenido raíz
   ↓
3. MediaBrowserService.onGetChildren("root")
   ↓
4. AndroidAutoModule emite evento "onBrowseRequest"
   ↓
5. JavaScript recibe evento en callback registrado
   ↓
6. JavaScript retorna array de MediaItems
   ↓
7. AndroidAutoModule pasa items a MediaBrowserService
   ↓
8. Android Auto muestra lista de items
```

**Código:**
```typescript
// En la app
AndroidAutoControl.onBrowseRequest((parentId) => {
    if (parentId === 'root') {
        return [
            { id: 'podcasts', title: 'Podcasts', browsable: true },
            { id: 'music', title: 'Música', browsable: true },
            { id: 'recents', title: 'Recientes', browsable: true }
        ];
    }
    
    if (parentId === 'podcasts') {
        return myPodcastsList.map(p => ({
            id: p.id,
            title: p.title,
            artist: p.author,
            artworkUri: p.image,
            playable: true
        }));
    }
});
```

---

### **Flujo 2: Reproducción desde Android Auto**

```
1. Usuario selecciona item en Android Auto
   ↓
2. MediaBrowserService.onPlayFromMediaId(mediaId)
   ↓
3. AndroidAutoModule emite evento "onPlayFromMediaId"
   ↓
4. JavaScript recibe evento
   ↓
5. JavaScript carga contenido en <Video>
   ↓
6. <Video> actualiza ExoPlayer
   ↓
7. ExoPlayer actualiza MediaSession
   ↓
8. Android Auto muestra "Now Playing"
   ↓
9. Móvil también muestra contenido (sincronizado)
```

**Código:**
```typescript
// En la app
AndroidAutoControl.onPlayFromMediaId((mediaId) => {
    const item = findItemById(mediaId);
    
    // Cargar en el reproductor normal
    setSource({
        uri: item.uri,
        metadata: {
            title: item.title,
            subtitle: item.artist,
            imageUri: item.artworkUri
        }
    });
});
```

---

### **Flujo 3: Control desde Móvil (Sincronización)**

```
1. Usuario pulsa "Play" en móvil
   ↓
2. AudioFlavour llama refVideoPlayer.current?.resume()
   ↓
3. <Video> llama ExoPlayer.play()
   ↓
4. ExoPlayer actualiza MediaSession automáticamente
   ↓
5. MediaSession notifica a Android Auto
   ↓
6. Android Auto actualiza UI (▶ → ⏸)
   ↓
7. Ambas UIs sincronizadas ✅
```

**Código:**
```typescript
// AudioFlavour - Sin cambios necesarios
const onControlsPress = useCallback((action: CONTROL_ACTION) => {
    switch (action) {
        case CONTROL_ACTION.PLAY:
            refVideoPlayer.current?.resume();
            // ✅ MediaSession se actualiza automáticamente
            // ✅ Android Auto se sincroniza automáticamente
            break;
    }
}, []);
```

---

### **Flujo 4: Actualización de Metadata**

```
1. JavaScript carga nuevo contenido
   ↓
2. JavaScript llama AndroidAutoControl.updateNowPlaying()
   ↓
3. AndroidAutoModule actualiza MediaSession
   ↓
4. MediaSession notifica a Android Auto
   ↓
5. Android Auto muestra nueva metadata
   ↓
6. Móvil también muestra nueva metadata
```

**Código:**
```typescript
// AudioFlavour - Hook opcional
useEffect(() => {
    if (props.androidAuto?.enabled && isContentLoaded) {
        AndroidAutoControl.updateNowPlaying({
            title: props.playerMetadata?.title,
            artist: props.playerMetadata?.subtitle,
            artworkUri: props.playerMetadata?.imageUri,
            duration: sliderValues?.duration,
            position: currentTime
        });
    }
}, [isContentLoaded, props.playerMetadata, currentTime]);
```

---

## Casos de Uso

### **Caso 1: App sin Android Auto (Default)**

```typescript
// App.tsx
import { AudioFlavour } from 'react-native-video';

function App() {
    return (
        <AudioFlavour
            source={{ uri: 'https://...' }}
            playerMetadata={{ title: 'Podcast' }}
        />
    );
}

// ✅ Funciona perfectamente sin Android Auto
// ✅ No se inicializa MediaBrowserService
// ✅ Cero overhead
```

---

### **Caso 2: App con Android Auto (Opt-in)**

```typescript
// App.tsx
import { AudioFlavour, AndroidAutoControl } from 'react-native-video';

function App() {
    
    useEffect(() => {
        // Habilitar Android Auto
        AndroidAutoControl.enable();
        
        // Configurar biblioteca
        AndroidAutoControl.setMediaLibrary(myPodcasts);
        
        // Manejar reproducción desde Android Auto
        AndroidAutoControl.onPlayFromMediaId((mediaId) => {
            const item = findItemById(mediaId);
            setCurrentSource(item);
        });
    }, []);
    
    return (
        <AudioFlavour
            source={currentSource}
            playerMetadata={{ title: 'Podcast' }}
            androidAuto={{ enabled: true }}
        />
    );
}

// ✅ Android Auto habilitado
// ✅ Sincronización automática
// ✅ Navegación completa
```

---

### **Caso 3: App con Android Auto + Playlists**

```typescript
// App.tsx
import { AudioFlavour, AndroidAutoControl, playlistsManager } from 'react-native-video';

function App() {
    
    useEffect(() => {
        AndroidAutoControl.enable();
        
        // Sincronizar playlist con Android Auto
        AndroidAutoControl.setMediaLibrary(
            playlistItems.map(item => ({
                id: item.id,
                title: item.title,
                artist: item.artist,
                artworkUri: item.image,
                playable: true
            }))
        );
        
        // Cuando usuario selecciona en Android Auto
        AndroidAutoControl.onPlayFromMediaId((mediaId) => {
            const index = playlistItems.findIndex(i => i.id === mediaId);
            playlistsManager.goToIndex(index);
        });
        
    }, [playlistItems]);
    
    return (
        <AudioFlavour
            source={currentSource}
            playlistItem={currentPlaylistItem}
            androidAuto={{ enabled: true }}
        />
    );
}

// ✅ Playlist sincronizada con Android Auto
// ✅ Auto-next funciona en ambos lados
// ✅ Navegación por playlist desde Android Auto
```

---

## Arranque con App Cerrada

### **Estrategia: Navegación sin Reproducción (Opción A)**

**IMPORTANTE:** El componente `<Video>` es un componente funcional de React que requiere renderizado. No puede funcionar en modo headless sin UI tree activo.

### **Funcionalidad Disponible por Estado de App**

#### **App Cerrada (Solo Navegación):**
- ✅ **Navegar biblioteca** de medios (desde caché nativo)
- ✅ **Buscar contenido** (desde caché nativo)
- ✅ **Ver metadata** de items (títulos, artistas, artwork)
- ❌ **Reproducir contenido** (requiere `<Video>` component activo)
- ❌ **Controles de reproducción** (requiere ExoPlayer activo)

#### **App Activa (Funcionalidad Completa):**
- ✅ **Navegar biblioteca** (caché + actualización desde JS)
- ✅ **Buscar contenido** (resultados dinámicos desde JS)
- ✅ **Reproducir contenido** (usando `<Video>` existente)
- ✅ **Controles de reproducción** (play/pause/seek)
- ✅ **Sincronización** móvil ↔ Android Auto

---

### **Flujo: App Cerrada → Reproducción**

```
┌─────────────────────────────────────────────────────────────┐
│         FLUJO CUANDO APP ESTÁ CERRADA                       │
└─────────────────────────────────────────────────────────────┘

1. Usuario abre Android Auto
   ↓
2. MediaBrowserService arranca automáticamente
   ↓
3. Retorna biblioteca desde caché nativo (instantáneo)
   ↓
4. Usuario navega y ve contenido disponible
   ↓
5. Usuario selecciona item para reproducir
   ↓
6. MediaBrowserService detecta que app no está activa
   ↓
7. Abre MainActivity automáticamente (en background)
   ↓
8. MainActivity recibe mediaId a reproducir
   ↓
9. React Native se inicializa
   ↓
10. JavaScript carga contenido en <Video>
   ↓
11. ExoPlayer comienza reproducción
   ↓
12. MediaSession se actualiza
   ↓
13. Android Auto muestra "Now Playing"
   ↓
14. Usuario puede volver a Android Auto (app en background)
```

---

### **Flujo: App Activa → Reproducción**

```
┌─────────────────────────────────────────────────────────────┐
│          FLUJO CUANDO APP ESTÁ ACTIVA                       │
└─────────────────────────────────────────────────────────────┘

1. Usuario navega en Android Auto
   ↓
2. MediaBrowserService retorna caché + solicita actualización a JS
   ↓
3. JavaScript actualiza biblioteca si hay cambios
   ↓
4. Usuario selecciona item para reproducir
   ↓
5. MediaBrowserService detecta que app está activa
   ↓
6. Emite evento a JavaScript (sin abrir ventana)
   ↓
7. JavaScript carga contenido en <Video> inmediatamente
   ↓
8. Reproducción comienza
   ↓
9. Sincronización automática móvil ↔ Android Auto
```

---

### **Implementación: Detección y Apertura de App**

```kotlin
// MediaBrowserService.kt
class MediaBrowserService : MediaLibraryService() {
    
    private val cache = MediaCache(context)
    
    override fun onGetChildren(...): ListenableFuture<...> {
        // ✅ Navegación funciona sin app activa
        val cachedItems = cache.getChildren(parentId)
        
        // Actualizar en background si app está activa
        if (isAppActive()) {
            requestFreshDataFromJS(parentId)
        }
        
        return Futures.immediateFuture(
            LibraryResult.ofItemList(cachedItems, params)
        )
    }
    
    override fun onPlayFromMediaId(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String,
        extras: Bundle
    ): ListenableFuture<SessionResult> {
        
        if (isAppActive() && isJavaScriptReady()) {
            // ✅ App activa: notificar a JavaScript
            sendEventToJS("onPlayFromMediaId", mapOf("mediaId" to mediaId))
        } else {
            // ✅ App cerrada: abrir app en background
            openAppToPlay(mediaId)
        }
        
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }
    
    private fun isAppActive(): Boolean {
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        
        return appProcesses.any { 
            it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND 
            && it.processName == packageName 
        }
    }
    
    private fun openAppToPlay(mediaId: String) {
        // Abrir app en background (sin mostrar UI al usuario)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_NO_ANIMATION
            putExtra("ANDROID_AUTO_PLAY_MEDIA_ID", mediaId)
            putExtra("ANDROID_AUTO_BACKGROUND_START", true)
        }
        startActivity(intent)
    }
}
```

```kotlin
// MainActivity.kt
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Detectar si viene de Android Auto
    val mediaId = intent.getStringExtra("ANDROID_AUTO_PLAY_MEDIA_ID")
    val isBackgroundStart = intent.getBooleanExtra("ANDROID_AUTO_BACKGROUND_START", false)
    
    if (mediaId != null) {
        if (isBackgroundStart) {
            // No mostrar UI, solo inicializar reproductor
            // La app permanece en background
        }
        
        // Pasar a JavaScript para que cargue el contenido
        val params = Arguments.createMap().apply {
            putString("mediaId", mediaId)
        }
        sendEvent("androidAutoPlayRequest", params)
    }
}
```

```typescript
// App.tsx - Manejar reproducción desde Android Auto
useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
        'androidAutoPlayRequest',
        (data: { mediaId: string }) => {
            // Cargar contenido en el reproductor
            const item = findItemById(data.mediaId);
            setCurrentSource(item);
            
            // El reproductor comienza automáticamente
            // Android Auto muestra "Now Playing"
        }
    );
    
    return () => subscription.remove();
}, []);
```

---

### **Comportamiento con Pantalla Apagada**

**✅ SÍ, funciona con pantalla apagada:**

1. **Navegación**: Caché nativo responde sin necesidad de pantalla
2. **Reproducción**: App se abre en background sin encender pantalla
3. **Controles**: MediaSession funciona con pantalla apagada
4. **Sincronización**: ExoPlayer sigue activo en background

**Requisitos:**
- ✅ Permiso `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- ✅ VideoPlaybackService como foreground service
- ✅ Wake locks gestionados por ExoPlayer automáticamente
- ✅ Flag `FLAG_ACTIVITY_NO_ANIMATION` para no mostrar UI

**Flujo con pantalla apagada:**
```
Usuario en Android Auto (pantalla coche encendida)
    ↓
Selecciona contenido
    ↓
App móvil se abre en background (pantalla móvil apagada)
    ↓
ExoPlayer comienza reproducción
    ↓
Audio se reproduce correctamente
    ↓
Android Auto muestra controles
    ↓
Pantalla móvil permanece apagada ✅
```

---

## Solución Final Implementada

### **Reproducción Nativa Completa** ✅

**Decisión:** Reproducir directamente con ExoPlayer nativo, sin depender de React Native.

**Componentes clave:**
1. **GlobalPlayerManager** - Singleton con ExoPlayer compartido
2. **MediaCache con URIs** - Almacena URIs para reproducción directa
3. **VideoPlaybackService** - Foreground Service con notificación
4. **Audio Focus** - Configurado automáticamente en ExoPlayer

**Flujo completo (app cerrada):**
```
Usuario selecciona en Android Auto
    ↓
AndroidAutoMediaBrowserService.onAddMediaItems()
    ↓
MediaCache.getCachedItem(mediaId) → { mediaUri, title, artist }
    ↓
GlobalPlayerManager.playMedia(uri, metadata)
    ↓
ExoPlayer (main thread) → setMediaItem() + prepare() + play()
    ↓
GlobalPlayerManager.registerWithPlaybackService()
    ↓
VideoPlaybackService.registerPlayerForBackground()
    ↓
startForeground(notification)
    ↓
✅ Audio se reproduce
✅ Notificación multimedia aparece
✅ Android Auto muestra reproductor con controles
✅ Sincronización perfecta (mismo MediaSession)
```

**Ventajas de esta solución:**
- ✅ Funciona con app completamente cerrada
- ✅ No requiere abrir React Native
- ✅ Respuesta instantánea
- ✅ Notificación multimedia rica
- ✅ Audio focus manejado automáticamente
- ✅ Sincronización perfecta Android Auto ↔ Notificación
- ✅ Foreground Service mantiene playback vivo

**Ver:** [native-playback.md](./native-playback.md) para código completo

---

## Reglas de Implementación

### **DO's ✅**

1. **Aislar código Android Auto**
   - Todo en `src/player/features/androidAuto/`
   - Fácil de eliminar si no se necesita

2. **Usar GlobalPlayerManager**
   - Singleton compartido
   - Configurar audio attributes y focus
   - Ejecutar en main thread

3. **Guardar URIs en MediaCache**
   - Campo `mediaUri` en CachedMediaItem
   - Persistente en disco
   - Disponible sin JavaScript

4. **Registrar con VideoPlaybackService**
   - Usar `registerPlayerForBackground()`
   - Foreground Service con notificación
   - MediaSession con controles

5. **Sincronización automática**
   - MediaSession como fuente de verdad
   - Sin lógica duplicada

---

### **DON'Ts ❌**

1. **NO modificar lógica core**
   - AudioFlavour debe funcionar sin cambios
   - VideoPlaybackService solo añade getter

2. **NO duplicar estado**
   - Una sola fuente de verdad (MediaSession)
   - NO mantener estado en MediaBrowserService

3. **NO hacer obligatorio**
   - Debe ser opt-in
   - Cero impacto si no se usa

4. **NO gestionar reproducción en nativo**
   - JavaScript siempre controla <Video>
   - Nativo solo notifica eventos

5. **NO asumir JS siempre activo**
   - Implementar caché nativo
   - Modo headless para arranque

---

## Estructura de Archivos

```
react-native-video/
├── android/src/main/java/com/brentvatne/exoplayer/
│   ├── VideoPlaybackService.kt              [MODIFICAR - añadir getter]
│   ├── MediaBrowserService.kt               [NUEVO]
│   ├── MediaBrowserCallback.kt              [NUEVO]
│   ├── AndroidAutoModule.kt                 [NUEVO]
│   ├── AndroidAutoPackage.kt                [NUEVO]
│   └── MediaCache.kt                        [NUEVO]
│
├── android/src/main/res/xml/
│   └── automotive_app_desc.xml              [NUEVO]
│
├── android/src/main/AndroidManifest.xml     [MODIFICAR - añadir service]
│
├── src/player/features/androidAuto/
│   ├── instructions/
│   │   ├── context.md                       [ESTE ARCHIVO]
│   │   ├── architecture.md                  [SIGUIENTE]
│   │   └── implementation-steps.md          [SIGUIENTE]
│   │
│   ├── AndroidAutoControl.ts                [NUEVO]
│   ├── useAndroidAuto.ts                    [NUEVO]
│   ├── types.ts                             [NUEVO]
│   └── index.ts                             [NUEVO]
│
└── docs/
    └── android-auto-integration.md          [NUEVO]
```

---

## Próximos Pasos

1. ✅ **Contexto establecido** (este documento)
2. ⏳ **Arquitectura detallada** (`architecture.md`)
3. ⏳ **Pasos de implementación** (`implementation-steps.md`)
4. ⏳ **Implementación de componentes**
5. ⏳ **Testing y documentación**

---

## Resumen Ejecutivo

**Android Auto en react-native-video será:**

- 🎯 **Opcional**: Opt-in, no afecta apps existentes
- 🏗️ **Coordinado**: JavaScript controla, Android Auto es UI adicional
- 🔄 **Sincronizado**: Cambios en tiempo real entre móvil y Android Auto
- 📦 **Aislado**: Código independiente, fácil de mantener/eliminar
- ⚡ **Rápido**: Caché nativo + modo headless
- 🎨 **Completo**: Navegación, búsqueda, now playing

**Sin romper nada existente.**
