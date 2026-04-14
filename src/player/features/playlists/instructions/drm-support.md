# Soporte DRM en Sistema de Playlists

## 🔐 Principio Fundamental

**El soporte DRM es IDÉNTICO en ambos modos (Coordinated y Standalone).**

Ambos modos utilizan la misma lógica DRM compartida a través de `DrmHelper.kt`, garantizando:
- ✅ Configuración consistente
- ✅ Mismo comportamiento en ambos modos
- ✅ Soporte para contenido descargado offline
- ✅ Compatibilidad con Widevine, PlayReady y ClearKey

---

## 🏗️ Arquitectura

### Componentes

```
┌─────────────────────────────────────────────────┐
│           JavaScript (PlaylistItem)             │
│  { source: { uri, drm: { type, licenseServer }}}│
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│         PlaylistModels.kt (Parsing)             │
│  PlaylistDrm + PlaylistSource con DRM           │
└────────────┬────────────────────────────────────┘
             │
             ├──────────────────┬─────────────────┐
             ▼                  ▼                 ▼
    ┌────────────────┐  ┌──────────────┐  ┌──────────────┐
    │  DrmHelper.kt  │  │ Coordinated  │  │  Standalone  │
    │   (Shared)     │  │     Mode     │  │     Mode     │
    └────────────────┘  └──────────────┘  └──────────────┘
             │                  │                 │
             │                  ▼                 ▼
             │          ReactExoplayerView  PlaylistControl
             │                  │                 │
             └──────────────────┴─────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  ExoPlayer + DRM      │
                    │  Session Manager      │
                    └───────────────────────┘
```

---

## 📦 Modelos de Datos

### PlaylistDrm (Kotlin)

```kotlin
data class PlaylistDrm(
    val type: String,                    // "widevine", "playready", "clearkey"
    val licenseServer: String? = null,   // URL del servidor de licencias
    val headers: Map<String, String>? = null,  // Headers para petición de licencia
    val contentId: String? = null,       // ID del contenido (opcional)
    val certificateUrl: String? = null,  // URL del certificado (opcional)
    val base64Certificate: Boolean = false,
    val multiSession: Boolean = false    // Soporte multi-sesión
)
```

### IDrm (TypeScript)

```typescript
interface IDrm {
    type?: DRM_TYPE;              // "widevine" | "playready" | "clearkey"
    licenseServer?: string;       // URL del servidor de licencias
    headers?: Headers;            // Headers para petición de licencia
    contentId?: string;           // ID del contenido
    certificateUrl?: string;      // URL del certificado
    base64Certificate?: boolean;
    drmScheme?: string;
    multiSession?: boolean;       // Soporte multi-sesión
}
```

---

## 🔧 DrmHelper - Lógica Compartida

### Funciones Principales

#### 1. `getDrmUUID(drmType: String): UUID?`

Convierte el tipo DRM string a UUID de ExoPlayer:

```kotlin
"widevine" → C.WIDEVINE_UUID
"playready" → C.PLAYREADY_UUID
"clearkey" → C.CLEARKEY_UUID
```

#### 2. `buildDrmSessionManager(context: Context, drm: PlaylistDrm): DrmSessionManager`

Construye un `DefaultDrmSessionManager` configurado:

```kotlin
val drmSessionManager = DefaultDrmSessionManager.Builder()
    .setUuidAndExoMediaDrmProvider(drmUUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
    .setMultiSession(drm.multiSession)
    .build(drmCallback)
```

**Características:**
- ✅ Configura callback HTTP para licencias
- ✅ Agrega headers personalizados
- ✅ Soporte multi-sesión
- ✅ Manejo de errores

#### 3. `buildMediaItemWithDrm(uri: String, drm: PlaylistDrm?): MediaItem`

Construye un `MediaItem` con configuración DRM:

```kotlin
val drmConfig = MediaItem.DrmConfiguration.Builder(drmUUID)
    .setLicenseUri(drm.licenseServer)
    .setMultiSession(drm.multiSession)
    .setLicenseRequestHeaders(drm.headers)
    .build()

val mediaItem = MediaItem.Builder()
    .setUri(uri)
    .setDrmConfiguration(drmConfig)
    .build()
```

#### 4. `isDrmSupported(drmType: String): Boolean`

