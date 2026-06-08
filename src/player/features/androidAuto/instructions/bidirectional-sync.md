# Android Auto - Sincronización Bidireccional

Guía completa para sincronizar reproducción entre la app móvil y Android Auto.

## Escenarios

1. **Reproducir desde App** → Ver en Android Auto
2. **Reproducir desde Android Auto** → Ver en App  
3. **Controlar desde cualquier interfaz** (app/notificación/Android Auto)

## Implementación Completada

### Métodos Nativos Añadidos

**GlobalPlayerManager.kt:**
- `updateMetadata()` - Actualiza metadata del MediaItem actual
- `isPlaying()` - Verifica estado de reproducción

**AndroidAutoModule.kt:**
- `updateNowPlayingMetadata()` - Expone updateMetadata a JavaScript
- `isAndroidAutoConnected()` - Verifica conexión Android Auto

### API JavaScript

**AndroidAutoControl.ts:**
```typescript
// Actualizar Now Playing cuando reproduces desde la app
AndroidAutoControl.updateNowPlaying({
    title: 'Episodio 1',
    artist: 'Podcast Host',
    artworkUri: 'https://example.com/image.jpg'
});

// Verificar si Android Auto está conectado
const connected = await AndroidAutoControl.isAndroidAutoConnected();
```

## Uso en la App

### Ejemplo: AudioFlavour

```typescript
import { AndroidAutoControl } from 'react-native-video';

function AudioFlavour(props) {
    const onLoad = (data) => {
        // Actualizar Android Auto cuando carga contenido
        if (AndroidAutoControl.isEnabled()) {
            AndroidAutoControl.updateNowPlaying({
                title: props.source.title,
                artist: props.source.artist,
                artworkUri: props.source.artworkUri
            });
        }
    };
    
    return <Video onLoad={onLoad} {...props} />;
}
```

## Próximos Pasos

Ver `implementation-steps.md` para continuar con la integración completa.
