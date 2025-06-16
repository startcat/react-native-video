# Documentación del Componente Player

## Descripción

El componente Player es un reproductor de medios avanzado para React Native que permite la visualización de contenido de vídeo y audio en diferentes modalidades. Está diseñado para alternar entre dos modos principales:

1. **Modalidad Normal**: Visualización de contenido directamente en el dispositivo o mediante Airplay.
2. **Modalidad Chromecast**: Control del contenido transmitido a un dispositivo Chromecast, utilizando el móvil como mando a distancia.

El componente ha sido optimizado siguiendo varias estrategias para mejorar su rendimiento, incluyendo memorización con `useMemo`, optimización con `useCallback`, y uso de `React.memo` con comparadores personalizados.

## Changelog

Para ver el historial completo de cambios, mejoras y correcciones del componente Player:

 **[Ver Changelog completo](./player/docs/changelog.md)**

El changelog incluye:
- **Nuevas funcionalidades** añadidas en cada versión
- **Cambios** en funcionalidades existentes  
- **Correcciones de errores** y mejoras de rendimiento
- **Actualizaciones de seguridad** y dependencias
- **Funcionalidades obsoletas** y eliminadas

## Props del Componente

| Nombre | Tipo | Obligatorio | Descripción |
|--------|------|------------|-------------|
| id | number | No | Identificador único del contenido |
| title | string | No | Título principal del contenido |
| subtitle | string | No | Subtítulo del contenido |
| description | string | No | Descripción detallada del contenido |
| languagesMapping | ILanguagesMapping | No | Mapeo de códigos de idioma a nombres legibles |
| manifests | Array\<IManifest> | Sí | Lista de manifiestos para el streaming de contenido |
| headers | Headers | No | Cabeceras HTTP para las peticiones de streaming |
| startPosition | number | No | Posición inicial de reproducción en segundos |
| audioIndex | number | No | Índice inicial de la pista de audio |
| subtitleIndex | number | No | Índice inicial de los subtítulos |
| subtitleStyle | SubtitleStyle | No | Estilos para los subtítulos |
| timeMarkers | Array\<ITimeMarkers> | No | Marcadores de tiempo para intro, recap, créditos, etc. |
| showExternalTudum | boolean | No | Indicador para mostrar Tudum externo |
| poster | string | No | URL de la imagen de poster |
| squaredPoster | string | No | URL de la imagen de poster en formato cuadrado, para los widget multimedia de sistema |
| youbora | IYoubora | No | Configuración para analíticas de Youbora |
| adTagUrl | string | No | URL para anuncios |
| hasNext | boolean | No | Indica si hay contenido siguiente disponible |
| playOffline | boolean | No | Fuerza la reproducción sin conexión del contenido descargado |
| multiSession | boolean | No | Habilita múltiples sesiones en el manifest del stream |
| isLive | boolean | No | Indica si el contenido es en directo |
| liveStartDate | string | No | Fecha de inicio para contenido en directo |
| avoidTimelineThumbnails | boolean | No | Deshabilita las miniaturas en la línea de tiempo |
| avoidRotation | boolean | No | Evita la rotación automática a landscape |
| avoidDownloadsManagement | boolean | No | Evita la gestión automática de descargas |
| watchingProgressInterval | number | No | Intervalo para reportar progreso de visualización |

## Dependencias

| Dependencia | Versión | Descripción |
|-------------|---------|-------------|
| react | 18.2.0 | Biblioteca para construir interfaces de usuario |
| react-native | 0.73.2 | Framework para desarrollo de aplicaciones móviles |
| @react-native-async-storage/async-storage | ^1.21.0 | Sistema de almacenamiento asíncrono |
| @react-native-community/netinfo | ^11.2.1 | Información sobre la conectividad de red |
| @react-native-community/slider | ^4.5.2 | Componente slider para React Native |
| @sayem314/react-native-keep-awake | ^1.3.0 | Mantiene la pantalla del dispositivo activa |
| react-native-background-timer | ^2.4.1 | Timer que funciona en segundo plano |
| react-native-device-info | ^11.1.0 | Información sobre el dispositivo |
| react-native-fast-image | ^8.6.3 | Componente optimizado para cargar imágenes |
| react-native-google-cast | ^4.8.0 | Integración con Google Cast |
| react-native-orientation-locker | ^1.7.0 | Control de orientación del dispositivo |
| react-native-system-navigation-bar | ^2.6.4 | Manipulación de la barra de navegación del sistema |

## Componentes Personalizados

El Player acepta los siguientes componentes personalizados como props:

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| loader | React.ReactElement | Componente de carga mientras se inicializa el reproductor |
| mosca | React.ReactElement | Componente para mostrar un logo de canal sobre el video |
| headerMetadata | FunctionComponent\<HeaderMetadataProps> | Componente para mostrar metadatos sobre el video |
| sliderVOD | FunctionComponent\<SliderVODProps> | Componente personalizado para el slider en contenido VOD |
| sliderDVR | FunctionComponent\<SliderDVRProps> | Componente personalizado para el slider en contenido DVR |
| controlsBottomBar | FunctionComponent\<ControlsBarProps> | Barra de controles inferior |
| controlsMiddleBar | FunctionComponent\<ControlsBarProps> | Barra de controles central |
| controlsHeaderBar | FunctionComponent\<ControlsBarProps> | Barra de controles superior |
| nextButton | FunctionComponent\<NextButtonProps> | Botón para pasar al siguiente contenido |
| liveButton | FunctionComponent\<LiveButtonProps> | Botón para ir al directo en streams en vivo |
| skipIntroButton | FunctionComponent\<TimeMarkExternalButtonProps> | Botón para saltar la introducción |
| skipRecapButton | FunctionComponent\<TimeMarkExternalButtonProps> | Botón para saltar el resumen |
| skipCreditsButton | FunctionComponent\<TimeMarkExternalButtonProps> | Botón para saltar los créditos |
| menu | FunctionComponent\<MenuProps> | Menú principal del reproductor |
| settingsMenu | FunctionComponent\<MenuProps> | Menú de configuración |

