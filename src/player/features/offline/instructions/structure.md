## 📁 **ESTRUCTURA DE DIRECTORIOS**

```
src/player/features/offline
├── 📁 services/
│   ├── 📁 download/
│   │   ├── DownloadsService.ts          # Interfaz unificada de descargas
│   │   ├── StreamDownloadService.ts     # Gestión de streams mediante DownloadsModule
│   │   └── BinaryDownloadService.ts     # Gestión de binarios mediante react-native-background-downloader
│   │
│   ├── 📁 storage/
│   │   ├── StorageService.ts            # Gestión de espacio en disco
│   │   └── PersistenceService.ts        # Persistencia de descargas
│   │
│   └── 📁 network/
│       └── NetworkService.ts            # Gestión de conectividad
│
├── 📁 managers/
│   ├── ConfigManager.ts                  # Gestor de configuración
│   ├── NativeManager.ts                 # Interfaz con módulo nativo
│   ├── DownloadsManager.ts              # Gestor principal de descargas (Orquestador principal)
│   ├── QueueManager.ts                  # Gestor de la cola de descargas
│   ├── ProfileManager.ts                 # Gestor de perfiles asociados y perfil activo
│   └── StoreManager.ts                  # Gestor de estados
│
├── 📁 hooks/
│   │ // HOOKS PRINCIPALES
│   ├── useDownloadsManager.ts           # API principal unificada
│   ├── useDownloadsQueue.ts             # Cola unificada (NO lista separada)
│   ├── useDownloadsProgress.ts          # Progreso de descarga individual
│   │
│   │ // HOOKS DE SISTEMA
│   ├── useNetworkStatus.ts              # Estado + cambios de red
│   ├── useStorageInfo.ts                # Info de almacenamiento
│   ├── useDownloadsConfig.ts             # Configuración dinámica
│   │
│   │ // HOOKS ESPECÍFICOS
│   ├── useDownloadsDRM.ts               # Gestión de DRM/licencias
│   ├── useDownloadsSubtitles.ts         # Gestión de subtítulos
│   ├── useDownloadsProfile.ts            # Filtrado por perfil
│   │
│   │ // HOOKS DE MONITOREO
│   ├── useDownloadsMetrics.ts           # Estadísticas y métricas
│   ├── useDownloadsRetry.ts             # Reintentos y recuperación
│   └── useDownloadsValidation.ts        # Validación e integridad
│
├── 📁 store/
│   ├── downloadsSlice.ts                # Redux/Zustand slice
│   └── downloadsSelectors.ts            # Selectores
│
├── 📁 utils/
│   ├── stateTransitions.ts              # Validación de estados
│   ├── configValidation.ts               # Validación de config
│   ├── manifests.ts                     # Utilidades para trabajar con los manifests
│   ├── drm.ts                           # Utilidades para seleccionar el DRM adecuado
│   └── downloadsUtils.ts                # Utilidades generales
│
├── 📁 types/                            # TypeScript definitions, fragmentadas por funcionalidad
│
├── 📁 docs/                             # Documentación
│
├── constants.ts                        # Constantes
└── index.ts                            # Exportaciones públicas del módulo
```

## 📁 **MODULO NATIVO ANDROID - DownloadsModule**

```
android/src/main/java/com/brentvatne
```

## 📁 **MODULO NATIVO IOS - DownloadsModule**

```
iOS/Downloads
```