Verifica si el dispositivo soporta el tipo DRM:

```kotlin
val uuid = getDrmUUID(drmType)
return FrameworkMediaDrm.newInstance(uuid) != null
```

---

## 🎯 Uso en Modo Coordinated

### Flujo

```
1. JavaScript pasa PlaylistItem con source.drm
2. PlaylistControlModule parsea PlaylistDrm
3. JavaScript renderiza <Video> con prop drm
4. ReactExoplayerView usa su lógica DRM existente
5. ExoPlayer reproduce con DRM
```

**Código JavaScript:**

```typescript
const item: PlaylistItem = {
    id: "episode-1",
    type: PlaylistItemType.CONTENT,
    resolvedSources: {
        local: {
            uri: "https://example.com/content.mpd",
            manifest: manifest,
            drm: {
                type: "widevine",
                licenseServer: "https://license.example.com/widevine",
                headers: {
                    "X-Custom-Header": "value"
                },
                multiSession: false
            }
        }
    },
    metadata: { title: "Episode 1" }
};

await playlistsManager.setPlaylist([item], {
    coordinatedMode: true
});
```

**Código en Flavour:**

```typescript
<Video
    source={{
        uri: currentItem.source.uri,
        type: currentItem.source.type
    }}
    drm={currentItem.source.drm}  // ← Pasa DRM al Video
    enablePlaylistIntegration={true}
    playlistItemId={currentItem.id}
/>
```

---

## 🎮 Uso en Modo Standalone

### Flujo

```
1. JavaScript pasa PlaylistItem con source.drm
2. PlaylistControlModule parsea PlaylistDrm
3. PlaylistControlModule llama DrmHelper.buildMediaItemWithDrm()
4. ExoPlayer interno reproduce con DRM configurado
5. Todo funciona en background sin JavaScript
```

**Código en PlaylistControlModule:**

```kotlin
private fun loadCurrentItem() {
    val currentItem = items.getOrNull(currentIndex) ?: return
    val drm = currentItem.source.drm
    
    // DrmHelper construye MediaItem con DRM
    val mediaItem = DrmHelper.buildMediaItemWithDrm(
        uri = currentItem.source.uri,
        drm = drm
    )
    
    standalonePlayer?.setMediaItem(mediaItem)
    standalonePlayer?.prepare()
    standalonePlayer?.play()
}
```

**Logs esperados:**

```
[Standalone] Loading item: Episode 1
[Standalone] URI: https://example.com/content.mpd
[Standalone] Item has DRM configuration: widevine
[Standalone] License server: https://license.example.com/widevine
[Standalone] Multi-session: false
DrmHelper: MediaItem built with DRM configuration: widevine
[Standalone] Item loaded and playing
```

---

## 📥 Soporte para Contenido Descargado Offline

### Preparación

Para soportar contenido offline con DRM, necesitarás:

1. **Descargar la licencia offline** antes de descargar el contenido
2. **Guardar el ID de la licencia** junto con el contenido descargado
3. **Pasar la configuración DRM** con el source de download

### Ejemplo de Uso

```typescript
const item: PlaylistItem = {
    id: "episode-1-offline",
    type: PlaylistItemType.CONTENT,
    resolvedSources: {
        download: {
            uri: "file:///storage/downloads/episode1.mpd",
            downloadId: "download-123",
            drm: {
                type: "widevine",
                licenseServer: "https://license.example.com/widevine",
                headers: {
                    "X-Offline-License-Id": "license-abc-123"
                },
                multiSession: false
            }
        }
    },
    metadata: { title: "Episode 1 (Offline)" }
};
```

### Configuración en Android

El `DrmHelper` ya está preparado para offline:

```kotlin
// El MediaItem.DrmConfiguration soporta licencias offline automáticamente
// ExoPlayer detectará si la licencia está en cache local
val drmConfig = MediaItem.DrmConfiguration.Builder(drmUUID)
    .setLicenseUri(drm.licenseServer)
    .setLicenseRequestHeaders(drm.headers)
    .build()
```

**Nota:** Para gestión completa de licencias offline, necesitarás:
- `OfflineLicenseManager` (ya existe en ReactExoplayerView)
- Integración con `AxDownloadTracker`
- Lógica para renovar licencias expiradas

---

## 🔍 Debugging DRM

### Logs Importantes

