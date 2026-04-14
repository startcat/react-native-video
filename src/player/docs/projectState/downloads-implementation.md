---
marp: true
theme: default
paginate: true
---

# Implementación del Sistema de Descargas

Este documento describe la implementación técnica del sistema de descargas offline en la librería Overon OTT Player.

---

## Índice

1. [Arquitectura General](#arquitectura-general)
2. [Tipos de Descargas](#tipos-de-descargas)
3. [Encriptación y DRM](#encriptación-y-drm)
4. [Almacenamiento](#almacenamiento)
5. [Flujo de Descarga](#flujo-de-descarga)
6. [Diferencias entre Plataformas](#diferencias-entre-plataformas)
7. [Implementación en 3Cat](#implementación-en-3cat)

---

## Arquitectura General

El sistema de descargas está organizado en capas:

```
┌─────────────────────────────────────────────────────────────┐
│                    DownloadsManager                          │
│         (Coordinación de alto nivel, políticas globales)     │
├─────────────────────────────────────────────────────────────┤
│     QueueManager    │   ConfigManager   │   ProfileManager   │
│   (Cola y estados)  │  (Configuración)  │    (Perfiles)      │
├─────────────────────────────────────────────────────────────┤
│              DownloadService (Estrategias)                   │
│    ┌────────────────────┬────────────────────┐              │
│    │ BinaryDownloadSvc  │ StreamDownloadSvc  │              │
│    │   (Archivos MP4)   │   (HLS/DASH)       │              │
│    └────────────────────┴────────────────────┘              │
├─────────────────────────────────────────────────────────────┤
│                     NativeManager                            │
│        (Puente hacia módulos nativos iOS/Android)            │
├─────────────────────────────────────────────────────────────┤
│   DownloadsModule2 (iOS)  │  DownloadsModule2 (Android)     │
│   AVAssetDownloadTask     │  ExoPlayer DownloadManager      │
└─────────────────────────────────────────────────────────────┘
```

### Componentes Principales

| Componente                | Ubicación                                    | Responsabilidad                                              |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| **DownloadsManager**      | `managers/DownloadsManager.ts`               | API pública, coordinación entre managers, políticas globales |
| **QueueManager**          | `managers/QueueManager.ts`                   | Gestión de cola de descargas, estados, concurrencia          |
| **NativeManager**         | `managers/NativeManager.ts`                  | Puente hacia módulos nativos, eventos                        |
| **StreamDownloadService** | `services/download/StreamDownloadService.ts` | Descargas HLS/DASH con DRM                                   |
| **BinaryDownloadService** | `services/download/BinaryDownloadService.ts` | Descargas de archivos binarios                               |
| **StorageService**        | `services/storage/StorageService.ts`         | Gestión de almacenamiento local                              |

---

## Tipos de Descargas

### 1. Descargas Binarias (BINARY)

Archivos completos descargados directamente (MP4, MP3, etc.).

```typescript
interface BinaryDownloadTask {
	id: string;
	url: string;
	destination: string;
	title?: string;
	headers?: Record<string, string>;
	progressInterval?: number;
	resumable?: boolean;
}
```

**Características:**

- Soporta descargas en segundo plano
- Soporta reanudación de descargas pausadas
- Progreso granular con velocidad y tiempo estimado

### 2. Descargas de Streams (STREAM)

Contenido HLS/DASH descargado mediante APIs nativas del sistema.

```typescript
interface StreamDownloadTask {
	id: string;
	manifestUrl: string;
	title: string;
	config: StreamDownloadConfig;
	estimatedSize?: number;
	headers?: Record<string, string>;
	subtitles?: SubtitleInfo[];
}

interface StreamDownloadConfig {
	type: "DASH" | "HLS";
	quality?: "auto" | "low" | "medium" | "high" | "max";
	audioLanguages?: string[];
	subtitleLanguages?: string[];
	drm?: IDrm;
}
```

**Características:**

- Descarga de segmentos de video adaptativos
- Selección de calidad configurable
- Soporte para múltiples pistas de audio y subtítulos
- Integración nativa con DRM

---

## Encriptación y DRM

### Sistemas DRM Soportados

| Sistema       | iOS | Android | Uso                            |
| ------------- | --- | ------- | ------------------------------ |
| **FairPlay**  | ✅  | ❌      | Contenido protegido en iOS     |
| **Widevine**  | ❌  | ✅      | Contenido protegido en Android |
| **PlayReady** | ❌  | ✅      | Alternativa en Android         |

### Configuración DRM

```typescript
interface IDrm {
	type?: DRM_TYPE; // FAIRPLAY, WIDEVINE, PLAYREADY
	licenseServer?: string; // URL del servidor de licencias
	headers?: Headers; // Headers HTTP para autenticación
	contentId?: string; // ID del contenido
	certificateUrl?: string; // URL del certificado (FairPlay)
	base64Certificate?: boolean;
	drmScheme?: string;
	drmMessage?: string; // Token DRM para descargas offline
}
```

### Flujo de Encriptación para Descargas Offline

#### 1. Preparación de la Licencia Offline

Cuando se descarga contenido protegido, se solicita una licencia con expiración extendida:

```typescript
export const setOfflineExpirationDate = (
	drm: IDrm | undefined
): IDrm | undefined => {
	if (drm?.licenseServer) {
		// Añadir flag offline=true para obtener licencia de larga duración
		const licenseServer = drm.licenseServer.includes("?")
			? `${drm.licenseServer}&offline=true`
			: `${drm.licenseServer}?offline=true`;

		return {
			...drm,
			licenseServer,
			drmMessage: licenseServer, // Token para Axinom offline
		};
	}
	return drm;
};
```

**Nota:** El parámetro `offline=true` indica al servidor de licencias que debe emitir una licencia con expiración extendida (típicamente ~30 días en lugar de horas).

#### 2. Descarga de Licencia (Android - Widevine)

En Android, el `OfflineLicenseManager` gestiona las licencias offline:

```java
// android/.../license/OfflineLicenseManager.java
public void downloadLicenseWithResult(
    String licenseServerUrl,
    String manifestUrl,
    String drmMessage,
    boolean autoSave
) {
    // Descarga y almacena la licencia Widevine
    // La licencia se guarda en el almacenamiento interno
    // Expiración mínima configurable: LICENSE_MIN_EXPIRE_SECONDS = 2629743 (~30 días)
}
```

**Operaciones de licencia disponibles:**

- `downloadLicense()` - Descarga y almacena licencia
- `checkLicenseValid()` - Verifica validez de licencia
- `releaseLicense()` - Libera licencia específica
- `releaseAllLicenses()` - Libera todas las licencias
- `getLicenseKeys()` - Restaura claves de licencia

#### 3. Descarga de Licencia (iOS - FairPlay)

En iOS, el `AVContentKeySession` gestiona las claves de contenido:

```swift
private var contentKeySession: AVContentKeySession?

func setupContentKeySession() {
    // Configura la sesión de claves de contenido
    // Las claves FairPlay se almacenan en el keychain del dispositivo
}
```

### Almacenamiento de Licencias

| Plataforma  | Ubicación                      | Formato                                      |
| ----------- | ------------------------------ | -------------------------------------------- |
| **Android** | `filesDir/Downloads/licenses/` | Archivos binarios de licencia Widevine       |
| **iOS**     | Keychain del sistema           | Claves FairPlay gestionadas por AVFoundation |

### API de DRM en NativeManager

```typescript
// Descargar licencia para contenido
async downloadLicense(contentId: string, drmConfig: IDrm): Promise<void>

// Verificar si la licencia es válida
async checkLicense(contentId: string): Promise<boolean>

// Renovar licencia existente
async renewLicense(contentId: string): Promise<void>

// Liberar licencia
async releaseLicense(contentId: string): Promise<void>

// Liberar todas las licencias
async releaseAllLicenses(): Promise<void>
```

### Estados de Licencia DRM

```typescript
interface DownloadItem {
	stats: {
		drmLicenseStatus?: "pending" | "acquired" | "expired" | "none";
		// ...
	};
}
```

| Estado     | Descripción                              |
| ---------- | ---------------------------------------- |
| `pending`  | Licencia solicitada, esperando respuesta |
| `acquired` | Licencia válida y almacenada             |
| `expired`  | Licencia expirada, requiere renovación   |
| `none`     | Contenido sin DRM                        |

---

## Almacenamiento

### Estructura de Directorios

```
DocumentDirectoryPath/
└── Downloads/
    ├── streams/          # Contenido HLS/DASH descargado
    ├── binaries/         # Archivos binarios (MP4, etc.)
    ├── licenses/         # Licencias DRM (Android)
    └── subtitles/        # Archivos de subtítulos
```

### Persistencia de Datos

El sistema utiliza múltiples mecanismos de persistencia:

#### iOS

- **Bookmarks**: URLs persistentes que sobreviven cambios de sandbox UUID
- **UserDefaults**: Paths de assets y estados de descarga
- **Keychain**: Claves FairPlay para reproducción offline

```swift
// Claves de persistencia en iOS
private let ASSET_PATHS_KEY = "com.downloads.assetPaths"
private let ASSET_BOOKMARKS_KEY = "com.downloads.assetBookmarks"
private let SUBTITLE_BOOKMARKS_KEY = "com.downloads.subtitleBookmarks"
private let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates"
```

#### Android

- **DownloadIndex**: Índice de ExoPlayer para descargas
- **SharedPreferences**: Estados y configuración
- **Archivos de licencia**: Almacenamiento interno

### Cálculo de Espacio

```typescript
// StorageService proporciona información de espacio
interface StorageInfo {
	totalSpace: number;
	freeSpace: number;
	usedByDownloads: number;
}
```

---

### Flujo de Permisos de Descarga

```
┌─────────────────────────────────────────────────────────────┐
│                        CMS 3Cat                              │
│         (Gestión de contenidos y permisos)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ is_playable_offline: true/false
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      App 3Cat                                │
│    (Verifica permisos antes de mostrar opción de descarga)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Si is_playable_offline === true
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Overon OTT Player                           │
│           (Ejecuta la descarga del contenido)                │
└─────────────────────────────────────────────────────────────┘
```

### Responsabilidades

| Componente            | Responsabilidad                                                  |
| --------------------- | ---------------------------------------------------------------- |
| **CMS 3Cat**          | Define qué contenidos pueden descargarse (`is_playable_offline`) |
| **App 3Cat**          | Verifica permisos y muestra/oculta la opción de descarga         |
| **Overon OTT Player** | Ejecuta la descarga cuando la app lo solicita                    |

### Consideraciones Futuras

Si en el futuro 3Cat implementa DRM para proteger su contenido:

1. La librería ya soporta FairPlay (iOS) y Widevine (Android)
2. Se deberá configurar el servidor de licencias en la configuración DRM
3. Las licencias offline se gestionarán automáticamente según lo descrito en la sección [Encriptación y DRM](#encriptación-y-drm)

---

## Flujo de Descarga

### 1. Inicio de Descarga

```
Usuario solicita descarga
        │
        ▼
┌─────────────────────┐
│  DownloadsManager   │
│   addDownload()     │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Validar políticas  │
│  (red, espacio,     │
│   permisos)         │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│   QueueManager      │
│  addDownloadItem()  │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  DownloadService    │
│  startDownload()    │
└─────────────────────┘
        │
        ├─── BINARY ───▶ BinaryDownloadService
        │
        └─── STREAM ───▶ StreamDownloadService
                              │
                              ▼
                        NativeManager
                              │
                              ▼
                    DownloadsModule2 (Nativo)
```

### 2. Progreso y Eventos

```typescript
enum DownloadEventType {
	STARTED = "download:started",
	PROGRESS = "download:progress",
	COMPLETED = "download:completed",
	FAILED = "download:failed",
	PAUSED = "download:paused",
	RESUMED = "download:resumed",
	CANCELLED = "download:cancelled",
	QUEUED = "download:queued",
	STATE_CHANGE = "download:state_change",
}
```

### 3. Estados de Descarga

```typescript
enum DownloadStates {
	NOT_DOWNLOADED = "NOT_DOWNLOADED",
	PREPARING = "PREPARING",
	QUEUED = "QUEUED",
	DOWNLOADING = "DOWNLOADING",
	DOWNLOADING_ASSETS = "DOWNLOADING_ASSETS", // Subtítulos
	PAUSED = "PAUSED",
	WAITING_FOR_NETWORK = "WAITING_FOR_NETWORK",
	COMPLETED = "COMPLETED",
	FAILED = "FAILED",
	REMOVING = "REMOVING",
	RESTARTING = "RESTARTING",
}
```

---

## Diferencias entre Plataformas

### iOS (AVAssetDownloadURLSession)

| Característica      | Implementación                                |
| ------------------- | --------------------------------------------- |
| **API de descarga** | `AVAggregateAssetDownloadTask`                |
| **DRM**             | FairPlay con `AVContentKeySession`            |
| **Almacenamiento**  | Gestionado por iOS en ubicación opaca         |
| **Reanudación**     | Limitada - tareas perdidas requieren reinicio |
| **Background**      | Soportado nativamente                         |

```swift
// Estructura de información de descarga en iOS
struct DownloadInfo {
    let id: String
    let uri: String
    let title: String
    var state: DownloadState
    var progress: Float
    var totalBytes: Int64
    var downloadedBytes: Int64
    var speed: Double
    var remainingTime: Int
    var quality: String?
    var hasSubtitles: Bool
    var hasDRM: Bool
    var assetPath: String?
}
```

### Android (ExoPlayer DownloadManager)

| Característica      | Implementación                                  |
| ------------------- | ----------------------------------------------- |
| **API de descarga** | ExoPlayer `DownloadManager` + `DownloadService` |
| **DRM**             | Widevine con `OfflineLicenseManager`            |
| **Almacenamiento**  | Directorio de la app (`filesDir`)               |
| **Reanudación**     | Completa - soporta pause/resume                 |
| **Background**      | Foreground Service con notificación             |

```java
// Configuración DRM en Android
private MediaItem.DrmConfiguration createDrmConfiguration(ReadableMap drm) {
    String type = drm.getString("type");
    String licenseServer = drm.getString("licenseServer");

    UUID drmUuid = Util.getDrmUuid(type);
    MediaItem.DrmConfiguration.Builder drmBuilder =
        new MediaItem.DrmConfiguration.Builder(drmUuid);

    drmBuilder.setLicenseUri(licenseServer);

    // Headers de autenticación
    if (drm.hasKey("headers")) {
        drmBuilder.setLicenseRequestHeaders(headers);
    }

    return drmBuilder.build();
}
```

### Tabla Comparativa

| Aspecto                  | iOS                  | Android                       |
| ------------------------ | -------------------- | ----------------------------- |
| **Formato preferido**    | HLS                  | DASH                          |
| **DRM**                  | FairPlay             | Widevine                      |
| **Ubicación de assets**  | Opaca (iOS gestiona) | `filesDir/Downloads/streams/` |
| **Licencias**            | Keychain             | Archivos en `licenses/`       |
| **Reanudación parcial**  | Soportada            | Soportada                     |
| **Selección de calidad** | Limitada             | Completa                      |
| **Background downloads** | Nativo               | Foreground Service            |

---

## Implementación en 3Cat

### Estado Actual del DRM

Actualmente, los streams de 3Cat **no utilizan DRM**. El contenido se distribuye sin encriptación, por lo que las funcionalidades de gestión de licencias DRM descritas anteriormente no están activas en esta implementación.

### Gestión de Derechos de Descarga

Los derechos de descarga se gestionan desde el **CMS**, no desde la librería del player. El CMS proporciona el campo `is_playable_offline` en los metadatos del contenido:

```typescript
interface ContentMetadata {
	// ... otros campos
	is_playable_offline: boolean; // Determina si el contenido puede descargarse
}
```
