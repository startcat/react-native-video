# Sistema de Playlists - Contexto y Reglas

## 📋 Índice

1. [Evolución del Sistema](#evolución-del-sistema)
2. [Arquitectura Actual](#arquitectura-actual)
3. [Modos de Operación](#modos-de-operación)
4. [Casos de Uso](#casos-de-uso)
5. [Reglas Fundamentales](#reglas-fundamentales)
6. [Flujo de Comunicación](#flujo-de-comunicación)

---

## 🔄 Evolución del Sistema

### Sistema Anterior (Single Item + Tudum)

**Limitaciones identificadas:**

- El Player recibía **un único elemento** para reproducir
- Opcionalmente disponía de un **Tudum** (intro/preview)
- El Player gestionaba manualmente el cambio entre Tudum → Contenido
- **Problema crítico:** En background, React Native queda suspendido
- La lógica JavaScript no puede ejecutarse cuando la app está en segundo plano
- **Impacto:** No se podía avanzar al siguiente episodio en podcasts/audio

**Escenario problemático:**

```
Usuario reproduce podcast → App pasa a background → Episodio termina
→ React Native suspendido → No se invoca lógica de "siguiente episodio"
→ Reproducción se detiene ❌
```

### Sistema Actual (Playlist Nativa)

**Solución implementada:**

- Sistema de **Playlists completamente nativo** (Android/iOS)
- El **Tudum es un elemento más de la playlist** (no un caso especial)
- La navegación entre items se gestiona **en código nativo**
- **Funciona en background** sin depender de JavaScript
- Soporte para **Android Auto** y **CarPlay**

**Flujo mejorado:**

```
Usuario reproduce podcast → App pasa a background → Episodio termina
→ Módulo nativo detecta fin → Avanza automáticamente al siguiente
→ Reproducción continúa ✅
```

---

## 🏗️ Arquitectura Actual

### Componentes Principales

#### 1. **PlaylistsManager (TypeScript)**

- **Ubicación:** `/src/player/features/playlists/PlaylistsManager.ts`
- **Responsabilidad:** Gestión de alto nivel de la playlist en JavaScript
- **Funciones:**
    - Mantener la lista de items
    - Controlar el índice actual
    - Emitir eventos de cambio de item
    - Sincronizar con el módulo nativo (si está disponible)
    - Gestionar persistencia (opcional)

#### 2. **PlaylistControlModule (Nativo)**

- **Android:** `/android/src/main/java/com/brentvatne/react/playlist/PlaylistControlModule.kt`
- **iOS:** `/ios/Playlists/PlaylistControlModule.swift`
- **Responsabilidad:** Control nativo de la playlist
- **Funciones:**
    - Recibir la playlist desde JavaScript
    - Gestionar navegación (next, previous, goToIndex)
    - Detectar finalización de items
    - Auto-advance en TUDUMs
    - Emitir eventos nativos
    - Control de reproducción (en modo standalone)

#### 3. **PlaylistControl (TypeScript Wrapper)**

- **Ubicación:** `/src/player/features/playlists/PlaylistControl.ts`
- **Responsabilidad:** Interfaz TypeScript para el módulo nativo
- **Funciones:**
    - Métodos estáticos para control directo
    - Event listeners tipados
    - Abstracción del NativeModule

#### 4. **ReactExoplayerView (Android) / RCTVideo (iOS)**

- **Responsabilidad:** Componente de reproducción de video/audio
- **Integración con Playlists:**
    - Recibe `playlistItemId` como prop
    - Envía broadcast cuando item termina (Android)
    - Notifica al PlaylistControlModule

---

## 📱 Casos de Uso

### 1. Reproductor de Video con Playlists (Modo Coordinated)

**Ejemplo:** App de streaming de series/películas con auto-advance

```typescript
// Configurar playlist con tudum + episodios
const episodes = [
    { id: 'tudum', type: 'TUDUM', uri: 'tudum.mp4' },
    { id: 'ep1', type: 'CONTENT', uri: 'episode1.mp4', title: 'Episodio 1' },
    { id: 'ep2', type: 'CONTENT', uri: 'episode2.mp4', title: 'Episodio 2' },
];

await playlistsManager.setPlaylist(episodes, {
    coordinatedMode: true,
    autoNext: true,
});

// Renderizar Video
<Video
    source={{ uri: currentItem.uri }}
    enablePlaylistIntegration={true}
    playlistItemId={currentItem.id}
    playInBackground={true}
/>
```

**Beneficios:**

- Tudum se reproduce automáticamente antes del primer episodio
- Auto-advance al terminar el tudum (sin interacción del usuario)
- Usuario puede pausar y la app pasa a background
- Al terminar episodio en background, avanza automáticamente al siguiente
- Widget multimedia muestra información correcta

---

### 2. Reproductor de Audio/Podcasts (Modo Standalone)

**Ejemplo:** App de podcasts con reproducción en background

```typescript
// Configurar playlist de episodios
const episodes = [
	{ id: "ep1", type: "CONTENT", uri: "podcast-ep1.mp3", title: "Episodio 1" },
	{ id: "ep2", type: "CONTENT", uri: "podcast-ep2.mp3", title: "Episodio 2" },
	{ id: "ep3", type: "CONTENT", uri: "podcast-ep3.mp3", title: "Episodio 3" },
];

await playlistsManager.setPlaylist(episodes, {
	coordinatedMode: false, // Standalone
	autoNext: true,
});

// No se necesita componente <Video>
// Controlar desde PlaylistControl
await PlaylistControl.play();
```

**Beneficios:**

- Reproducción 100% en background
- Menor consumo de batería (no renderiza video)
- Compatible con Android Auto / CarPlay
- Widget multimedia completo
- Auto-advance automático entre episodios

---

### 3. Android Auto / CarPlay

**Ambos modos son compatibles**, pero standalone es más eficiente:

```typescript
// Configurar para Android Auto / CarPlay
await playlistsManager.setPlaylist(episodes, {
	coordinatedMode: false, // Recomendado para Auto/CarPlay
	autoNext: true,
});

// Los controles del vehículo funcionan automáticamente
// Next, Previous, Play, Pause se gestionan nativamente
```

**Beneficios:**

- Controles del vehículo funcionan sin JavaScript
- Metadata se actualiza automáticamente
- Auto-advance entre episodios
- Funciona con app completamente en background

---

## 🔄 Flujos de Comunicación

### Flujo 1: Item Termina en Foreground (Modo Coordinated)

```
1. Usuario reproduce video/audio
   ↓
2. <Video> reproduce con playlistItemId="tudum"
   ↓
3. Item termina → Player.STATE_ENDED
   ↓
4. ReactExoplayerView envía broadcast
   Intent("VIDEO_ITEM_FINISHED", itemId="tudum")
   ↓
5. PlaylistControlModule recibe broadcast
   ↓
6. Detecta que es TUDUM → auto-advance automático
   ↓
7. Emite evento onItemChanged(itemId="ep1", index=1)
   ↓
8. PlaylistsManager recibe evento
   ↓
9. Actualiza currentIndex y emite evento local
   ↓
10. React component actualiza UI
    ↓
11. <Video> recibe nuevo source y reproduce
```

---

### Flujo 2: Item Termina en Background (Modo Coordinated)

```
1. Usuario reproduce audio y pone app en background
   ↓
2. <Video> reproduce con playlistItemId="ep1"
   ↓
3. Item termina → Player.STATE_ENDED
   ↓
4. ReactExoplayerView envía broadcast
   Intent("VIDEO_ITEM_FINISHED", itemId="ep1")
   ↓
5. PlaylistControlModule recibe broadcast
   ↓
6. Detecta finalización → auto-advance (autoNext=true)
   ↓
7. Emite evento onItemChanged(itemId="ep2", index=2)
   (JavaScript no lo recibe porque está suspendido)
   ↓
8. Actualiza widget multimedia con nuevo item
   ↓
9. Usuario vuelve a foreground
   ↓
10. JavaScript se reactiva
    ↓
11. PlaylistsManager sincroniza estado con módulo nativo
    ↓
12. UI se actualiza con el item actual
```

---

### Flujo 3: Reproducción en Modo Standalone

```
1. PlaylistsManager envía playlist al módulo nativo
   ↓
2. Módulo nativo crea player interno (ExoPlayer/AVPlayer)
   ↓
3. Módulo nativo reproduce item actual
   ↓
4. Player interno detecta finalización
   (No necesita broadcast, detección interna)
   ↓
5. Módulo nativo hace auto-advance automático
   ↓
6. Módulo nativo reproduce siguiente item
   ↓
7. Emite evento onItemChanged
   ↓
8. Si app está en foreground:
   → PlaylistsManager recibe evento
   → Actualiza UI

   Si app está en background:
   → Evento se pierde (no importa)
   → Widget se actualiza correctamente
```

---

## 🎯 Decisiones de Diseño Clave

### ¿Por qué Tudum es un Item Más?

**Antes:** Lógica especial para gestionar tudum separado del contenido

**Ahora:** Tudum es un item con `type: 'TUDUM'` en la playlist

**Ventajas:**

- ✅ Simplifica la lógica del player
- ✅ El módulo nativo puede detectarlo y hacer auto-advance
- ✅ Funciona en background sin JavaScript
- ✅ Consistente con el resto de items
- ✅ Fácil de extender (múltiples tudums, ads, etc.)

**⚠️ Regla Fundamental:**

Los TUDUMs **siempre** hacen auto-advance automáticamente, independientemente de:
- La configuración `autoNext` (puede estar en `false`)
- El modo de operación (Coordinated o Standalone)
- El estado de la app (foreground o background)

Esto garantiza que los intros/previews nunca requieran interacción del usuario para continuar.

---

### ¿Por qué Dos Modos (Coordinated/Standalone)?

**Razón:** Diferentes casos de uso requieren diferentes arquitecturas.

**Modo Coordinated:**

- Modo principal y predeterminado
- Arovecha toda la lógica en React Native

**Modo Standalone:**

- Para apps de **audio puro**
- Pensado para casos de **Android Auto / CarPlay**

---

### ¿Por qué Broadcast en Android?

**Razón:** Comunicación entre componentes nativos cuando JavaScript está suspendido.

**Alternativas consideradas:**

1. ❌ Callback de JavaScript → No funciona en background
2. ❌ Shared Preferences → Polling ineficiente
3. ✅ Broadcast → Comunicación instantánea entre componentes nativos

**Ventaja:** El broadcast funciona incluso cuando React Native está completamente suspendido.

---

## 📚 Referencias y Documentación Adicional

### Archivos Principales

- **PlaylistsManager:** `/src/player/features/playlists/PlaylistsManager.ts`
- **PlaylistControl:** `/src/player/features/playlists/PlaylistControl.ts`
- **PlaylistControlModule (Android):** `/android/src/main/java/com/brentvatne/react/playlist/PlaylistControlModule.kt`
- **PlaylistControlModule (iOS):** `/ios/Playlists/PlaylistControlModule.swift`
- **ReactExoplayerView:** `/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`

### Documentación

- **README:** `/src/player/features/playlists/README.md`
- **Modos y Reglas:** `/src/player/features/playlists/instructions/modes-and-rules.md`
- **Este documento:** `/src/player/features/playlists/instructions/context.md`

---

## 🔍 Próximos Pasos

Después de leer este documento:

1. **Lee `modes-and-rules.md`** para entender las reglas detalladas y errores comunes
2. **Revisa el README** para ver ejemplos de código completos
3. **Examina el código** de los componentes principales
4. **Prueba ambos modos** en tu app para entender las diferencias

---

**Última actualización:** 2025-10-17  
**Versión:** 1.0.0  
**Autores:** Equipo de desarrollo react-native-video
