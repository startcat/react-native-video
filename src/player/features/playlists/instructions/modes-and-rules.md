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

### 0. **Eventos Nativos Funcionan en Ambos Modos**

> **📢 IMPORTANTE:** Los eventos del módulo nativo (`ITEM_CHANGED`, `ITEM_COMPLETED`, `ITEM_STARTED`, `PLAYLIST_ENDED`) se emiten **SIEMPRE**, independientemente del modo (coordinated o standalone).

**Por qué es importante:**
- JavaScript puede escuchar eventos en ambos modos
- El widget multimedia se actualiza en ambos modos
- Analytics/tracking funcionan en ambos modos
- Si la app vuelve a foreground, JavaScript puede sincronizarse

**Lo que SÍ cambia entre modos:**
- **Coordinated:** `<Video>` de React Native controla el player
- **Standalone:** Player nativo interno (AVPlayer/ExoPlayer) controla el player

**Lo que NO cambia entre modos:**
- ✅ Eventos se emiten igual
- ✅ JavaScript puede escuchar eventos
- ✅ Widget multimedia se actualiza
- ✅ Métodos `notifyItemStarted` y `notifyItemFinished` funcionan

---

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

### 2. **Modo Coordinated: Nativo Controla Navegación, JavaScript Actualiza UI**

> **🎯 OBJETIVO PRINCIPAL:** Permitir que las playlists funcionen en **background**, incluso cuando React Native está **completamente deshabilitado** (app en segundo plano, pantalla bloqueada, etc.).

**Responsabilidades Críticas:**

- **Nativo (PlaylistControlModule):**
  - ✅ **Detecta automáticamente** cuando un item termina (via broadcast `ACTION_VIDEO_ITEM_FINISHED`)
  - ✅ **Controla la navegación** de playlist (auto-advance)
  - ✅ **Funciona en background** sin JavaScript
  - ✅ **Emite eventos** `ITEM_CHANGED`, `ITEM_COMPLETED`, `ITEM_STARTED` (en ambos modos)
  - ✅ Actualiza widget multimedia
  
- **JavaScript (PlaylistsManager + AudioFlavour):**
  - ✅ **Escucha eventos** del módulo nativo (en ambos modos)
  - ✅ **Actualiza UI** basándose en esos eventos
  - ✅ **Puede notificar** `notifyItemStarted` cuando contenido está cargado (funciona en ambos modos)
  - ❌ **NO detecta finalización** (el nativo ya lo hace)
  - ❌ **NO controla navegación automática** (el nativo lo hace)
  - ✅ **SÍ controla navegación manual** cuando usuario pulsa botones (next, previous, goToIndex)

**Flujo de Finalización de Item:**
```
1. Item termina en <Video> nativo
   ↓
2. <Video> envía broadcast ACTION_VIDEO_ITEM_FINISHED
   ↓
3. Módulo nativo detecta broadcast (✅ Funciona en background)
   ↓
4. Módulo nativo hace auto-advance automáticamente
   ↓
5. Módulo nativo emite ITEM_CHANGED
   ↓
6. JavaScript escucha evento (solo si app en foreground)
   ↓
7. JavaScript actualiza UI
```

**❌ INCORRECTO:**
```typescript
// Intentar notificar al nativo que un item terminó
const handleOnEnd = async () => {
    await playlistsManager.notifyItemCompleted(itemId); // ❌ REDUNDANTE
    // El nativo YA lo detectó via broadcast
};
```

**❌ INCORRECTO:**
```typescript
// Intentar hacer auto-advance desde JavaScript
const handleOnEnd = () => {
    if (autoNext) {
        playlistsManager.goToNext(); // ❌ Causa doble avance
    }
};
```

**✅ CORRECTO:**
```typescript
// JavaScript SOLO escucha eventos y actualiza UI
const handleOnEnd = () => {
    // Solo notificar a la UI que el item terminó
    // NO intentar controlar navegación
    if (props.events?.onEnd) {
        props.events.onEnd(); // Solo para actualizar estado UI
    }
};

// Escuchar cambios de item del nativo
playlistsManager.on('itemChanged', (event) => {
    // Actualizar UI con el nuevo item
    setCurrentItem(event.currentItem);
});
```

