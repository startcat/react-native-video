# SourceManager - Gestión Centralizada de Sources

## 📋 Propósito

El **SourceManager** es el responsable de gestionar el ciclo de vida completo de las fuentes de reproducción (sources). Encapsula el `SourceClass` existente y proporciona una API limpia para el PlayerController, manejando la selección de manifests, cooking de sources (DRM, headers, URIs), y transiciones entre contenidos.

## 📏 Migración de SourceClass

### Ubicación Actual
```
src/player/modules/source/sourceClass.ts
```

### Nueva Ubicación
```
src/player/core/source/SourceClass.ts
```

### Razón de la Migración
- **Centralización**: Mover a `core/` junto con otros componentes fundamentales
- **Arquitectura clara**: Separar lógica core de features/flavours
- **Encapsulación**: El SourceManager será la única interfaz pública
- **Mantenibilidad**: Facilita testing y evolución independiente

## 🎯 Responsabilidades

### ✅ Lo que DEBE hacer:
1. **Gestionar SourceClass**: Crear, configurar y mantener instancias de SourceClass
2. **Seleccionar manifests**: Elegir el manifest apropiado según contexto (Cast, Live, plataforma)
3. **Cocinar sources**: Procesar URIs con DRM, headers, parámetros DVR
4. **Gestionar transiciones**: Cambiar entre contenidos de forma segura
5. **Validar sources**: Verificar que los sources son válidos antes de cargar
6. **Exponer metadata**: Proporcionar información del source actual (isLive, isDVR, etc.)
7. **Manejar contenido offline**: Gestionar binarios descargados

### ❌ Lo que NO debe hacer:
- ❌ Gestionar el reproductor directamente (eso es del Transport)
- ❌ Tracking de progreso (eso es del ProgressManager)
- ❌ Emitir eventos de analytics (eso es del PlayerController)
- ❌ Gestionar UI o estado React

## 🔌 Interface Principal

```typescript
interface ISourceManager {
  // === CONFIGURACIÓN ===
  
  /**
   * Inicializa el manager con configuración
   * @param config Configuración del source manager
   */
  initialize(config: SourceManagerConfig): void;
  
  // === GESTIÓN DE SOURCES ===
  
  /**
   * Carga un nuevo source
   * @param sourceData Datos del contenido a cargar
   * @returns Source procesado listo para el transport
   */
  loadSource(sourceData: SourceData): Promise<ProcessedSource>;
  
  /**
   * Cambia a un nuevo source
   * Similar a loadSource pero puede incluir lógica de transición
   * @param sourceData Datos del nuevo contenido
   * @returns Source procesado
   */
  changeSource(sourceData: SourceData): Promise<ProcessedSource>;
  
  /**
   * Recarga el source actual (DVR streams)
   * Útil para actualizar la ventana DVR sin cambiar de contenido
   */
  reloadCurrentSource(): Promise<ProcessedSource>;
  
  /**
   * Obtiene el source actual procesado
   * @returns Source actual o null si no hay ninguno cargado
   */
  getCurrentSource(): ProcessedSource | null;
  
  /**
   * Limpia el source actual
   */
  clearSource(): void;
  
  // === METADATA DEL SOURCE ===
  
  /**
   * Verifica si el source actual es contenido live
   */
  isLive(): boolean;
  
  /**
   * Verifica si el source actual tiene DVR
   */
  isDVR(): boolean;
  
  /**
   * Verifica si el source actual es para Cast
   */
  isCast(): boolean;
  
  /**
   * Verifica si el source es contenido descargado
   */
  isDownloaded(): boolean;
  
  /**
   * Obtiene la ventana DVR en segundos
   * @returns Segundos de ventana DVR o undefined si no aplica
   */
  getDVRWindowSeconds(): number | undefined;
  
  /**
   * Obtiene el manifest actual seleccionado
   */
  getCurrentManifest(): IManifest | undefined;
  
  /**
   * Obtiene la configuración DRM del source actual
   */
  getCurrentDRM(): IDrm | undefined;
  
  /**
   * Verifica si el source está listo para reproducir
   */
  isReady(): boolean;
  
  // === CONFIGURACIÓN DVR ===
  
  /**
   * Configura la ventana DVR para streams live
   * @param seconds Segundos de ventana DVR
   */
  setDVRWindow(seconds: number): void;
  
  /**
   * Configura el timestamp de inicio para DVR
   * @param timestamp Unix timestamp de inicio
   */
  setLiveStartTimestamp(timestamp: number): void;
  
  // === CALLBACKS ===
  
  /**
   * Registra callback para cuando cambia el source
   * @param callback Función a llamar cuando cambia
   */
  onSourceChange(callback: (source: ProcessedSource) => void): void;
  
  /**
   * Registra callback para errores de source
   * @param callback Función a llamar en caso de error
   */
  onSourceError(callback: (error: PlayerError) => void): void;
  
  // === LIFECYCLE ===
  
  /**
   * Limpia recursos y callbacks
   */
  dispose(): void;
}
```

