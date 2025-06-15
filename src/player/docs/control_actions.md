# Acciones de Control del Player

En este documento se explican todas las acciones tipadas disponibles en el enum `CONTROL_ACTION` del componente Player. Estas acciones representan las diferentes interacciones que los usuarios pueden realizar con el reproductor.

## ¿Qué son las acciones de control?

Las acciones de control son constantes tipadas que representan las diferentes operaciones que se pueden realizar en el reproductor de video. Estas acciones se utilizan internamente para manejar eventos, personalizar controles y gestionar la lógica de interacción del usuario.

## Uso

Cuando queramos definir los botones de las barras de controles del Player, cada botón lanzará una acción tipada. Por ejemplo, si queremos que un botón lance la acción de saltar la introducción, podemos usar la constante `CONTROL_ACTION.SKIP_INTRO`.

Los tipos de acción van asociadas a un valor opcional, numérico o booleano. Por ejemplo, la acción SEEK tiene un `value` numérico que nos indica la posición en la que se debe saltar.

## Enum CONTROL_ACTION

El enum `CONTROL_ACTION` define todas las acciones posibles que pueden ejecutarse en el reproductor:

| Acción | Valor | Tipo de Value | Descripción |
|--------|-------|---------------|-------------|
| `PAUSE` | 'pause' | boolean | Pausar (true) o reanudar (false) la reproducción |
| `BACK` | 'back' | - | Volver atrás o salir del reproductor |
| `AIRPLAY` | 'airplay' | - | Activar o gestionar AirPlay (iOS) |
| `CAST` | 'cast' | - | Activar o gestionar Chromecast |
| `SKIP_INTRO` | 'skipIntro' | - | Saltar la introducción del contenido |
| `SKIP_CREDITS` | 'skipCredits' | - | Saltar los créditos del contenido |
| `SKIP_RECAP` | 'skipRecap' | - | Saltar el resumen/recap del contenido |
| `NEXT` | 'next' | - | Pasar al siguiente contenido |
| `PREVIOUS` | 'previous' | - | Volver al contenido anterior |
| `MUTE` | 'mute' | boolean | Silenciar (true) o activar (false) el audio |
| `MENU` | 'menu' | - | Abrir el menú principal |
| `MENU_CLOSE` | 'menuClose' | - | Cerrar cualquier menú abierto |
| `SETTINGS_MENU` | 'settingsMenu' | - | Abrir el menú de configuración |
| `VOLUME` | 'volume' | number | Controlar el volumen (0.0 - 1.0) |
| `BACKWARD` | 'backward' | number | Retroceder en segundos |
| `FORWARD` | 'forward' | number | Avanzar en segundos |
| `SEEK` | 'seek' | number | Buscar una posición específica en segundos |
| `SEEK_OVER_EPG` | 'seekOverEpg' | - | Buscar sobre la guía de programación (EPG) |
| `LIVE` | 'goToLive' | - | Ir al punto en vivo (contenido en directo) |
| `LIVE_START_PROGRAM` | 'goToLiveStartProgram' | - | Ir al inicio del programa en vivo |
| `VIDEO_INDEX` | 'videoIndex' | number | Cambiar la pista de video (índice) |
| `AUDIO_INDEX` | 'audioIndex' | number | Cambiar la pista de audio (índice) |
| `SUBTITLE_INDEX` | 'subtitleIndex' | number | Cambiar la pista de subtítulos (índice) |
| `SPEED_RATE` | 'speedRate' | number | Cambiar la velocidad de reproducción (ej: 1.0, 1.5, 2.0) |
| `CLOSE_NEXT_POPUP` | 'closeNextPopup' | - | Cerrar el popup de siguiente contenido |
| `CLOSE_AUDIO_PLAYER` | 'closeAudioPlayer' | - | Cerrar el reproductor de audio |
| `HIDE_AUDIO_PLAYER` | 'hideAudioPlayer' | - | Ocultar el reproductor de audio |
| `SLEEP` | 'sleep' | - | Activar temporizador de apagado |
| `CANCEL_SLEEP` | 'sleep_cancel' | - | Cancelar temporizador de apagado |

## Categorías de acciones

### Acciones de reproducción básica

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `PAUSE` | boolean | Control de pausa/reproducción | Botón play/pause principal |
| `NEXT` | - | Siguiente contenido | Botón siguiente en playlist |
| `PREVIOUS` | - | Contenido anterior | Botón anterior en playlist |
| `MUTE` | boolean | Control de silencio | Botón de mute/unmute |
| `VOLUME` | number | Control de volumen | Slider de volumen |

### Acciones de navegación temporal

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `SEEK` | number | Búsqueda de posición | Slider de progreso, toque en timeline |
| `BACKWARD` | number | Retroceder | Botón de retroceso rápido |
| `FORWARD` | number | Avanzar | Botón de avance rápido |
| `LIVE` | - | Ir a en vivo | Botón "EN VIVO" en streams |
| `LIVE_START_PROGRAM` | - | Inicio programa | Botón para ir al inicio del programa actual |

### Acciones de salto de contenido

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `SKIP_INTRO` | - | Saltar intro | Botón "Saltar intro" en series |
| `SKIP_RECAP` | - | Saltar recap | Botón "Saltar resumen" en episodios |
| `SKIP_CREDITS` | - | Saltar créditos | Botón "Saltar créditos" al final |

### Acciones de interfaz

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `MENU` | - | Abrir menú | Botón de menú principal |
| `MENU_CLOSE` | - | Cerrar menú | Acción de cierre de menú |
| `SETTINGS_MENU` | - | Menú configuración | Botón de configuración |
| `BACK` | - | Volver/salir | Botón de retroceso, salir del player |

### Acciones de casting y conectividad

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `CAST` | - | Chromecast | Botón de casting para Android/Web |
| `AIRPLAY` | - | AirPlay | Botón de AirPlay para iOS |

### Acciones de configuración de pistas

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `VIDEO_INDEX` | number | Cambiar video | Selección de calidad de video |
| `AUDIO_INDEX` | number | Cambiar audio | Selección de idioma de audio |
| `SUBTITLE_INDEX` | number | Cambiar subtítulos | Selección de subtítulos |
| `SPEED_RATE` | number | Velocidad | Control de velocidad de reproducción |

### Acciones de gestión de ventanas

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `CLOSE_NEXT_POPUP` | - | Cerrar popup siguiente | Cerrar ventana de "siguiente episodio" |
| `CLOSE_AUDIO_PLAYER` | - | Cerrar audio player | Cerrar reproductor de audio flotante |
| `HIDE_AUDIO_PLAYER` | - | Ocultar audio player | Minimizar reproductor de audio |

### Acciones de temporizador

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `SLEEP` | - | Temporizador | Activar apagado automático |
| `CANCEL_SLEEP` | - | Cancelar temporizador | Cancelar apagado automático |

### Acciones específicas para contenido en vivo

| Acción | Tipo de Value | Descripción | Uso común |
|--------|---------------|-------------|-----------|
| `SEEK_OVER_EPG` | - | Búsqueda en EPG | Navegación en guía de programación |
| `LIVE` | - | Ir a en vivo | Volver al punto actual en directo |
| `LIVE_START_PROGRAM` | - | Inicio programa | Ir al inicio del programa actual |
