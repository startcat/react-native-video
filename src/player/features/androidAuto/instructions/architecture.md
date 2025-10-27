# Android Auto - Arquitectura Detallada

## Componentes del Sistema

### **1. MediaBrowserService (Nativo)**
- Interfaz entre Android Auto y el reproductor
- Gestiona navegación de contenido
- Retorna MediaSession compartida
- Implementa caché para respuesta rápida

### **2. MediaBrowserCallback (Nativo)**
- Maneja comandos de reproducción desde Android Auto
- Notifica a JavaScript cuando usuario selecciona contenido
- Delega comandos básicos (play/pause) a MediaSession

### **3. MediaCache (Nativo)**
- Almacena biblioteca de medios en SharedPreferences
- Respuesta instantánea sin esperar JavaScript
- Actualización en background cuando JS está activo

### **4. AndroidAutoModule (Bridge)**
- Expone métodos nativos a JavaScript
- Emite eventos de Android Auto a JS
- Gestiona comunicación bidireccional

### **5. AndroidAutoControl (JavaScript)**
- API simple para apps
- Registra callbacks de eventos
- Actualiza biblioteca y metadata

---

## Flujos Principales

### **Navegación en Android Auto**
```
Usuario → Android Auto → MediaBrowserService.onGetChildren()
    ↓
Retorna caché inmediatamente
    ↓
En background: solicita actualización a JS
    ↓
JS responde con items frescos
    ↓
Actualiza caché y notifica cambios
```

### **Reproducción desde Android Auto**
```
Usuario selecciona item → onPlayFromMediaId()
    ↓
Emite evento a JavaScript
    ↓
JS carga contenido en <Video>
    ↓
ExoPlayer actualiza MediaSession
    ↓
Android Auto muestra Now Playing
```

### **Sincronización Móvil ↔ Android Auto**
```
Usuario en móvil pulsa Play
    ↓
AudioFlavour → <Video> → ExoPlayer
    ↓
MediaSession detecta cambio
    ↓
Android Auto actualiza UI automáticamente
```

---

## Integración con Código Existente

### **VideoPlaybackService (Modificación Mínima)**
```kotlin
// Solo añadir getter estático
companion object {
    private var sharedMediaSession: MediaSession? = null
    
    fun getSharedMediaSession(): MediaSession? = sharedMediaSession
}
```

### **AudioFlavour (Hook Opcional)**
```typescript
// Hook opcional que no afecta funcionalidad base
useAndroidAuto({
    enabled: props.androidAuto?.enabled,
    onPlayFromMediaId: (mediaId) => loadContent(mediaId)
});
```

---

## Arranque con App Cerrada

### **Estrategia: Navegación + Abrir App (Opción A)**

**Limitación:** El componente `<Video>` requiere renderizado React. No funciona en headless mode.

**Solución:** Separar navegación (sin app) de reproducción (con app).

### **Navegación sin App:**
```kotlin
override fun onGetChildren(...) {
    // ✅ Retorna caché nativo inmediatamente
    val cached = mediaCache.getChildren(parentId)
    
    // Si app está activa, actualizar en background
    if (isAppActive()) {
        requestFreshDataFromJS(parentId)
    }
    
    return Futures.immediateFuture(cached)
}
```

### **Reproducción Abre App:**
```kotlin
override fun onPlayFromMediaId(...) {
    if (isAppActive()) {
        // App activa: notificar a JS
        sendEventToJS("onPlayFromMediaId", mediaId)
    } else {
        // App cerrada: abrir en background
        openAppToPlay(mediaId)
    }
}

private fun openAppToPlay(mediaId: String) {
    val intent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                Intent.FLAG_ACTIVITY_NO_ANIMATION
        putExtra("ANDROID_AUTO_PLAY_MEDIA_ID", mediaId)
        putExtra("ANDROID_AUTO_BACKGROUND_START", true)
    }
    startActivity(intent)
}
```

**Ventajas:**
- ✅ Navegación instantánea sin app
- ✅ Reproducción usa arquitectura existente
- ✅ Funciona con pantalla apagada
- ✅ Sin duplicación de lógica
- ✅ UX estándar de Android Auto

---

## Reglas de Implementación

### **✅ DO's**
- Aislar código en `androidAuto/`
- Reutilizar MediaSession existente
- Usar eventos para comunicación
- Implementar caché nativo
- Hacer opt-in, no obligatorio

### **❌ DON'Ts**
- NO modificar lógica core
- NO duplicar estado
- NO gestionar reproducción en nativo
- NO asumir JS siempre activo
- NO hacer obligatorio

---

Ver `implementation-steps.md` para pasos detallados de implementación.
