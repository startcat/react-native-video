# Valores Iniciales de Reproducción

En este documento se explican las props del componente Player que permiten configurar los valores iniciales para la reproducción, incluyendo la posición de inicio, pista de audio y subtítulos predeterminados.

## ¿Qué son los valores iniciales?

Los valores iniciales de reproducción permiten configurar el estado inicial del reproductor antes de que comience la reproducción. Esto incluye desde qué momento comenzar a reproducir el contenido, qué pista de audio utilizar y si mostrar subtítulos desde el inicio.

## Props de configuración

### `startPosition`

| Prop | Tipo | Requerido | Valor predeterminado | Descripción |
|------|------|-----------|---------------------|-------------|
| `startPosition` | number | No | `0` | Posición inicial de reproducción en segundos |

Esta prop define desde qué momento (en segundos) debe comenzar la reproducción del contenido. Es especialmente útil para implementar funcionalidades como "continuar viendo" o para comenzar la reproducción desde un punto específico.

**Casos de uso comunes:**
- Reanudar reproducción desde donde se quedó el usuario
- Comenzar desde un capítulo o sección específica
- Saltar introducciones o contenido previo
- Implementar deep linking a momentos específicos del contenido

### `audioIndex`

| Prop | Tipo | Requerido | Valor predeterminado | Descripción |
|------|------|-----------|---------------------|-------------|
| `audioIndex` | number | No | `0` | Índice de la pista de audio a seleccionar inicialmente |

Esta prop permite seleccionar qué pista de audio debe estar activa al iniciar la reproducción. El índice corresponde a la posición de la pista en el array de pistas de audio disponibles en el manifiesto.

**Consideraciones importantes:**
- El índice es base 0 (la primera pista es índice 0)
- Si el índice especificado no existe, se utilizará la pista predeterminada
- Para contenido con múltiples idiomas, permite seleccionar el idioma preferido del usuario

### `subtitleIndex`

| Prop | Tipo | Requerido | Valor predeterminado | Descripción |
|------|------|-----------|---------------------|-------------|
| `subtitleIndex` | number | No | `-1` | Índice de la pista de subtítulos a seleccionar inicialmente |

Esta prop permite seleccionar qué pista de subtítulos debe estar activa al iniciar la reproducción. Un valor de `-1` indica que no se mostrarán subtítulos inicialmente.

**Valores especiales:**
- `-1`: Sin subtítulos (valor predeterminado)
- `0` o mayor: Índice de la pista de subtítulos a mostrar

## Funcionamiento

### Orden de aplicación

Los valores iniciales se aplican en el siguiente orden durante la inicialización del reproductor:

1. **Carga del manifiesto**: El reproductor carga el manifiesto seleccionado
2. **Configuración de audio**: Se selecciona la pista de audio según `audioIndex`
3. **Configuración de subtítulos**: Se selecciona la pista de subtítulos según `subtitleIndex`
4. **Posicionamiento**: Se establece la posición inicial según `startPosition`
5. **Inicio de reproducción**: Comienza la reproducción desde la configuración establecida

### Interacción con otras props

Los valores iniciales interactúan con otras props del Player:

- **`languagesMapping`**: Puede influir en la selección automática de pistas de audio y subtítulos
- **`isLive`**: Para contenido en vivo, `startPosition` puede no aplicarse o comportarse de manera diferente
- **`playOffline`**: Los valores iniciales funcionan normalmente en modo offline

## Implementación

### Ejemplo básico

```javascript
<Player
  manifests={manifests}
  startPosition={120} // Comenzar en el minuto 2
  audioIndex={1} // Segunda pista de audio (índice 1)
  subtitleIndex={0} // Primera pista de subtítulos
  {...otrosProps}
/>
```

### Ejemplo con Continue Watching