## 📦 Tipos de Datos

```typescript
// === CONFIGURACIÓN ===

interface SourceManagerConfig {
  /** Función personalizada para seleccionar el mejor manifest */
  getBestManifest?: (manifests: IManifest[], isCast?: boolean, isLive?: boolean) => IManifest | undefined;
  
  /** Función personalizada para construir URIs de source */
  getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartTimestamp?: number) => string;
  
  /** Callback cuando cambia el source */
  onSourceChange?: (source: ProcessedSource) => void;
  
  /** Callback para errores de source */
  onSourceError?: (error: PlayerError) => void;
}

// === DATOS DE ENTRADA ===

interface SourceData {
  /** ID del contenido (para offline) */
  id?: number;
  
  /** Manifests disponibles */
  manifests: IManifest[];
  
  /** Metadata del contenido */
  metadata?: ContentMetadata;
  
  /** Headers HTTP personalizados */
  headers?: Record<string, string>;
  
  /** Posición inicial de reproducción en segundos */
  startPosition?: number;
  
  /** Si es contenido live */
  isLive?: boolean;
  
  /** Si es para Cast */
  isCast?: boolean;
  
  /** Ventana DVR en segundos (opcional) */
  dvrWindowSeconds?: number;
  
  /** Timestamp de inicio para DVR (opcional) */
  liveStartTimestamp?: number;
}

interface ContentMetadata {
  title?: string;
  subtitle?: string;
  artist?: string;
  description?: string;
  poster?: string;
  squaredPoster?: string;
}

// === SOURCE PROCESADO (OUTPUT) ===

interface ProcessedSource {
  /** ID del contenido */
  id?: number;
  
  /** URI del source (ya procesado con DRM, headers, etc.) */
  uri: string;
  
  /** Tipo de source */
  type?: 'hls' | 'dash' | 'mp4' | 'other';
  
  /** Headers HTTP */
  headers?: Record<string, string>;
  
  /** Configuración DRM */
  drm?: IDrm;
  
  /** Posición inicial de reproducción */
  startPosition?: number;
  
  /** Metadata del contenido */
  metadata?: ContentMetadata;
  
  /** Información adicional del source */
  sourceInfo: SourceInfo;
}

interface SourceInfo {
  /** Si es contenido live */
  isLive: boolean;
  
  /** Si tiene DVR */
  isDVR: boolean;
  
  /** Si es para Cast */
  isCast: boolean;
  
  /** Si es contenido descargado */
  isDownloaded: boolean;
  
  /** Si es formato HLS */
  isHLS: boolean;
  
  /** Si es formato DASH */
  isDASH: boolean;
  
  /** Si es un "fake VOD" (directo acotado) */
  isFakeVOD: boolean;
  
  /** Ventana DVR en segundos */
  dvrWindowSeconds?: number;
  
  /** Manifest seleccionado */
  manifest?: IManifest;
}

// === TIPOS EXISTENTES (del sistema actual) ===

interface IManifest {
  manifestURL: string;
  type: STREAM_FORMAT_TYPE;
  dvr_window_minutes?: number;
  drm?: {
    type: 'fairplay' | 'widevine' | 'playready';
    licenseServer?: string;
    certificateUrl?: string;
    headers?: Record<string, string>;
  };
  // ... otros campos del manifest actual
}

interface IDrm {
  type: 'fairplay' | 'widevine' | 'playready';
  licenseServer?: string;
  certificateUrl?: string;
  headers?: Record<string, string>;
  // ... configuración DRM completa
}

enum STREAM_FORMAT_TYPE {
  HLS = 'hls',
  DASH = 'dash',
  MP4 = 'mp4',
  OTHER = 'other'
}
```

