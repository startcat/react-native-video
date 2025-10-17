# Modos de Operación y Reglas - Sistema de Playlists

> **Nota:** Este documento complementa `context.md`. Léelo primero para entender la arquitectura general.

---

## 🎭 Modos de Operación

### Modo Coordinated (Coordinado)

**Descripción:**
El PlaylistsManager (TypeScript) controla qué item se reproduce, mientras que el módulo nativo gestiona la detección de finalización y auto-advance en background.

**Características:**
- ✅ El componente `<Video>` reproduce el contenido
- ✅ PlaylistsManager decide qué item cargar
- ✅ Módulo nativo escucha broadcasts de finalización
- ✅ Auto-advance automático para TUDUMs
- ✅ Funciona con video y audio
- ✅ Compatible con AirPlay, Chromecast
- ✅ Widget multimedia completo
- ✅ Reproducción en background

**Flujo de trabajo:**
```
1. PlaylistsManager envía playlist al módulo nativo
2. PlaylistsManager indica qué item reproducir
3. <Video> reproduce el item con playlistItemId
4. Item termina → <Video> envía broadcast
5. Módulo nativo recibe broadcast
6. Si es TUDUM → auto-advance automático
7. Módulo nativo emite evento onItemChanged
8. PlaylistsManager recibe evento y actualiza UI
```

**Configuración:**
```typescript
await playlistsManager.setPlaylist(items, {
    coordinatedMode: true,  // ← Modo coordinado
    autoNext: true,
});

<Video
    source={{ uri: currentItem.uri }}
    enablePlaylistIntegration={true}  // ← Habilita integración
    playlistItemId={currentItem.id}   // ← ID del item
    playInBackground={true}
/>
```

**Cuándo usar:**
- Apps con componente `<Video>` visible
- Reproducción de video con audio
- Necesitas UI de React Native
- Quieres controlar la reproducción desde JavaScript
- Necesitas auto-advance en background

---

### Modo Standalone (Autónomo)

**Descripción:**
El módulo nativo gestiona completamente la playlist y la reproducción, sin intervención de JavaScript. Usa su propio player interno (AVPlayer en iOS, ExoPlayer en Android).

**Características:**
- ✅ Player nativo interno (AVPlayer/ExoPlayer)
- ✅ Control 100% nativo
- ✅ No requiere componente `<Video>`
- ✅ Ideal para audio puro
- ✅ Funciona completamente en background
- ✅ Widget multimedia completo
- ✅ Compatible con Android Auto / CarPlay
- ✅ Menor consumo de batería

**Flujo de trabajo:**
```
1. PlaylistsManager envía playlist al módulo nativo
2. Módulo nativo crea su propio player
3. Módulo nativo reproduce el item actual
4. Item termina → Módulo nativo detecta internamente
5. Auto-advance automático (si está habilitado)
6. Módulo nativo reproduce siguiente item
7. Módulo nativo emite evento onItemChanged
8. Si app está en foreground → PlaylistsManager recibe evento
   Si app está en background → Widget se actualiza
```

**Configuración:**
```typescript
await playlistsManager.setPlaylist(items, {
    coordinatedMode: false,  // ← Modo standalone
    autoNext: true,
});

// No se necesita componente <Video>
// El módulo nativo gestiona todo
await PlaylistControl.play();
```

**Cuándo usar:**
- Apps de audio puro (podcasts, música)
- No necesitas video
- Quieres máxima eficiencia en background
- Android Auto / CarPlay como prioridad
- Menor consumo de recursos

---

## ⚖️ Reglas Fundamentales

### 1. **Tudum es un Item Más de la Playlist**

**❌ INCORRECTO (Sistema antiguo):**
```typescript
// Gestión manual del tudum
if (hasTudum && !tudumPlayed) {
    playTudum();
} else {
    playContent();
}
```

**✅ CORRECTO (Sistema actual):**
```typescript
// Tudum como primer item de la playlist
const items = [
    { id: 'tudum', type: 'TUDUM', uri: 'tudum.mp4' },
    { id: 'content', type: 'CONTENT', uri: 'video.mp4' },
];
await playlistsManager.setPlaylist(items);
```

**Razón:** El módulo nativo detecta automáticamente TUDUMs y hace auto-advance sin JavaScript.

---

### 2. **Modo Coordinated: JavaScript Controla, Nativo Detecta**

**Responsabilidades:**
- **JavaScript (PlaylistsManager):**
  - Decide qué item reproducir
  - Mantiene el estado de la playlist
  - Actualiza la UI
  
- **Nativo (PlaylistControlModule):**
  - Escucha broadcasts de finalización
  - Detecta TUDUMs y hace auto-advance
  - Emite eventos de cambio de item