```javascript
const getInitialValues = (contentId, userPreferences) => {
  // Recuperar la última posición guardada
  const lastPosition = getLastWatchedPosition(contentId);
  
  // Obtener preferencias de idioma del usuario
  const preferredAudioIndex = getPreferredAudioIndex(userPreferences.language);
  const preferredSubtitleIndex = getPreferredSubtitleIndex(userPreferences.subtitles);
  
  return {
    startPosition: lastPosition || 0,
    audioIndex: preferredAudioIndex,
    subtitleIndex: preferredSubtitleIndex
  };
};

const initialValues = getInitialValues(contentId, userPreferences);

<Player
  id={contentId}
  manifests={manifests}
  startPosition={initialValues.startPosition}
  audioIndex={initialValues.audioIndex}
  subtitleIndex={initialValues.subtitleIndex}
  {...otrosProps}
/>
```

### Ejemplo con selección dinámica

```javascript
const PlayerWithDynamicDefaults = ({ manifests, userLanguage, ...props }) => {
  const { audioIndex, subtitleIndex } = useMemo(() => {
    // Lógica para determinar índices basados en el idioma del usuario
    const audioTracks = manifests[0]?.audioTracks || [];
    const subtitleTracks = manifests[0]?.subtitleTracks || [];
    
    const preferredAudioIndex = audioTracks.findIndex(
      track => track.language === userLanguage
    );
    
    const preferredSubtitleIndex = subtitleTracks.findIndex(
      track => track.language === userLanguage
    );
    
    return {
      audioIndex: preferredAudioIndex >= 0 ? preferredAudioIndex : 0,
      subtitleIndex: preferredSubtitleIndex >= 0 ? preferredSubtitleIndex : -1
    };
  }, [manifests, userLanguage]);

  return (
    <Player
      manifests={manifests}
      audioIndex={audioIndex}
      subtitleIndex={subtitleIndex}
      {...props}
    />
  );
};
```

## Consideraciones importantes

### Rendimiento

- **Memoización**: Si calculas los valores iniciales dinámicamente, utiliza `useMemo` para evitar recálculos innecesarios.
- **Validación**: Valida que los índices especificados existen antes de pasarlos al Player.

### Experiencia de usuario

- **Consistencia**: Mantén consistencia en las preferencias del usuario entre sesiones.
- **Feedback visual**: Proporciona indicaciones visuales cuando se aplican valores iniciales específicos.
- **Accesibilidad**: Considera las necesidades de accesibilidad al configurar subtítulos por defecto.

### Casos especiales

#### Contenido en vivo

Para contenido en vivo (`isLive: true`):
- `startPosition` puede no aplicarse o comportarse de manera diferente
- Los índices de audio y subtítulos funcionan normalmente
- Considera usar `liveStartDate` para contenido en vivo con ventana DVR

#### Contenido offline

En modo offline (`playOffline: true`):
- Todos los valores iniciales funcionan normalmente
- Asegúrate de que las pistas seleccionadas estén disponibles offline

#### Múltiples manifiestos

Cuando se proporcionan múltiples manifiestos:
- Los índices se aplican al manifiesto seleccionado automáticamente
- Considera que diferentes manifiestos pueden tener diferentes pistas disponibles

## Eventos relacionados

Los valores iniciales pueden disparar eventos cuando se aplican:

```javascript
<Player
  startPosition={120}
  audioIndex={1}
  subtitleIndex={0}
  onChangeAudioIndex={(index, label) => {
    console.log(`Audio inicial seleccionado: ${label} (índice ${index})`);
  }}
  onChangeSubtitleIndex={(index, label) => {
    console.log(`Subtítulos iniciales: ${label} (índice ${index})`);
  }}
  {...otrosProps}
/>
```

## Integración con otras funcionalidades

Los valores iniciales se integran perfectamente con otras funcionalidades del Player:

- **Continue Watching**: Usa `startPosition` para reanudar desde la última posición guardada
- **Preferencias de usuario**: Combina con `languagesMapping` para selección inteligente de pistas
- **Deep linking**: Permite enlazar directamente a momentos específicos del contenido
- **Personalización**: Adapta la experiencia inicial según el perfil del usuario