## Funciones Personalizadas

El Player acepta las siguientes funciones personalizadas como props:

| Nombre | Firma | Descripción |
|--------|-------|-------------|
| addContentProgress | (currentTime: number, duration: number, id?: number) => void | Reporta el progreso de visualización |
| getSourceUri | (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string | Obtiene la URI de origen para un manifiesto |
| getTudumManifest | () => IManifest \| null \| undefined | Obtiene el manifiesto para Tudum |
| getYouboraOptions | (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora | Obtiene las opciones de configuración para Youbora |
| mergeMenuData | (loadedData: OnLoadData, languagesMapping?: ILanguagesMapping, isDASH?: boolean) => Array\<IPlayerMenuData> | Combina datos obtenidos del stream al menú |
| mergeCastMenuData | (loadedData: Array\<MediaTrack> \| undefined, languagesMapping?: ILanguagesMapping) => Array\<IPlayerMenuData> | Combina datos obtenidos del stream al menú para Chromecast |

## Eventos

El Player lanza los siguientes eventos:

| Nombre | Firma | Descripción |
|--------|-------|-------------|
| onError | () => void | Manejador de errores |
| onNext | () => void | Acción al pasar al siguiente contenido |
| onProgress | (value: number, duration?: number) => void | Reporta el progreso de reproducción |
| onExit | () => void | Acción al salir del reproductor |
| onEnd | () => void | Acción al finalizar la reproducción |
| onChangeAudioIndex | (index: number, label?: string) => void | Acción al cambiar la pista de audio |
| onChangeSubtitleIndex | (index: number, label?: string) => void | Acción al cambiar los subtítulos |
| onDVRChange | (value: number, offset?: number, date?: Date) => void | Gestiona cambios en el DVR |
| onSeek | (value: number) => void | Acción al buscar una posición específica |
| onSeekOverEpg | () => number \| null | Gestiona la búsqueda sobre la guía EPG |
| onLiveStartProgram | () => number \| null | Obtiene el timestamp de inicio de un programa en directo |
| onBuffering | (value: boolean) => void | Reporta el estado de buffering |
| onStart | () => void | Acción al iniciar la reproducción |
| onPlay | () => void | Acción al reproducir |
| onPause | () => void | Acción al pausar |

## Guía de Implementación y Uso

### 1. Generación del Source y DRM
[Ver documentación detallada sobre manifests y DRM](./player/docs/source_drm.md)
<!-- Esta sección explicará cómo se genera el source para el reproductor y cómo configurar DRM -->

### 2. Valores iniciales de reproducción
[Ver documentación detallada sobre valores iniciales](./player/docs/initial_values.md)
<!-- Esta sección explicará cómo configurar la posición inicial, idioma, subtítulos, etc. -->

### 3. Generación de los metadatos
[Ver documentación detallada sobre metadatos](./player/docs/metadata.md)
<!-- Esta sección explicará cómo se generan los metadatos y cómo se muestran en los widgets del sistema operativo -->

### 4. Metadatos en widgets del sistema operativo
[Ver documentación detallada sobre widgets del sistema](./player/docs/system_widgets.md)
<!-- Esta sección explicará cómo se muestran los metadatos en los widgets del sistema operativo -->

### 5. Continue Watching
[Ver documentación detallada sobre Continue Watching](./player/docs/continue_watching.md)
<!-- Esta sección explicará cómo implementar la funcionalidad de continuar viendo -->

### 6. Directos y DVR
<!-- Esta sección explicará cómo configurar y utilizar la funcionalidad de directo y DVR -->

### 7. Tudum
[Ver documentación detallada sobre Tudum](./player/docs/tudum.md)
<!-- Esta sección explicará qué es Tudum y cómo utilizarlo -->

### 8. Acciones de control tipadas
[Ver documentación detallada sobre acciones de control](./player/docs/control_actions.md)
<!-- Esta sección explicará todas las acciones tipadas disponibles en CONTROL_ACTION -->

### 9. Servicios y permisos
[Ver documentación detallada sobre servicios y permisos](./player/docs/services.md)
<!-- Esta sección explicará los permisos necesarios, servicios de background, widgets multimedia y requisitos para las tiendas de aplicaciones -->

### 10. Botones con time markers
<!-- Esta sección explicará cómo configurar botones skipIntroButton, skipRecapButton, skipCreditsButton -->

### 11. Menús personalizados
<!-- Esta sección explicará cómo crear y personalizar menús del reproductor -->

### 12. Integración con Youbora
<!-- Esta sección explicará cómo integrar analíticas con Youbora -->

### 13. Funcionalidad Chromecast y Airplay
<!-- Esta sección explicará cómo configurar y utilizar casting -->

### 14. Reproducción offline y servicios en segundo plano
<!-- Esta sección explicará cómo manejar contenido offline y servicios en background -->

### 15. Foreground Services y Background Modes
<!-- Esta sección explicará cómo configurar los servicios en primer plano y los modos en segundo plano -->

### 16. Personalización por usuario
<!-- Esta sección explicará cómo personalizar la experiencia del reproductor por usuario -->

### 17. Supervisión de permisos
<!-- Esta sección explicará cómo gestionar y supervisar los permisos necesarios para el reproductor -->
