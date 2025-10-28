# Android Auto - Pasos de Implementación

> **Estado:** ✅ Implementación completa con reproducción nativa  
> **Ver:** [native-playback.md](./native-playback.md) para código completo y detalles

## Orden de Implementación

Este documento detalla el orden exacto de implementación para minimizar errores y facilitar testing incremental.

**ESTRATEGIA FINAL IMPLEMENTADA:** Reproducción Nativa Completa
- ✅ Navegación funciona con app cerrada (caché en disco)
- ✅ Reproducción nativa con ExoPlayer (sin React Native)
- ✅ Notificación multimedia con controles
- ✅ Audio focus manejado automáticamente
- ✅ Sincronización perfecta Android Auto ↔ Notificación
- ✅ Funciona con pantalla móvil apagada

---

## FASE 1: Estructura Base (Sin Funcionalidad)

### **Paso 1.1: Crear Estructura de Carpetas**

```bash
# Crear carpetas
mkdir -p src/player/features/androidAuto/instructions
mkdir -p android/src/main/java/com/brentvatne/exoplayer/androidauto
mkdir -p android/src/main/res/xml
```

### **Paso 1.2: Crear Tipos TypeScript**

**Archivo:** `src/player/features/androidAuto/types.ts`

```typescript
/**
 * Tipos para integración con Android Auto
 */

/**
 * Item de media para Android Auto
 */
export interface MediaItem {
    /** ID único del item */
    id: string;
    
    /** Título del item */
    title: string;
    
    /** Subtítulo o descripción */
    subtitle?: string;
    
    /** Artista o autor */
    artist?: string;
    
    /** URI de la imagen/artwork */
    artworkUri?: string;
    
    /** Si el item es navegable (carpeta) */
    browsable?: boolean;
    
    /** Si el item es reproducible */
    playable?: boolean;
    
    /** ID del padre (para jerarquía) */
    parentId?: string;
}

/**
 * Metadata del contenido actual
 */
export interface MediaMetadata {
    /** Título */
    title?: string;
    
    /** Artista */
    artist?: string;
    
    /** Álbum */
    album?: string;
    
    /** URI de artwork */
    artworkUri?: string;
    
    /** Duración en segundos */
    duration?: number;
    
    /** Posición actual en segundos */
    position?: number;
}

/**
 * Callback para solicitudes de navegación
 */
export type BrowseCallback = (parentId: string) => MediaItem[] | Promise<MediaItem[]>;

/**
 * Callback para reproducción
 */
export type PlayCallback = (mediaId: string) => void;

/**
 * Configuración de Android Auto
 */
export interface AndroidAutoConfig {
    /** Habilitar Android Auto */
    enabled: boolean;
    
    /** Biblioteca de medios inicial */
    library?: MediaItem[];
    
    /** Callback para navegación dinámica */
    onBrowseRequest?: BrowseCallback;
    
    /** Callback para reproducción */
    onPlayFromMediaId?: PlayCallback;
}
```

### **Paso 1.3: Crear Index de Exportación**

**Archivo:** `src/player/features/androidAuto/index.ts`

```typescript
/**
 * Android Auto Integration
 * 
 * Sistema opcional para integrar el reproductor con Android Auto.
 * Solo disponible en Android.
 */

export { AndroidAutoControl } from './AndroidAutoControl';
export { useAndroidAuto } from './useAndroidAuto';
export type { 
    MediaItem, 
    MediaMetadata, 
    AndroidAutoConfig,
    BrowseCallback,
    PlayCallback
} from './types';
```

---

## FASE 2: Módulo Nativo Base

### **Paso 2.1: Crear AndroidAutoModule**

**Archivo:** `android/src/main/java/com/brentvatne/exoplayer/AndroidAutoModule.kt`