**❌ INCORRECTO:**
```typescript
// Intentar hacer auto-advance desde JavaScript en background
onEnd={() => {
    playlistsManager.next(); // ❌ No funciona en background
}}
```

**✅ CORRECTO:**
```typescript
// El módulo nativo hace auto-advance automáticamente
// JavaScript solo escucha el evento
playlistsManager.on('itemChanged', (event) => {
    // Actualizar UI con el nuevo item
    setCurrentItem(event.currentItem);
});
```

---

### 3. **Modo Standalone: Nativo Controla Todo**

**Responsabilidades:**
- **Nativo (PlaylistControlModule):**
  - Gestiona su propio player (AVPlayer/ExoPlayer)
  - Reproduce los items
  - Detecta finalización internamente
  - Auto-advance automático
  - Emite eventos

- **JavaScript (PlaylistsManager):**
  - Solo envía la playlist inicial
  - Escucha eventos (si app está activa)
  - Actualiza UI (si app está activa)

**❌ INCORRECTO:**
```typescript
// Intentar controlar reproducción desde JavaScript
<Video source={{ uri }} /> // ❌ No se usa en standalone
```

**✅ CORRECTO:**
```typescript
// Control mediante PlaylistControl
await PlaylistControl.play();
await PlaylistControl.pause();
await PlaylistControl.next();
```

---

### 4. **Broadcast de Finalización (Android) - CRÍTICO**

**Regla crítica:** Cuando un item termina, el componente Video **DEBE** enviar un broadcast.

**Implementación en ReactExoplayerView.java:**
```java
case Player.STATE_ENDED:
    eventEmitter.end();
    
    // ✅ CRÍTICO: Enviar broadcast para playlist
    if (playlistItemId != null) {
        Intent intent = new Intent("com.brentvatne.react.VIDEO_ITEM_FINISHED");
        intent.putExtra("itemId", playlistItemId);
        themedReactContext.sendBroadcast(intent);
        DebugLog.d(TAG, "📻 Broadcast sent - Video item finished: " + playlistItemId);
    }
    break;
```

**Razón:** El PlaylistControlModule escucha este broadcast para hacer auto-advance en modo coordinated.

**⚠️ ADVERTENCIA:** Si este broadcast no se envía, el auto-advance NO funcionará en Android.

---

### 5. **PlaylistItemId es Obligatorio en Modo Coordinated**

**❌ INCORRECTO:**
```typescript
<Video source={{ uri }} /> // ❌ Falta playlistItemId
```

**✅ CORRECTO:**
```typescript
<Video
    source={{ uri }}
    enablePlaylistIntegration={true}
    playlistItemId={currentItem.id}  // ✅ Obligatorio
/>
```

**Razón:** El módulo nativo necesita el ID para identificar qué item terminó y decidir si hacer auto-advance.

---

### 6. **TUDUMs Siempre Hacen Auto-Advance**

**Regla:** Los items de tipo `TUDUM` **siempre** avanzan automáticamente al siguiente, independientemente de la configuración `autoNext`.

**⚠️ IMPORTANTE:** Esta regla aplica en **AMBOS modos** (Coordinated y Standalone).

**Implementación en PlaylistControlModule.kt:**
```kotlin
// Auto-advance si es TUDUM o si autoNext está habilitado
if (config.autoNext || currentItem.type == PlaylistItemType.TUDUM) {
    advanceToNextItem()
}
```

**Comportamiento por modo:**

- **Modo Coordinated:**
  - El módulo nativo detecta el broadcast de finalización
  - Verifica si el item es TUDUM
  - Hace auto-advance automáticamente
  - Emite evento `onItemChanged` para que JavaScript actualice la UI

- **Modo Standalone:**
  - El módulo nativo detecta la finalización internamente
  - Verifica si el item es TUDUM
  - Hace auto-advance automáticamente
  - Reproduce el siguiente item sin intervención de JavaScript

**Razón:** Los TUDUMs son intros/previews que no requieren interacción del usuario, independientemente de cómo se gestione la playlist.

---

### 7. **Sincronización entre PlaylistsManager y Módulo Nativo**

**Regla:** Cuando se cambia de item, **ambos** deben estar sincronizados.

**Flujo correcto:**
```typescript
// 1. PlaylistsManager cambia de item
await playlistsManager.goToIndex(newIndex);

// 2. Internamente llama al módulo nativo
if (this.nativeModule) {
    await this.nativeModule.goToIndex(newIndex);
}

// 3. Módulo nativo emite evento
emit('onItemChanged', { index: newIndex, itemId: newItemId });

// 4. PlaylistsManager recibe evento y actualiza estado
// (ya está sincronizado)
```