## 🏗️ Esquema de Implementación

```typescript
import { SourceClass } from './SourceClass';
import { PlayerError } from '../errors/PlayerError';

class SourceManager implements ISourceManager {
  private sourceClass: SourceClass | null = null;
  private config: SourceManagerConfig = {};
  private isInitialized = false;
  
  // Callbacks
  private onSourceChangeCallback?: (source: ProcessedSource) => void;
  private onSourceErrorCallback?: (error: PlayerError) => void;
  
  // === CONFIGURACIÓN ===
  
  initialize(config: SourceManagerConfig): void {
    this.config = config;
    this.onSourceChangeCallback = config.onSourceChange;
    this.onSourceErrorCallback = config.onSourceError;
    this.isInitialized = true;
  }
  
  // === GESTIÓN DE SOURCES ===
  
  async loadSource(sourceData: SourceData): Promise<ProcessedSource> {
    this.ensureInitialized();
    
    try {
      // Crear nueva instancia de SourceClass
      this.sourceClass = new SourceClass({
        id: sourceData.id,
        manifests: sourceData.manifests,
        title: sourceData.metadata?.title,
        subtitle: sourceData.metadata?.subtitle,
        artist: sourceData.metadata?.artist,
        description: sourceData.metadata?.description,
        poster: sourceData.metadata?.poster,
        squaredPoster: sourceData.metadata?.squaredPoster,
        headers: sourceData.headers,
        startPosition: sourceData.startPosition,
        isLive: sourceData.isLive,
        isCast: sourceData.isCast,
        getBestManifest: this.config.getBestManifest,
        getSourceUri: this.config.getSourceUri,
      });
      
      // Convertir SourceClass a ProcessedSource
      const processedSource = this.sourceClassToProcessedSource();
      
      // Notificar cambio
      this.onSourceChangeCallback?.(processedSource);
      
      return processedSource;
      
    } catch (error) {
      const playerError = error instanceof PlayerError 
        ? error 
        : new PlayerError('SOURCE_LOAD_FAILED', { originalError: error });
      
      this.onSourceErrorCallback?.(playerError);
      throw playerError;
    }
  }
  
  async changeSource(sourceData: SourceData): Promise<ProcessedSource> {
    // Por ahora, changeSource es igual a loadSource
    // En el futuro podría incluir lógica de transición
    return this.loadSource(sourceData);
  }
  
  async reloadCurrentSource(): Promise<ProcessedSource> {
    this.ensureInitialized();
    
    if (!this.sourceClass) {
      throw new PlayerError('SOURCE_NO_CURRENT_SOURCE', {
        message: 'Cannot reload: no current source loaded'
      });
    }
    
    try {
      // Recargar DVR stream
      this.sourceClass.reloadDvrStream();
      
      const processedSource = this.sourceClassToProcessedSource();
      this.onSourceChangeCallback?.(processedSource);
      
      return processedSource;
      
    } catch (error) {
      const playerError = error instanceof PlayerError 
        ? error 
        : new PlayerError('SOURCE_RELOAD_FAILED', { originalError: error });
      
      this.onSourceErrorCallback?.(playerError);
      throw playerError;
    }
  }
  
  getCurrentSource(): ProcessedSource | null {
    if (!this.sourceClass || !this.sourceClass.isReady) {
      return null;
    }
    return this.sourceClassToProcessedSource();
  }
  
  clearSource(): void {
    this.sourceClass = null;
  }
  
  // === METADATA DEL SOURCE ===
  
  isLive(): boolean {
    return this.sourceClass?.isLive ?? false;
  }
  
  isDVR(): boolean {
    return this.sourceClass?.isDVR ?? false;
  }
  
  isCast(): boolean {
    return this.sourceClass?.isCast ?? false;
  }
  
  isDownloaded(): boolean {
    return this.sourceClass?.isDownloaded ?? false;
  }
  
  getDVRWindowSeconds(): number | undefined {
    return this.sourceClass?.dvrWindowSeconds;
  }
  
  getCurrentManifest(): IManifest | undefined {
    return this.sourceClass?.currentManifest;
  }
  
  getCurrentDRM(): IDrm | undefined {
    return this.sourceClass?.drm;
  }
  
  isReady(): boolean {
    return this.sourceClass?.isReady ?? false;
  }
  
  // === CONFIGURACIÓN DVR ===
  
  setDVRWindow(seconds: number): void {
    if (this.sourceClass) {
      this.sourceClass.dvrWindowSeconds = seconds;
    }
  }
  
  setLiveStartTimestamp(timestamp: number): void {
    if (this.sourceClass) {
      this.sourceClass.liveStartProgramTimestamp = timestamp;
    }
  }
  
  // === CALLBACKS ===
  
  onSourceChange(callback: (source: ProcessedSource) => void): void {
    this.onSourceChangeCallback = callback;
  }
  
  onSourceError(callback: (error: PlayerError) => void): void {
    this.onSourceErrorCallback = callback;
  }
  
  // === LIFECYCLE ===
  
  dispose(): void {
    this.sourceClass = null;
    this.onSourceChangeCallback = undefined;
    this.onSourceErrorCallback = undefined;
    this.isInitialized = false;
  }
  
  // === HELPERS PRIVADOS ===
  
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new PlayerError('SOURCE_MANAGER_NOT_INITIALIZED', {
        message: 'SourceManager must be initialized before use'
      });
    }
  }
  
  /**
   * Convierte SourceClass al formato ProcessedSource
   */
  private sourceClassToProcessedSource(): ProcessedSource {
    if (!this.sourceClass || !this.sourceClass.videoSource) {
      throw new PlayerError('SOURCE_NOT_READY', {
        message: 'Source is not ready'
      });
    }
    
    return {
      id: this.sourceClass.videoSource.id,
      uri: this.sourceClass.videoSource.uri,
      type: this.sourceClass.videoSource.type,
      headers: this.sourceClass.videoSource.headers,
      drm: this.sourceClass.drm,
      startPosition: this.sourceClass.videoSource.startPosition,
      metadata: this.sourceClass.videoSource.metadata,
      sourceInfo: {
        isLive: this.sourceClass.isLive,
        isDVR: this.sourceClass.isDVR,
        isCast: this.sourceClass.isCast,
        isDownloaded: this.sourceClass.isDownloaded,
        isHLS: this.sourceClass.isHLS,
        isDASH: this.sourceClass.isDASH,
        isFakeVOD: this.sourceClass.isFakeVOD,
        dvrWindowSeconds: this.sourceClass.dvrWindowSeconds,
        manifest: this.sourceClass.currentManifest,
      },
    };
  }
}
```

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│                   PlayerController                      │
│  (Solicita carga de sources)                            │
└─────────────────────────────────────────────────────────┘
                          ↓
                  loadSource(sourceData)
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    SourceManager                        │
│  (Gestiona SourceClass y expone API limpia)            │
└─────────────────────────────────────────────────────────┘
                          ↓
              Crea/configura SourceClass
                          ↓