```kotlin
package com.brentvatne.exoplayer

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class AndroidAutoModule(reactContext: ReactApplicationContext) 
    : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "AndroidAutoModule"
    
    @ReactMethod
    fun enable(promise: Promise) {
        try {
            Log.d(TAG, "Android Auto enable() called")
            // TODO: Iniciar MediaBrowserService
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enable Android Auto", e)
            promise.reject("ENABLE_FAILED", e.message, e)
        }
    }
    
    @ReactMethod
    fun disable(promise: Promise) {
        try {
            Log.d(TAG, "Android Auto disable() called")
            // TODO: Detener MediaBrowserService
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to disable Android Auto", e)
            promise.reject("DISABLE_FAILED", e.message, e)
        }
    }
    
    @ReactMethod
    fun setMediaLibrary(items: ReadableArray, promise: Promise) {
        try {
            Log.d(TAG, "setMediaLibrary() called with ${items.size()} items")
            // TODO: Guardar en caché
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set media library", e)
            promise.reject("SET_LIBRARY_FAILED", e.message, e)
        }
    }
    
    @ReactMethod
    fun updateNowPlaying(metadata: ReadableMap) {
        try {
            val title = metadata.getString("title")
            Log.d(TAG, "updateNowPlaying() called: $title")
            // TODO: Actualizar MediaSession
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update now playing", e)
        }
    }
    
    @ReactMethod
    fun getConnectionStatus(promise: Promise) {
        try {
            // TODO: Verificar estado real
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("STATUS_FAILED", e.message, e)
        }
    }
    
    companion object {
        private const val TAG = "AndroidAutoModule"
    }
}
```

### **Paso 2.2: Crear AndroidAutoPackage**

**Archivo:** `android/src/main/java/com/brentvatne/exoplayer/AndroidAutoPackage.kt`

```kotlin
package com.brentvatne.exoplayer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AndroidAutoPackage : ReactPackage {
    
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(AndroidAutoModule(reactContext))
    }
    
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

### **Paso 2.3: Registrar Package**

**Archivo:** `android/src/main/java/com/brentvatne/ReactVideoPackage.java`

```java
// Añadir import
import com.brentvatne.exoplayer.AndroidAutoPackage;

// En getPackages(), añadir:
packages.add(new AndroidAutoPackage());
```

---

## FASE 3: API JavaScript Base

### **Paso 3.1: Crear AndroidAutoControl**

**Archivo:** `src/player/features/androidAuto/AndroidAutoControl.ts`

```typescript
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import type { MediaItem, MediaMetadata, BrowseCallback, PlayCallback } from './types';

const { AndroidAutoModule } = NativeModules;

export class AndroidAutoControl {
    
    private static enabled = false;
    private static browseCallbacks = new Map<string, BrowseCallback>();
    private static playCallback: PlayCallback | null = null;
    
    /**
     * Habilitar Android Auto
     */
    static async enable(): Promise<void> {
        if (Platform.OS !== 'android') {
            console.warn('[AndroidAuto] Only available on Android');
            return;
        }
        
        if (this.enabled) {
            console.warn('[AndroidAuto] Already enabled');
            return;
        }
        
        if (!AndroidAutoModule) {
            throw new Error('[AndroidAuto] Native module not found');
        }
        
        try {
            await AndroidAutoModule.enable();
            this.enabled = true;
            this.setupEventListeners();
            console.log('[AndroidAuto] Enabled successfully');
        } catch (error) {
            console.error('[AndroidAuto] Failed to enable:', error);
            throw error;
        }
    }
    
    /**
     * Deshabilitar Android Auto
     */
    static async disable(): Promise<void> {
        if (!this.enabled) return;
        
        try {
            await AndroidAutoModule.disable();
            this.enabled = false;
            this.removeEventListeners();
            console.log('[AndroidAuto] Disabled successfully');
        } catch (error) {
            console.error('[AndroidAuto] Failed to disable:', error);
            throw error;
        }
    }
    
    /**
     * Configurar biblioteca de medios
     */
    static async setMediaLibrary(items: MediaItem[]): Promise<void> {
        if (!this.enabled) {
            throw new Error('[AndroidAuto] Not enabled. Call enable() first');
        }
        
        try {
            await AndroidAutoModule.setMediaLibrary(items);
            console.log(`[AndroidAuto] Library set with ${items.length} items`);
        } catch (error) {
            console.error('[AndroidAuto] Failed to set library:', error);
            throw error;
        }
    }
    
