# Tudum: Animación de Introducción

En este documento se explica la funcionalidad de Tudum en el componente Player, qué props se utilizan para su configuración y cuándo se muestra la animación de introducción.

## ¿Qué es Tudum?

Tudum es la animación de introducción que se reproduce antes del contenido principal. Similar a los intros de estudios como Marvel, Netflix, HBO, etc., esta animación sirve como una marca distintiva y preparación para la experiencia de visualización.

## Props de configuración

### `getTudumManifest`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `getTudumManifest` | () => IManifest \| null \| undefined | No | Función que retorna el manifiesto para la animación Tudum |

Esta función debe retornar un objeto `IManifest` con la configuración necesaria para reproducir la animación Tudum. El formato del manifiesto es exactamente el mismo que se utiliza para el contenido principal. Para más detalles sobre la estructura del objeto `IManifest`, consulta la [documentación sobre source y DRM](./source_drm.md). Si retorna `null` o `undefined`, no se mostrará la animación.

### `showExternalTudum`

| Prop | Tipo | Requerido | Valor predeterminado | Descripción |
|------|------|-----------|---------------------|-------------|
| `showExternalTudum` | boolean | No | `false` | Indica si el Tudum debe mostrarse como un vídeo externo antes del contenido principal |

## Lógica de visualización

La animación Tudum se mostrará solo cuando se cumplen **todas** estas condiciones:

1. La función `getTudumManifest` retorna un objeto válido de tipo `IManifest`
2. La prop `showExternalTudum` está configurada como `true`
3. Es la primera reproducción de una sesión (no se muestra al reanudar reproducción)
4. No hay posición inicial de reproducción establecida (`startPosition` es 0 o undefined)

### Casos en los que NO se muestra el Tudum:

- Cuando `showExternalTudum` es `false`
- Cuando `getTudumManifest` retorna `null` o `undefined`
- Cuando `startPosition` tiene un valor mayor a 0 (se está reanudando la reproducción)
- Cuando es contenido en vivo (`isLive` es `true`)
- Cuando se está reproduciendo en modo offline (`playOffline` es `true`)

## Implementación

```javascript
// Ejemplo de implementación de getTudumManifest
const getTudumAnimation = () => {
  return {
    manifestURL: 'https://ejemplo.com/tudum-animation.mp4',
    type: STREAM_FORMAT_TYPE.MP4,
    // No es necesario configurar DRM para el Tudum en la mayoría de los casos
  };
};

// Uso en el componente Player
<Player
  manifests={manifests}
  getTudumManifest={getTudumAnimation}
  showExternalTudum={true}
  {...otrosProps}
/>
```

## Consideraciones de rendimiento

Para evitar re-renderizados innecesarios, se recomienda utilizar `useCallback` al definir la función `getTudumManifest`:

```javascript
const getTudumAnimation = useCallback(() => {
  return {
    manifestURL: 'https://ejemplo.com/tudum-animation.mp4',
    type: STREAM_FORMAT_TYPE.MP4,
  };
}, []); // Sin dependencias si la URL es estática
```

Esto es especialmente importante siguiendo las prácticas de optimización que hemos estado aplicando en los componentes de React Native Video para mejorar el rendimiento, como la memoización de funciones con `useCallback` para prevenir re-renderizados innecesarios.