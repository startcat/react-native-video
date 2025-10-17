# Arquitectura del Sistema de Playlists - Separación de Modos

## 🎯 Principio Fundamental

**Los modos Coordinated y Standalone son COMPLETAMENTE INDEPENDIENTES y NO deben mezclarse.**

---

## 📊 Tabla Comparativa

| Aspecto | Modo Coordinated | Modo Standalone |
|---------|------------------|-----------------|
| **Player** | Componente `<Video>` de React Native | ExoPlayer nativo interno |
| **Control de reproducción** | JavaScript (Flavour) | Módulo nativo |
| **Detección de finalización** | Broadcast desde ReactExoplayerView | Listener interno del ExoPlayer |
| **Cambio de source** | JavaScript actualiza prop `source` | Módulo nativo carga directamente |
| **Auto-advance** | Módulo nativo emite evento → JS actualiza source | Módulo nativo carga siguiente automáticamente |
| **Broadcast receiver** | ✅ Necesario | ❌ No se usa |
| **Eventos a JavaScript** | ✅ Siempre | ⚠️ Opcional (si app activa) |

---

## 🔄 Modo Coordinated - Flujo Completo

### Inicialización
```
1. JavaScript: playlistsManager.setPlaylist(items, { coordinatedMode: true })
2. Módulo nativo: Guarda playlist y configuración
3. Módulo nativo: Registra broadcast receiver para ACTION_VIDEO_ITEM_FINISHED
4. JavaScript: Renderiza <Video> con source del item actual
```

### Reproducción de Item
```
1. <Video> reproduce el item con playlistItemId
2. Usuario/app interactúa normalmente con el player
3. JavaScript controla play/pause/seek directamente en <Video>
```

### Finalización de Item (TUDUM)
```
1. ReactExoplayerView detecta Player.STATE_ENDED
2. ReactExoplayerView envía broadcast ACTION_VIDEO_ITEM_FINISHED con itemId
3. PlaylistControlModule recibe broadcast
4. PlaylistControlModule verifica: ¿Es TUDUM? → SÍ
5. PlaylistControlModule llama advanceToNextItem()
6. PlaylistControlModule actualiza currentIndex
7. PlaylistControlModule emite evento onPlaylistItemChanged a JavaScript
8. PlaylistsManager recibe evento nativo
9. PlaylistsManager emite evento local ITEM_CHANGED
10. Audio Flavour escucha evento
11. Audio Flavour actualiza source prop del <Video>
12. <Video> carga y reproduce el nuevo source
```

### Finalización de Item (Contenido Normal con autoNext: true)
```
1-7. [Igual que TUDUM]
8. PlaylistsManager recibe evento nativo
9. PlaylistsManager emite evento local ITEM_CHANGED
10. Audio Flavour escucha evento
11. Audio Flavour actualiza source prop del <Video>
12. <Video> carga y reproduce el nuevo source
```

### Finalización de Item (Contenido Normal con autoNext: false)
```
1. ReactExoplayerView detecta Player.STATE_ENDED
2. ReactExoplayerView envía broadcast ACTION_VIDEO_ITEM_FINISHED con itemId
3. PlaylistControlModule recibe broadcast
4. PlaylistControlModule verifica: ¿Es TUDUM o autoNext? → NO
5. PlaylistControlModule NO avanza
6. Reproducción se detiene
```

---

## 🎮 Modo Standalone - Flujo Completo

### Inicialización
```
1. JavaScript: playlistsManager.setPlaylist(items, { coordinatedMode: false })
2. Módulo nativo: Guarda playlist y configuración
3. Módulo nativo: Crea ExoPlayer interno (setupStandaloneMode)
4. Módulo nativo: Registra listener en ExoPlayer
5. Módulo nativo: Carga primer item (loadCurrentItem)
6. JavaScript: NO renderiza <Video>
```

### Reproducción de Item
```
1. ExoPlayer nativo reproduce el item
2. Módulo nativo controla play/pause/seek
3. JavaScript puede llamar PlaylistControl.play/pause/etc
4. Widget multimedia muestra controles nativos
```

### Finalización de Item (TUDUM)
```
1. ExoPlayer listener detecta Player.STATE_ENDED
2. Listener llama handleItemCompletionInStandaloneMode()
3. PlaylistControlModule verifica: ¿Es TUDUM? → SÍ
4. PlaylistControlModule llama advanceToNextItem()
5. PlaylistControlModule actualiza currentIndex
6. PlaylistControlModule emite evento onPlaylistItemChanged (si app activa)
7. PlaylistControlModule llama loadCurrentItem()
8. ExoPlayer nativo carga y reproduce el nuevo item
9. Widget multimedia se actualiza automáticamente
```

### Finalización de Item (Contenido Normal con autoNext: true)
```
1-9. [Igual que TUDUM]
```

### Finalización de Item (Contenido Normal con autoNext: false)
```
1. ExoPlayer listener detecta Player.STATE_ENDED
2. Listener llama handleItemCompletionInStandaloneMode()
3. PlaylistControlModule verifica: ¿Es TUDUM o autoNext? → NO
4. PlaylistControlModule NO avanza
5. Reproducción se detiene
6. Widget multimedia muestra estado detenido
```

