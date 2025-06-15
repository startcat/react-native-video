# Metadatos del Contenido y Componentes de Visualización

En este documento se explican las props del componente Player relacionadas con los metadatos del contenido y cómo personalizar la visualización de información mediante componentes personalizados.

## ¿Qué son los metadatos?

Los metadatos son información descriptiva sobre el contenido que se está reproduciendo. Incluyen elementos como título, subtítulo, descripción y elementos visuales como pósters. Esta información se utiliza tanto para mostrar detalles al usuario como para integrarse con widgets del sistema operativo y servicios de casting.

## Props de metadatos básicos

### `title`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `title` | string | No | Título principal del contenido |

El título es la información más importante del contenido y se utiliza en:
- Widgets del sistema operativo (Now Playing, Control Center)
- Información de casting (Chromecast, AirPlay)
- Componentes de UI personalizados
- Metadatos para analíticas

### `subtitle`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `subtitle` | string | No | Subtítulo o información secundaria del contenido |

El subtítulo proporciona información adicional como:
- Nombre del episodio en series
- Información del artista en contenido musical
- Temporada y episodio
- Información del canal o programa

### `description`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `description` | string | No | Descripción detallada del contenido |

La descripción ofrece información más extensa sobre el contenido:
- Sinopsis del episodio o película
- Información detallada del programa
- Contexto adicional para el usuario
- Metadatos para servicios de recomendación

## Props de elementos visuales

### `poster`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `poster` | string | No | URL de la imagen principal del contenido (formato rectangular) |

El póster rectangular se utiliza para:
- Mostrar en la interfaz del reproductor cuando está pausado
- Widgets del sistema operativo
- Información de casting
- Pantallas de carga y estados de espera

**Recomendaciones:**
- Formato: 16:9 (1920x1080, 1280x720)
- Formatos soportados: JPG, PNG, WebP
- Tamaño optimizado para diferentes dispositivos

### `squaredPoster`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `squaredPoster` | string | No | URL de la imagen del contenido en formato cuadrado |

El póster cuadrado se utiliza específicamente para:
- Widgets de iOS y Android que requieren formato cuadrado
- Algunas implementaciones de casting
- Interfaces de usuario que necesitan formato 1:1

**Recomendaciones:**
- Formato: 1:1 (1080x1080, 720x720)
- Mismos formatos que el póster rectangular
- Debe ser visualmente coherente con el póster rectangular

## Componentes de visualización personalizados

### `mosca`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `mosca` | React.ReactElement | No | Componente personalizado que se superpone al contenido (marca de agua, logo) |

La "mosca" es un elemento visual que se superpone al contenido de video, comúnmente utilizado para:
- Logos de canales o marcas
- Marcas de agua
- Información de copyright
- Elementos de branding

**Características:**
- Se posiciona sobre el contenido de video
- Permanece visible durante toda la reproducción
- Debe ser diseñado para no interferir con la experiencia de visualización

### `headerMetadata`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `headerMetadata` | FunctionComponent<HeaderMetadataProps> | No | Componente personalizado para mostrar metadatos en la parte superior del reproductor |

Este componente permite personalizar completamente cómo se muestran los metadatos del contenido en la interfaz del reproductor.

#### Props del HeaderMetadata

El componente `headerMetadata` recibe las siguientes props:

| Prop | Tipo | Descripción |
|------|------|-------------|
| `title` | string | Título del contenido |
| `subtitle` | string | Subtítulo del contenido |
| `description` | string | Descripción del contenido |
| `isVisible` | boolean | Indica si los metadatos deben estar visibles |
| `isLive` | boolean | Indica si es contenido en vivo |

## Implementación

### Ejemplo básico de metadatos

```javascript
<Player
  title="Stranger Things"
  subtitle="Temporada 4 • Episodio 1 • El Club Fuego Infernal"
  description="Un nuevo mal emerge en Hawkins mientras los amigos están separados por primera vez, y navegar por las complejidades de la escuela secundaria no ha hecho que las cosas sean más fáciles."
  poster="https://ejemplo.com/stranger-things-poster.jpg"
  squaredPoster="https://ejemplo.com/stranger-things-square.jpg"
  manifests={manifests}
  {...otrosProps}
/>
```

### Ejemplo con componente mosca personalizado

```javascript
const CustomMosca = () => (
  <View style={{
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 4,
    zIndex: 1000
  }}>
    <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
      MI CANAL
    </Text>
  </View>
);

<Player
  title="Programa en Vivo"
  subtitle="Noticias de la Tarde"
  mosca={<CustomMosca />}
  manifests={manifests}
  {...otrosProps}
/>
```