    /**
     * Actualizar metadata del contenido actual
     */
    static updateNowPlaying(metadata: MediaMetadata): void {
        if (!this.enabled) return;
        
        try {
            AndroidAutoModule.updateNowPlaying(metadata);
        } catch (error) {
            console.error('[AndroidAuto] Failed to update now playing:', error);
        }
    }
    
    /**
     * Registrar callback para navegación
     */
    static onBrowseRequest(callback: BrowseCallback): () => void {
        const id = Math.random().toString(36);
        this.browseCallbacks.set(id, callback);
        
        return () => {
            this.browseCallbacks.delete(id);
        };
    }
    
    /**
     * Registrar callback para reproducción
     */
    static onPlayFromMediaId(callback: PlayCallback): () => void {
        this.playCallback = callback;
        
        return () => {
            this.playCallback = null;
        };
    }
    
    /**
     * Verificar si está conectado
     */
    static async isConnected(): Promise<boolean> {
        if (!this.enabled) return false;
        
        try {
            return await AndroidAutoModule.getConnectionStatus();
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Verificar si está habilitado
     */
    static isEnabled(): boolean {
        return this.enabled;
    }
    
    // Event Listeners (por ahora vacíos)
    private static setupEventListeners(): void {
        console.log('[AndroidAuto] Event listeners setup');
    }
    
    private static removeEventListeners(): void {
        console.log('[AndroidAuto] Event listeners removed');
    }
}
```

### **Paso 3.2: Crear Hook useAndroidAuto**

**Archivo:** `src/player/features/androidAuto/useAndroidAuto.ts`

```typescript
import { useEffect } from 'react';
import { AndroidAutoControl } from './AndroidAutoControl';
import type { AndroidAutoConfig } from './types';

/**
 * Hook para integrar Android Auto con AudioFlavour
 * Uso opcional - no afecta funcionalidad base
 */
export function useAndroidAuto(config?: AndroidAutoConfig) {
    
    useEffect(() => {
        if (!config?.enabled) return;
        
        let unsubscribeBrowse: (() => void) | undefined;
        let unsubscribePlay: (() => void) | undefined;
        
        const setup = async () => {
            try {
                // Habilitar Android Auto
                await AndroidAutoControl.enable();
                
                // Configurar biblioteca si se proporciona
                if (config.library) {
                    await AndroidAutoControl.setMediaLibrary(config.library);
                }
                
                // Registrar callbacks
                if (config.onBrowseRequest) {
                    unsubscribeBrowse = AndroidAutoControl.onBrowseRequest(
                        config.onBrowseRequest
                    );
                }
                
                if (config.onPlayFromMediaId) {
                    unsubscribePlay = AndroidAutoControl.onPlayFromMediaId(
                        config.onPlayFromMediaId
                    );
                }
                
            } catch (error) {
                console.error('[useAndroidAuto] Setup failed:', error);
            }
        };
        
        setup();
        
        // Cleanup
        return () => {
            unsubscribeBrowse?.();
            unsubscribePlay?.();
        };
        
    }, [config?.enabled, config?.library, config?.onBrowseRequest, config?.onPlayFromMediaId]);
}
```

---

## FASE 4: Testing Inicial

### **Paso 4.1: Exportar desde Index Principal**

**Archivo:** `src/index.ts`

```typescript
// Añadir al final del archivo
export * from './player/features/androidAuto';
```

### **Paso 4.2: Compilar y Verificar**

```bash
# Compilar TypeScript
yarn build

# Verificar que no hay errores
# El módulo debe estar disponible pero sin funcionalidad aún
```

### **Paso 4.3: Test Básico en App**

```typescript
// En tu app de prueba
import { AndroidAutoControl } from 'react-native-video';

// Verificar que el módulo existe
console.log('AndroidAutoControl:', AndroidAutoControl);

// Intentar habilitar (debe logear pero no hacer nada aún)
AndroidAutoControl.enable()
    .then(() => console.log('Enabled'))
    .catch(err => console.error('Error:', err));
```

**Resultado esperado:**
- ✅ Compila sin errores
- ✅ Módulo nativo se encuentra
- ✅ Métodos se pueden llamar
- ✅ Logs aparecen en consola
- ⚠️ Funcionalidad real aún no implementada

---

## FASE 5: MediaCache (Almacenamiento)

### **Paso 5.1: Crear MediaCache**

**Archivo:** `android/src/main/java/com/brentvatne/exoplayer/androidauto/MediaCache.kt`

```kotlin
package com.brentvatne.exoplayer.androidauto

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.concurrent.ConcurrentHashMap

class MediaCache(private val context: Context) {
    
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    private val gson = Gson()
    private val memoryCache = ConcurrentHashMap<String, List<CachedMediaItem>>()
    
    fun initialize() {
        loadCacheFromDisk()
        Log.d(TAG, "MediaCache initialized")
    }
    
    fun getChildren(parentId: String): List<MediaItem> {
        val cached = memoryCache[parentId] ?: emptyList()
        Log.d(TAG, "getChildren($parentId): ${cached.size} items")
        return cached.map { it.toMediaItem() }
    }
    
    fun updateChildren(parentId: String, items: List<MediaItem>) {
        val cachedItems = items.map { CachedMediaItem.fromMediaItem(it) }
        memoryCache[parentId] = cachedItems
        saveCacheToDisk()
        Log.d(TAG, "updateChildren($parentId): ${items.size} items cached")
    }
    
    fun clear() {
        memoryCache.clear()
        prefs.edit().clear().apply()
        Log.d(TAG, "Cache cleared")
    }
    
    private fun loadCacheFromDisk() {
        try {
            val json = prefs.getString(CACHE_KEY, null) ?: return
            val type = object : TypeToken<Map<String, List<CachedMediaItem>>>() {}.type
            val diskCache: Map<String, List<CachedMediaItem>> = gson.fromJson(json, type)
            memoryCache.putAll(diskCache)
            Log.d(TAG, "Loaded ${memoryCache.size} cache entries from disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load cache from disk", e)
        }
    }
    
    private fun saveCacheToDisk() {
        try {
            val json = gson.toJson(memoryCache)
            prefs.edit().putString(CACHE_KEY, json).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save cache to disk", e)
        }
    }
    
    data class CachedMediaItem(
        val mediaId: String,
        val title: String?,
        val subtitle: String?,
        val artworkUri: String?,
        val isBrowsable: Boolean,
        val isPlayable: Boolean
    ) {
        fun toMediaItem(): MediaItem {
            return MediaItem.Builder()
                .setMediaId(mediaId)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setArtworkUri(artworkUri?.let { Uri.parse(it) })
                        .setIsBrowsable(isBrowsable)
                        .setIsPlayable(isPlayable)
                        .build()
                )
                .build()
        }
        
        companion object {
            fun fromMediaItem(item: MediaItem): CachedMediaItem {
                return CachedMediaItem(
                    mediaId = item.mediaId,
                    title = item.mediaMetadata.title?.toString(),
                    subtitle = item.mediaMetadata.subtitle?.toString(),
                    artworkUri = item.mediaMetadata.artworkUri?.toString(),
                    isBrowsable = item.mediaMetadata.isBrowsable ?: false,
                    isPlayable = item.mediaMetadata.isPlayable ?: false
                )
            }
        }
    }
    
    companion object {
        private const val TAG = "MediaCache"
        private const val PREFS_NAME = "android_auto_media_cache"
        private const val CACHE_KEY = "media_library"
    }
}
```

### **Paso 5.2: Integrar MediaCache en AndroidAutoModule**

```kotlin
// En AndroidAutoModule.kt

private val mediaCache: MediaCache by lazy { 
    MediaCache(reactApplicationContext) 
}

init {
    mediaCache.initialize()
}

@ReactMethod
fun setMediaLibrary(items: ReadableArray, promise: Promise) {
    try {
        val mediaItems = parseMediaItems(items)
        mediaCache.updateChildren("root", mediaItems)
        Log.d(TAG, "Media library cached: ${mediaItems.size} items")
        promise.resolve(true)
    } catch (e: Exception) {
        Log.e(TAG, "Failed to set media library", e)
        promise.reject("SET_LIBRARY_FAILED", e.message, e)
    }
}

private fun parseMediaItems(array: ReadableArray): List<MediaItem> {
    val items = mutableListOf<MediaItem>()
    
    for (i in 0 until array.size()) {
        val map = array.getMap(i) ?: continue
        
        val item = MediaItem.Builder()
            .setMediaId(map.getString("id") ?: continue)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(map.getString("title"))
                    .setSubtitle(map.getString("subtitle"))
                    .setArtist(map.getString("artist"))
                    .setArtworkUri(
                        map.getString("artworkUri")?.let { Uri.parse(it) }
                    )
                    .setIsBrowsable(map.getBoolean("browsable"))
                    .setIsPlayable(map.getBoolean("playable"))
                    .build()
            )
            .build()
        
        items.add(item)
    }
    