---

## ⚠️ Errores Comunes por Mezcla de Conceptos

### ❌ ERROR 1: Enviar broadcasts en modo coordinated desde goToIndex()

**Problema:**
```kotlin
// ❌ INCORRECTO
if (config.coordinatedMode) {
    sendLoadNextSourceBroadcast(item)  // Nadie escucha esto!
}
```

**Razón:** En modo coordinated, JavaScript debe actualizar el source del `<Video>` al recibir el evento `onPlaylistItemChanged`. No hay ningún receiver escuchando broadcasts de "load next source".

**Correcto:**
```kotlin
// ✅ CORRECTO
if (config.coordinatedMode) {
    emitItemChanged(item, index, previousIndex)
    // JavaScript manejará la actualización del source
}
```

---

### ❌ ERROR 2: Registrar broadcast receiver en modo standalone

**Problema:**
```kotlin
// ❌ INCORRECTO - Siempre registrado
init {
    reactContext.registerReceiver(broadcastReceiver, filter)
}
```

**Razón:** En modo standalone no hay ReactExoplayerView que envíe broadcasts. El receiver nunca recibirá nada.

**Correcto:**
```kotlin
// ✅ CORRECTO - Solo en coordinated
fun setPlaylist(items: List, config: Config) {
    if (config.coordinatedMode && !receiverRegistered) {
        registerBroadcastReceiver()
    } else if (!config.coordinatedMode && receiverRegistered) {
        unregisterBroadcastReceiver()
    }
}
```

---

### ❌ ERROR 3: Intentar controlar ExoPlayer standalone desde JavaScript

**Problema:**
```typescript
// ❌ INCORRECTO - En modo standalone
<Video
    source={{ uri }}
    paused={paused}  // No tiene efecto
    onProgress={...} // No se llama
/>
```

**Razón:** En modo standalone no hay componente `<Video>`. El ExoPlayer es interno del módulo nativo.

**Correcto:**
```typescript
// ✅ CORRECTO - Usar PlaylistControl
await PlaylistControl.play();
await PlaylistControl.pause();
```

---

### ❌ ERROR 4: Esperar eventos de JavaScript en modo standalone con app en background

**Problema:**
```typescript
// ❌ INCORRECTO - No funcionará en background
playlistsManager.on('itemChanged', (event) => {
    // Esta lógica NO se ejecuta si app está en background
    updateUI(event.currentItem);
});
```

**Razón:** Cuando la app está en background, JavaScript está suspendido. Los eventos nativos se emiten pero nadie los recibe.

**Correcto:**
```kotlin
// ✅ CORRECTO - Lógica en nativo
private fun advanceToNextItem() {
    // Toda la lógica crítica aquí
    loadCurrentItem()  // Carga directamente
    updateMediaSession()  // Actualiza widget
    // Emitir evento es opcional (solo si app vuelve a foreground)
}
```

---

## 📝 Checklist de Implementación

### Al implementar funcionalidad en PlaylistControlModule:

- [ ] ¿Esta funcionalidad es para coordinated, standalone, o ambos?
- [ ] Si es para coordinated: ¿Emito evento para que JavaScript actúe?
- [ ] Si es para standalone: ¿Manejo todo en nativo sin depender de JavaScript?
- [ ] ¿Estoy enviando broadcasts que nadie escucha?
- [ ] ¿Estoy registrando receivers que no se usarán?
- [ ] ¿La lógica funciona con JavaScript suspendido (background)?

### Al implementar funcionalidad en Flavour:

- [ ] ¿Estoy en modo coordinated o standalone?
- [ ] Si es coordinated: ¿Escucho eventos del PlaylistsManager?
- [ ] Si es coordinated: ¿Actualizo el source del `<Video>` cuando cambia el item?
- [ ] Si es standalone: ¿Uso PlaylistControl en lugar de `<Video>`?
- [ ] ¿Manejo correctamente el caso de app en background?

---

## 🎯 Reglas de Oro

1. **Coordinated = JavaScript controla, Nativo detecta**
   - Nativo escucha finalización → emite evento
   - JavaScript recibe evento → actualiza source
   - `<Video>` reproduce el nuevo source

2. **Standalone = Nativo controla todo**
   - Nativo detecta finalización → carga siguiente
   - JavaScript solo observa (si está activo)
   - No hay `<Video>`, solo ExoPlayer interno

3. **Broadcasts solo en Coordinated**
   - ReactExoplayerView → PlaylistControlModule
   - Un solo broadcast: `ACTION_VIDEO_ITEM_FINISHED`
   - Solo cuando item termina

4. **Eventos siempre se emiten**
   - Tanto en coordinated como standalone
   - JavaScript los recibe si está activo
   - Si está en background, se pierden (no importa en standalone)

5. **TUDUMs siempre auto-advance**
   - En ambos modos
   - Independiente de `autoNext`
   - Sin intervención del usuario

---

**Última actualización:** 2025-10-17  
**Versión:** 1.0.0