**✅ CORRECTO - Navegación Manual:**
```typescript
// Cuando el USUARIO pulsa un botón
const handleNextButton = async () => {
    // Aquí SÍ controlamos la navegación explícitamente
    await playlistsManager.goToNext();
};
```

**⚠️ REGLA DE ORO:**
> En modo coordinated, **JavaScript NUNCA intenta controlar la navegación automática de playlist**. El módulo nativo lo hace por sí mismo detectando broadcasts. JavaScript solo actualiza UI cuando recibe eventos del nativo.

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

### 8. **Background: Solo Nativo Funciona - OBJETIVO PRINCIPAL DEL SISTEMA**

> **🎯 OBJETIVO CRÍTICO:** El sistema de playlists está diseñado para funcionar **completamente en background**, incluso cuando React Native está **totalmente deshabilitado** (app en segundo plano, pantalla bloqueada, sistema operativo suspendió JavaScript, etc.).

**Regla fundamental:** Cuando la app está en background, **solo el código nativo puede ejecutarse**.

**¿Por qué es crítico?**
- Las playlists de audio deben continuar reproduciéndose cuando el usuario bloquea la pantalla
- El auto-advance debe funcionar sin intervención de JavaScript
- El widget multimedia debe actualizarse correctamente
- Android Auto / CarPlay deben funcionar sin la app en foreground

**Implicaciones técnicas:**
- ❌ No se pueden ejecutar callbacks de JavaScript
- ❌ No se puede actualizar estado de React
- ❌ No se pueden hacer llamadas a APIs desde JavaScript
- ❌ `props.events?.onEnd()` no se ejecuta
- ❌ `playlistsManager.goToNext()` no funciona
- ✅ El módulo nativo puede detectar finalización (via broadcast)
- ✅ El módulo nativo puede hacer auto-advance
- ✅ El módulo nativo puede actualizar widget multimedia
- ✅ El módulo nativo puede reproducir siguiente item

**Diseño correcto (modo coordinated):**
```
Usuario bloquea pantalla
→ React Native se suspende (❌ JavaScript no funciona)
→ Item termina en <Video> nativo
→ <Video> envía broadcast ACTION_VIDEO_ITEM_FINISHED (✅ Funciona)
→ Módulo nativo detecta broadcast (✅ Funciona)
→ Módulo nativo hace auto-advance (✅ Funciona)
→ Módulo nativo actualiza widget (✅ Funciona)
→ Módulo nativo reproduce siguiente item (✅ Funciona)
→ Usuario desbloquea pantalla
→ React Native se reactiva
→ JavaScript recibe evento ITEM_CHANGED
→ UI se actualiza con el item actual
```

**❌ Diseño INCORRECTO (no funciona en background):**
```
Item termina en <Video> nativo
→ <Video> llama a onEnd callback de JavaScript (❌ No funciona en background)
→ JavaScript intenta hacer playlistsManager.goToNext() (❌ No funciona en background)
→ Playlist se detiene (❌ Mala experiencia de usuario)
```

**⚠️ REGLA CRÍTICA:**
> **NUNCA** diseñes flujos que dependan de JavaScript para la navegación automática de playlist. El módulo nativo debe ser completamente autónomo y capaz de gestionar la playlist sin ninguna intervención de JavaScript.

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

**Última actualización:** 2025-10-24 (12:10)

**Cambios importantes en esta versión:**
- ✅ Aclarado que el **objetivo principal** es funcionar en background sin React Native
- ✅ Documentado que el módulo nativo detecta finalización automáticamente via broadcast
- ✅ Aclarado que JavaScript **NUNCA** debe intentar controlar navegación automática
- ✅ Agregados ejemplos de flujos correctos e incorrectos
- ✅ Enfatizado que `notifyItemCompleted` es redundante (el nativo ya lo detectó)
- ✅ **NUEVO:** Los eventos nativos funcionan en **AMBOS modos** (coordinated y standalone)
- ✅ **NUEVO:** Eliminadas restricciones de modo en `notifyItemStarted` y `notifyItemFinished`