    return items
}
```

---

## FASE 6: Siguiente - MediaBrowserService

Los siguientes pasos incluirán:

1. **MediaBrowserService.kt** - Servicio principal
2. **MediaBrowserCallback.kt** - Callbacks de reproducción
3. **Modificar VideoPlaybackService** - Añadir getter de MediaSession
4. **AndroidManifest.xml** - Declarar servicio
5. **automotive_app_desc.xml** - Capacidades Android Auto
6. **Eventos bidireccionales** - Comunicación JS ↔ Native completa
7. **Testing completo** - Verificar funcionalidad end-to-end
8. **Documentación** - Guía de uso para apps

---

## Checklist de Progreso

- [x] FASE 1: Estructura base
- [x] FASE 2: Módulo nativo base
- [x] FASE 3: API JavaScript base
- [x] FASE 4: Testing inicial
- [x] FASE 5: MediaCache con URIs
- [x] FASE 6: AndroidAutoMediaBrowserService
- [x] FASE 7: GlobalPlayerManager (Nuevo)
- [x] FASE 8: Integración con VideoPlaybackService
- [x] FASE 9: Audio Focus y AudioAttributes
- [x] FASE 10: AndroidManifest y permisos
- [x] FASE 11: Testing completo
- [x] FASE 12: Documentación

---

## Componentes Implementados

### **Nativos (Kotlin)**
1. ✅ `GlobalPlayerManager.kt` - Singleton con ExoPlayer
2. ✅ `AndroidAutoMediaBrowserService.kt` - Servicio de Android Auto
3. ✅ `MediaCache.kt` - Caché persistente con URIs
4. ✅ `AndroidAutoModule.kt` - Bridge React Native
5. ✅ `VideoPlaybackService.kt` - Foreground Service (modificado)

### **JavaScript/TypeScript**
1. ✅ `AndroidAutoControl.ts` - API estática
2. ✅ `useAndroidAuto.ts` - Hook React
3. ✅ `types.ts` - Definiciones TypeScript
4. ✅ `index.ts` - Exportaciones

### **Configuración**
1. ✅ `AndroidManifest.xml` - Permisos y servicios
2. ✅ `automotive_app_desc.xml` - Capacidades Android Auto

---

## Testing Realizado

### ✅ Test 1: Navegación con App Cerrada
- Force-stop app
- Abrir Android Auto
- Navegar por biblioteca
- **Resultado:** ✅ Funciona perfectamente

### ✅ Test 2: Reproducción con App Cerrada
- Force-stop app
- Abrir Android Auto
- Seleccionar contenido
- **Resultado:** ✅ Audio se reproduce, notificación aparece

### ✅ Test 3: Sincronización
- Reproducir desde Android Auto
- Controlar desde notificación móvil
- Verificar sincronización
- **Resultado:** ✅ Sincronización perfecta

### ✅ Test 4: Audio Focus
- Reproducir desde Android Auto
- Recibir llamada telefónica
- Verificar pausa automática
- **Resultado:** ✅ Audio focus funciona correctamente

---

## Notas Importantes

1. **Implementación completa** - Todas las fases completadas
2. **Sin breaking changes** - Código existente no afectado
3. **Opt-in total** - Solo se activa si app lo habilita
4. **Testing exhaustivo** - Verificado en múltiples escenarios
5. **Documentación completa** - Ver [native-playback.md](./native-playback.md)

---

**Estado actual:** ✅ **IMPLEMENTACIÓN COMPLETA Y FUNCIONAL**

**Próximos pasos opcionales:**
- Implementar búsqueda (`onSearch`)
- Soporte para colas de reproducción
- Metadata dinámica durante reproducción
- Integración con sistema de descargas offline
