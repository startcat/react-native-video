# Android Auto - Arquitectura Detallada

> **Ver también:** [native-playback.md](./native-playback.md) para detalles de implementación completa.

## Componentes del Sistema

### **1. AndroidAutoMediaBrowserService (Nativo)**
- Interfaz entre Android Auto y el reproductor
- Gestiona navegación de contenido
- MediaSession conectado a GlobalPlayerManager
- Reproduce directamente desde URIs en cache

### **2. GlobalPlayerManager (Nativo - Nuevo)**
- Singleton con ExoPlayer compartido
- Reproduce media directamente desde URI
- Se registra con VideoPlaybackService
- Maneja audio focus automáticamente

### **3. MediaCache (Nativo)**
- Almacena biblioteca de medios en disco (SharedPreferences)
- Incluye URIs para reproducción directa
- Respuesta instantánea sin esperar JavaScript
- Persistente entre reinicios

### **4. VideoPlaybackService (Existente)**
- Foreground Service con notificación multimedia
- MediaSession con controles (Play/Pause/Seek)
- Mantiene playback vivo en background
- Integración con Now Playing

### **5. AndroidAutoModule (Bridge)**
- Expone métodos nativos a JavaScript
- Emite eventos de Android Auto a JS (opcional)
- Gestiona comunicación bidireccional

### **6. AndroidAutoControl (JavaScript)**
- API simple para apps
- Configura biblioteca con URIs
- Registra callbacks de eventos (opcional)
- Actualiza metadata

---

## Flujos Principales

### **Navegación en Android Auto (App Cerrada)**
```
Usuario → Android Auto → onGetChildren()
    ↓
MediaCache.getChildren() desde disco
    ↓
Retorna items inmediatamente
    ↓
✅ Navegación funciona sin app
```

### **Reproducción desde Android Auto (App Cerrada)**
```
Usuario selecciona item → onAddMediaItems()
    ↓
MediaCache.getCachedItem(mediaId)
    ↓
Obtiene: { mediaUri, title, artist, artworkUri }
    ↓
GlobalPlayerManager.playMedia(uri, metadata)
    ↓
ExoPlayer.setMediaItem() + prepare() + play()
    ↓
GlobalPlayerManager.registerWithPlaybackService()
    ↓
VideoPlaybackService.registerPlayerForBackground()
    ↓
startForeground(notification)
    ↓
✅ Audio se reproduce
✅ Notificación multimedia aparece
✅ Android Auto muestra reproductor
```

### **Sincronización Automática**
```
MediaSession de AndroidAutoMediaBrowserService
    ↓
Conectado a GlobalPlayerManager.player
    ↓
Cambios en player → MediaSession → Android Auto
    ↓
Controles en Android Auto → MediaSession → Player
    ↓
✅ Sincronización perfecta
```

---

## Integración con Código Existente

### **VideoPlaybackService (Nuevo Método)**
```kotlin
// Método para registrar player sin Activity
fun registerPlayerForBackground(player: ExoPlayer) {
    registerPlayerInternal(player, null)
}

private fun registerPlayerInternal(player: ExoPlayer, from: Class<Activity>?) {
    // Crear MediaSession
    // Iniciar Foreground Service
    // Mostrar notificación multimedia
}
```

### **GlobalPlayerManager (Nuevo)**
```kotlin
object GlobalPlayerManager {
    fun getOrCreatePlayer(context: Context): ExoPlayer
    fun playMedia(context, uri, title, artist, artworkUri)
    fun pause()
    fun play()
    fun release()
}
```

### **AndroidAutoProvider (JavaScript - Opcional)**
```typescript
// Provider global que configura Android Auto
<AndroidAutoProvider>
  <App />
</AndroidAutoProvider>

// Configura biblioteca con URIs
AndroidAutoControl.setMediaLibrary([
  {
    id: 'podcast_1',
    title: 'Episodio 1',
    uri: 'https://example.com/audio.mp3', // ← IMPORTANTE
    artist: 'Host',
    artworkUri: 'https://example.com/image.jpg',
    playable: true
  }
]);
```

---

## Reproducción Nativa Completa

### **Estrategia Final: Reproducción Nativa (Implementada)**

**Solución:** Reproducción completamente nativa usando ExoPlayer directamente.

### **Navegación sin App:**
```kotlin
override fun onGetChildren(...) {
    // ✅ Retorna caché desde disco inmediatamente
    val cached = mediaCache.getChildren(parentId)
    return Futures.immediateFuture(cached)
}
```

### **Reproducción Nativa:**
```kotlin
override fun onAddMediaItems(...) {
    val cachedItem = mediaCache.getCachedItem(mediaId)
    
    if (cachedItem?.mediaUri != null) {
        // ✅ Reproducir directamente desde cache
        GlobalPlayerManager.playMedia(
            context = this@AndroidAutoMediaBrowserService,
            uri = cachedItem.mediaUri,
            title = cachedItem.title,
            artist = cachedItem.artist,
            artworkUri = cachedItem.artworkUri
        )
        
        // Opcional: notificar a JavaScript si está activo
        if (module?.isJavaScriptReady() == true) {
            notifyJavaScriptPlayRequest(mediaId)
        }
    }
    
    return Futures.immediateFuture(mediaItems)
}
```

**Ventajas:**
- ✅ Navegación instantánea sin app
- ✅ Reproducción sin abrir React Native
- ✅ Funciona con app completamente cerrada
- ✅ Notificación multimedia rica
- ✅ Sincronización perfecta Android Auto ↔ Notificación
- ✅ Audio focus manejado automáticamente
- ✅ Foreground Service mantiene playback vivo

---

## Reglas de Implementación

### **✅ DO's**
- Aislar código en `androidAuto/`
- Usar GlobalPlayerManager para reproducción
- Guardar URIs en MediaCache
- Configurar audio focus en ExoPlayer
- Registrar con VideoPlaybackService
- Hacer opt-in, no obligatorio

### **❌ DON'Ts**
- NO modificar lógica core del player
- NO duplicar estado de reproducción
- NO asumir JS siempre activo
- NO hacer obligatorio
- NO olvidar audio attributes

---

## Documentos Relacionados

- **[native-playback.md](./native-playback.md)** - Implementación completa con código
- **[implementation-steps.md](./implementation-steps.md)** - Pasos de implementación
- **[context.md](./context.md)** - Contexto y decisiones de diseño