┌─────────────────────────────────────────────────────────┐
│                     SourceClass                         │
│  (Lógica de cooking: manifests, DRM, URIs)             │
│  - Selecciona mejor manifest                            │
│  - Procesa DRM                                          │
│  - Construye URI con parámetros                         │
│  - Maneja contenido offline                             │
└─────────────────────────────────────────────────────────┘
                          ↓
                  ProcessedSource
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   PlayerTransport                       │
│  (Carga el source en el reproductor)                    │
└─────────────────────────────────────────────────────────┘
```

## 📝 Casos de Uso

### Caso 1: Carga de Source VOD

```typescript
// En PlayerController
async loadVODContent(playlistItem: PlaylistItem) {
  const processedSource = await this.sourceManager.loadSource({
    id: playlistItem.id,
    manifests: playlistItem.manifests,
    metadata: {
      title: playlistItem.title,
      subtitle: playlistItem.subtitle,
      poster: playlistItem.poster,
    },
    headers: playlistItem.headers,
    startPosition: 0,
    isLive: false,
    isCast: this.isCasting,
  });
  
  // Cargar en el transport
  await this.transport.load(processedSource, processedSource.metadata);
  
  // Notificar al progress manager
  this.progressManager.onContentLoaded({
    duration: 0, // Se actualizará con onLoad del transport
    isLive: false,
  });
}
```

### Caso 2: Carga de Source Live con DVR

```typescript
// En PlayerController
async loadLiveContent(playlistItem: PlaylistItem) {
  const processedSource = await this.sourceManager.loadSource({
    id: playlistItem.id,
    manifests: playlistItem.manifests,
    metadata: {
      title: playlistItem.title,
      poster: playlistItem.poster,
    },
    isLive: true,
    isCast: this.isCasting,
    dvrWindowSeconds: 3600, // 1 hora de DVR
  });
  
  // Verificar si tiene DVR
  if (this.sourceManager.isDVR()) {
    console.log('DVR Window:', this.sourceManager.getDVRWindowSeconds());
  }
  
  // Cargar en el transport
  await this.transport.load(processedSource, processedSource.metadata);
  
  // Configurar progress manager para DVR
  this.progressManager.onContentLoaded({
    duration: processedSource.sourceInfo.dvrWindowSeconds || 0,
    isLive: true,
    seekableRange: { start: 0, end: processedSource.sourceInfo.dvrWindowSeconds || 0 },
    epgUrl: playlistItem.epgUrl,
  });
}
```

### Caso 3: Cambio de Source (Playlist Auto-Advance)

```typescript
// En PlayerController
async playNextInPlaylist() {
  const nextItem = this.playlist.getNext();
  
  if (!nextItem) {
    console.log('No more items in playlist');
    return;
  }
  
  // Cambiar source
  const processedSource = await this.sourceManager.changeSource({
    id: nextItem.id,
    manifests: nextItem.manifests,
    metadata: {
      title: nextItem.title,
      subtitle: nextItem.subtitle,
      poster: nextItem.poster,
    },
    isLive: nextItem.isLive,
    isCast: this.isCasting,
  });
  
  // Cargar en transport
  await this.transport.load(processedSource, processedSource.metadata);
  
  // Actualizar progress manager
  this.progressManager.reset();
  this.progressManager.onContentLoaded({
    duration: 0,
    isLive: processedSource.sourceInfo.isLive,
  });
}
```

### Caso 4: Recarga de DVR Stream

```typescript
// En PlayerController
async reloadDVRWindow() {
  if (!this.sourceManager.isDVR()) {
    console.warn('Current source is not DVR');
    return;
  }
  
  try {
    // Recargar el source (actualiza la ventana DVR)
    const processedSource = await this.sourceManager.reloadCurrentSource();
    
    // Recargar en el transport
    await this.transport.load(processedSource, processedSource.metadata);
    
    console.log('DVR window reloaded successfully');
    
  } catch (error) {
    console.error('Failed to reload DVR window:', error);
  }
}
```

### Caso 5: Cambio a Cast

```typescript
// En PlayerController
async switchToCast() {
  const currentSource = this.sourceManager.getCurrentSource();
  
  if (!currentSource) {
    console.warn('No current source to cast');
    return;
  }
  
  // Obtener posición actual
  const currentTime = this.progressManager.getCurrentTime();
  
  // Recargar source con flag de Cast
  const castSource = await this.sourceManager.changeSource({
    id: currentSource.id,
    manifests: [currentSource.sourceInfo.manifest!],
    metadata: currentSource.metadata,
    startPosition: currentTime,
    isLive: currentSource.sourceInfo.isLive,
    isCast: true, // ← Activar Cast
    dvrWindowSeconds: currentSource.sourceInfo.dvrWindowSeconds,
  });
  
  // Cambiar transport a Cast
  this.transport = this.castTransport;
  
  // Cargar en Cast
  await this.transport.load(castSource, castSource.metadata);
  await this.transport.seek(currentTime);
}
```

### Caso 6: Contenido Offline

```typescript
// En PlayerController
async loadOfflineContent(contentId: number) {
  const processedSource = await this.sourceManager.loadSource({
    id: contentId,
    manifests: [], // Los manifests se obtienen del storage offline
    metadata: {
      title: 'Offline Content',
    },
    isLive: false,
    isCast: false,
  });
  
  // Verificar que es contenido descargado
  if (this.sourceManager.isDownloaded()) {
    console.log('Loading offline content from:', processedSource.uri);
  }
  
  await this.transport.load(processedSource, processedSource.metadata);
}
```

## ✅ Criterios de Validación

Una implementación de SourceManager es correcta si:

1. ✅ **Encapsulación**: SourceClass no es accesible directamente desde fuera
2. ✅ **Validación**: Valida manifests y datos antes de crear SourceClass
3. ✅ **Manejo de errores**: Convierte errores a PlayerError y notifica callbacks
4. ✅ **Estado consistente**: `getCurrentSource()` siempre refleja el estado real
5. ✅ **Metadata accesible**: Todos los getters (isLive, isDVR, etc.) funcionan correctamente
6. ✅ **Callbacks funcionan**: onSourceChange y onSourceError se invocan apropiadamente
7. ✅ **Soporte Cast**: Selecciona manifests correctos para Cast vs Video nativo
8. ✅ **Soporte DVR**: Maneja correctamente ventanas DVR y recargas
9. ✅ **Contenido offline**: Detecta y carga correctamente binarios descargados
10. ✅ **Lifecycle limpio**: dispose() libera todos los recursos

## 🎯 Beneficios

### 1. **Encapsulación de SourceClass**
```typescript
// ANTES: Flavours accedían directamente a SourceClass
const sourceClass = new SourceClass({ ... });
if (sourceClass.isLive) { ... }
if (sourceClass.isDVR) { ... }

// DESPUÉS: API limpia del SourceManager
const source = await sourceManager.loadSource({ ... });
if (sourceManager.isLive()) { ... }
if (sourceManager.isDVR()) { ... }
```

### 2. **Simplificación de Flavours**
- Los flavours ya no necesitan conocer SourceClass
- No necesitan gestionar la lógica de cooking de sources
- Reducción estimada: **~100 líneas por flavour** = **~400 líneas totales**

### 3. **Manejo de Errores Centralizado**
- Todos los errores de source se convierten a PlayerError
- Callbacks de error permiten manejo consistente
- Fácil debugging y logging

### 4. **Facilita Testing**
- SourceManager es fácil de mockear
- SourceClass se puede testear independientemente
- Tests más simples en PlayerController

## 🔍 Próximos Pasos

Una vez validado este diseño:
1. **Mover SourceClass** de `modules/source/` a `core/source/`
2. **Implementar SourceManager** clase
3. **Actualizar PlayerController** para usar SourceManager
4. **Refactorizar flavours** para usar SourceManager
5. **Migrar tests** existentes
6. **Documentar migración** desde sistema actual

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Estado**: 📝 Diseño - Pendiente de validación