**Inicialización:**
```
DrmHelper: DRM session manager created successfully for type: widevine
```

**Carga de Item:**
```
[Standalone] Item has DRM configuration: widevine
[Standalone] License server: https://license.example.com/widevine
DrmHelper: MediaItem built with DRM configuration: widevine
```

**Errores Comunes:**

```
DrmHelper: Unsupported DRM type: invalid-type
→ Verifica que el tipo sea "widevine", "playready" o "clearkey"

DrmHelper: DRM license server URL is required
→ Falta licenseServer en la configuración DRM

DrmHelper: DRM type widevine not supported on this device
→ El dispositivo no soporta ese tipo de DRM
```

### Verificar Soporte DRM

```kotlin
val isSupported = DrmHelper.isDrmSupported("widevine")
Log.d(TAG, "Widevine supported: $isSupported")
```

---

## ⚠️ Consideraciones Importantes

### 1. **Headers de Licencia**

Los headers se pasan directamente a `HttpMediaDrmCallback`:

```kotlin
drm.headers?.forEach { (key, value) ->
    drmCallback.setKeyRequestProperty(key, value)
}
```

**Común:** `X-AxDRM-Message`, `Authorization`, `X-Custom-Token`

### 2. **Multi-Session**

Habilita múltiples sesiones DRM simultáneas:

```typescript
drm: {
    type: "widevine",
    licenseServer: "...",
    multiSession: true  // ← Permite múltiples streams con DRM
}
```

**Útil para:**
- Múltiples tracks de audio/video con diferentes licencias
- Switching entre calidades con DRM diferente

### 3. **Certificados**

Para algunos DRM (como FairPlay en iOS), necesitas certificados:

```typescript
drm: {
    type: "fairplay",
    certificateUrl: "https://example.com/cert.cer",
    base64Certificate: false
}
```

**Nota:** Actualmente `DrmHelper.kt` no implementa certificados. Se agregará cuando sea necesario.

### 4. **Renovación de Licencias**

Las licencias DRM tienen tiempo de expiración. Para contenido offline:

- Verifica la expiración antes de reproducir
- Renueva licencias próximas a expirar
- Maneja errores de licencia expirada

---

## 🧪 Testing

### Test Básico - Widevine

```typescript
const testItem: PlaylistItem = {
    id: "test-drm",
    type: PlaylistItemType.CONTENT,
    resolvedSources: {
        local: {
            uri: "https://storage.googleapis.com/wvmedia/clear/h264/tears/tears.mpd",
            manifest: { /* ... */ },
            drm: {
                type: "widevine",
                licenseServer: "https://proxy.uat.widevine.com/proxy?video_id=d286538032258a1c&provider=widevine_test"
            }
        }
    },
    metadata: { title: "Tears of Steel (Widevine)" }
};
```

### Test Multi-Session

```typescript
drm: {
    type: "widevine",
    licenseServer: "...",
    multiSession: true
}
```

### Test con Headers Personalizados

```typescript
drm: {
    type: "widevine",
    licenseServer: "...",
    headers: {
        "X-Custom-Token": "abc123",
        "Authorization": "Bearer token"
    }
}
```

---

## 📋 Checklist de Implementación

### Backend (Servidor de Licencias)

- [ ] Servidor DRM configurado (Widevine/PlayReady)
- [ ] Endpoint de licencias accesible
- [ ] Headers de autenticación configurados
- [ ] Soporte para licencias offline (opcional)

### Frontend (JavaScript)

- [ ] `IDrm` configurado en `resolvedSources`
- [ ] Headers necesarios incluidos
- [ ] Tipo DRM correcto ("widevine", "playready", "clearkey")
- [ ] License server URL válida

### Android (Nativo)

- [ ] `PlaylistDrm` parseado correctamente
- [ ] `DrmHelper` usado en `loadCurrentItem()`
- [ ] Logs de DRM habilitados para debugging
- [ ] Manejo de errores DRM implementado

### Testing

- [ ] Reproducción con DRM en modo coordinated
- [ ] Reproducción con DRM en modo standalone
- [ ] Reproducción en background con DRM
- [ ] Auto-advance entre items con DRM
- [ ] Manejo de errores de licencia

---

**Última actualización:** 2025-10-17  
**Versión:** 1.0.0