### Ejemplo con HeaderMetadata personalizado

```javascript
const CustomHeaderMetadata = ({ title, subtitle, description, isVisible, isLive }) => {
  if (!isVisible) return null;

  return (
    <View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
      padding: 20,
      zIndex: 100
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {isLive && (
          <View style={{
            backgroundColor: '#ff0000',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 4,
            marginRight: 12
          }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              EN VIVO
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{
            color: 'white',
            fontSize: 24,
            fontWeight: 'bold',
            marginBottom: 4
          }}>
            {title}
          </Text>
          {subtitle && (
            <Text style={{
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: 16,
              marginBottom: 8
            }}>
              {subtitle}
            </Text>
          )}
          {description && (
            <Text style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 14,
              lineHeight: 20
            }}>
              {description}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

<Player
  title="Documental Naturaleza"
  subtitle="Episodio 3: Los Océanos"
  description="Explora las profundidades marinas y descubre la vida que habita en los océanos más remotos del planeta."
  headerMetadata={CustomHeaderMetadata}
  manifests={manifests}
  {...otrosProps}
/>
```

### Ejemplo con memoización para rendimiento

```javascript
const MemoizedHeaderMetadata = React.memo(({ title, subtitle, description, isVisible, isLive }) => {
  // Implementación del componente
  return (
    // JSX del componente
  );
}, (prevProps, nextProps) => {
  // Comparador personalizado para optimizar re-renders
  return (
    prevProps.title === nextProps.title &&
    prevProps.subtitle === nextProps.subtitle &&
    prevProps.description === nextProps.description &&
    prevProps.isVisible === nextProps.isVisible &&
    prevProps.isLive === nextProps.isLive
  );
});

const MemoizedMosca = React.memo(() => (
  <View style={moscaStyles}>
    <Text style={textStyles}>LOGO</Text>
  </View>
));

<Player
  title={contentTitle}
  subtitle={contentSubtitle}
  description={contentDescription}
  headerMetadata={MemoizedHeaderMetadata}
  mosca={<MemoizedMosca />}
  manifests={manifests}
  {...otrosProps}
/>
```

## Consideraciones importantes

### Rendimiento

- **Memoización**: Utiliza `React.memo` para componentes personalizados que no cambian frecuentemente
- **Comparadores personalizados**: Implementa comparadores específicos para evitar re-renderizados innecesarios
- **Imágenes optimizadas**: Asegúrate de que los pósters estén optimizados para diferentes tamaños de pantalla

### Experiencia de usuario

- **Consistencia visual**: Mantén coherencia entre pósters rectangulares y cuadrados
- **Legibilidad**: Asegúrate de que los componentes personalizados no interfieran con la legibilidad del contenido
- **Accesibilidad**: Incluye etiquetas de accesibilidad apropiadas en componentes personalizados

### Integración con el sistema

- **Widgets del SO**: Los metadatos se integran automáticamente con widgets de iOS y Android
- **Casting**: La información se envía automáticamente a dispositivos de casting
- **Analíticas**: Los metadatos pueden utilizarse para reportes y analíticas

## Casos de uso comunes

### Contenido en vivo

```javascript
<Player
  title="Canal 24 Noticias"
  subtitle="Noticias en Directo"
  description="Cobertura en tiempo real de los eventos más importantes"
  isLive={true}
  headerMetadata={LiveHeaderMetadata}
  mosca={<LiveChannelLogo />}
  {...otrosProps}
/>
```

### Series y episodios

```javascript
<Player
  title={series.title}
  subtitle={`T${season}E${episode} • ${episodeTitle}`}
  description={episodeDescription}
  poster={episodePoster}
  squaredPoster={seriesSquaredPoster}
  headerMetadata={SeriesHeaderMetadata}
  {...otrosProps}
/>
```

### Contenido musical

```javascript
<Player
  title={song.title}
  subtitle={`${artist.name} • ${album.name}`}
  description={`Duración: ${duration} • Año: ${year}`}
  poster={albumCover}
  squaredPoster={albumCover} // Mismo póster para música
  headerMetadata={MusicHeaderMetadata}
  {...otrosProps}
/>
```

## Integración con otras funcionalidades

Los metadatos se integran con otras funcionalidades del Player:

- **Continue Watching**: Los metadatos se mantienen al reanudar reproducción
- **Casting**: Se envían automáticamente a dispositivos de casting
- **Youbora**: Pueden incluirse en reportes de analíticas
- **Widgets del SO**: Se muestran en controles del sistema operativo