**❌ INCORRECTO:**
```typescript
// Cambiar solo en JavaScript
this.currentIndex = newIndex; // ❌ Módulo nativo desincronizado
```

---

### 8. **Background: Solo Nativo Funciona**

**Regla fundamental:** Cuando la app está en background, **solo el código nativo puede ejecutarse**.

**Implicaciones:**
- ❌ No se pueden ejecutar callbacks de JavaScript
- ❌ No se puede actualizar estado de React
- ❌ No se pueden hacer llamadas a APIs desde JavaScript
- ✅ El módulo nativo puede detectar finalización
- ✅ El módulo nativo puede hacer auto-advance
- ✅ El módulo nativo puede actualizar widget multimedia

**Diseño correcto:**
```
Item termina en background
→ Módulo nativo detecta (✅ Funciona)
→ Módulo nativo hace auto-advance (✅ Funciona)
→ Módulo nativo actualiza widget (✅ Funciona)
→ JavaScript callback (❌ No se ejecuta hasta foreground)
```

---

## 🚨 Errores Comunes y Soluciones

### 1. No enviar broadcast al terminar item

**Síntoma:** Auto-advance no funciona en modo coordinated en Android

**Causa:** ReactExoplayerView no envía broadcast cuando `Player.STATE_ENDED`

**Solución:** 
```java
// Verificar que este código existe en ReactExoplayerView.java
case Player.STATE_ENDED:
    if (playlistItemId != null) {
        Intent intent = new Intent("com.brentvatne.react.VIDEO_ITEM_FINISHED");
        intent.putExtra("itemId", playlistItemId);
        themedReactContext.sendBroadcast(intent);
    }
    break;
```

---

### 2. Olvidar playlistItemId

**Síntoma:** Módulo nativo no puede identificar qué item terminó

**Causa:** Falta `playlistItemId` en props de `<Video>`

**Solución:** 
```typescript
<Video
    playlistItemId={props.playlistItem?.id}  // ✅ Siempre incluir
    enablePlaylistIntegration={true}
/>
```

---

### 3. Intentar controlar desde JavaScript en background

**Síntoma:** Auto-advance no funciona cuando app está en background

**Causa:** Intentar hacer `playlistsManager.next()` desde callback de JavaScript

**Solución:** Eliminar lógica de auto-advance en JavaScript. El módulo nativo lo hace automáticamente.

---

### 4. Desincronización entre JavaScript y Nativo

**Síntoma:** UI muestra item diferente al que se reproduce

**Causa:** Cambiar `currentIndex` solo en JavaScript sin notificar al módulo nativo

**Solución:** Siempre usar `playlistsManager.goToIndex()` que sincroniza ambos

---

### 5. Usar modo incorrecto

**Síntoma:** Funcionalidad no funciona como se espera

**Causa:** Usar standalone cuando se necesita video, o coordinated cuando solo se necesita audio

**Solución:** 
- **Video + UI React:** Usar `coordinatedMode: true`
- **Audio puro:** Usar `coordinatedMode: false`

---

## 📝 Checklist de Implementación

### Antes de Modificar el Sistema

- [ ] He leído `context.md` completamente
- [ ] Entiendo la diferencia entre modo coordinated y standalone
- [ ] Sé qué modo necesito para mi caso de uso
- [ ] Entiendo el flujo de comunicación entre componentes

### Modo Coordinated

- [ ] `playlistItemId` se pasa al componente `<Video>`
- [ ] `enablePlaylistIntegration={true}` está configurado
- [ ] ReactExoplayerView envía broadcast al terminar (Android)
- [ ] PlaylistControlModule escucha el broadcast
- [ ] Auto-advance funciona para TUDUMs
- [ ] Eventos `onItemChanged` se emiten correctamente
- [ ] PlaylistsManager sincroniza con módulo nativo

### Modo Standalone

- [ ] `coordinatedMode: false` en configuración
- [ ] No se usa componente `<Video>`
- [ ] PlaylistControl se usa para control
- [ ] Módulo nativo gestiona su propio player
- [ ] Auto-advance funciona automáticamente
- [ ] Widget multimedia se actualiza correctamente

### Testing

- [ ] Funciona en foreground
- [ ] Funciona en background
- [ ] Auto-advance de TUDUM funciona
- [ ] Auto-advance de contenido funciona (si autoNext=true)
- [ ] Widget multimedia muestra información correcta
- [ ] Android Auto / CarPlay funciona (si aplica)

---

**Última actualización:** 2025-10-17
