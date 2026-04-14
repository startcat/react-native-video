# Control Manual de Audio Focus (Android)

## Descripción

El sistema de **Audio Focus** en Android permite que las aplicaciones coordinen la reproducción de audio, asegurando que solo una app reproduzca audio a la vez. Por defecto, `react-native-video` solicita automáticamente el audio focus al reproducir contenido.

Sin embargo, en ciertos escenarios como **Android Auto** o **CarPlay**, el sistema ya gestiona el audio focus automáticamente, y solicitar el focus manualmente puede causar conflictos.

Esta funcionalidad permite **deshabilitar la solicitud automática** de audio focus y **controlarlo manualmente** cuando sea necesario.

---

## Configuración

### 1. Deshabilitar Audio Focus Automático

Para deshabilitar la solicitud automática de audio focus, usa la prop `disableFocus`:

```tsx
import Video from 'react-native-video';

<Video
  source={{ uri: 'https://example.com/video.mp4' }}
  disableFocus={true}  // ✅ NO solicita audio focus automáticamente
  paused={false}
/>
```

**Comportamiento:**
- Con `disableFocus={false}` (default): Solicita audio focus automáticamente al reproducir
- Con `disableFocus={true}`: NO solicita audio focus. Debes controlarlo manualmente.

---

### 2. Control Manual de Audio Focus

Cuando `disableFocus={true}`, puedes usar el módulo `VideoAudioFocus` para controlar manualmente el audio focus:

```tsx
import { useRef } from 'react';
import Video, { VideoAudioFocus } from 'react-native-video';
import { findNodeHandle } from 'react-native';

function MyPlayer() {
  const videoRef = useRef<Video>(null);

  const requestAudioFocus = async () => {
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      const result = await VideoAudioFocus.requestAudioFocus(tag);
      if (result.granted) {
        console.log('✅ Audio focus granted');
      } else {
        console.log('❌ Audio focus denied');
      }
    }
  };

  const abandonAudioFocus = async () => {
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      await VideoAudioFocus.abandonAudioFocus(tag);
      console.log('Audio focus abandoned');
    }
  };

  const checkAudioFocus = async () => {
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      const state = await VideoAudioFocus.getAudioFocusState(tag);
      console.log('Has audio focus:', state.hasAudioFocus);
    }
  };

  return (
    <Video
      ref={videoRef}
      source={{ uri: 'https://example.com/video.mp4' }}
      disableFocus={true}
      paused={false}
    />
  );
}
```

---

## API del Módulo VideoAudioFocus

### `requestAudioFocus(viewTag: number): Promise<AudioFocusRequestResult>`

Solicita audio focus manualmente para un player específico.

**Parámetros:**
- `viewTag`: Tag del componente Video (obtenido con `findNodeHandle`)

**Retorna:**
```typescript
{
  granted: boolean;      // true si se obtuvo el audio focus
  hasAudioFocus: boolean; // Estado actual del audio focus
}
```

**Ejemplo:**
```typescript
const result = await VideoAudioFocus.requestAudioFocus(tag);
if (result.granted) {
  // Audio focus obtenido, puedes reproducir
}
```

---

### `abandonAudioFocus(viewTag: number): Promise<AudioFocusAbandonResult>`

Abandona el audio focus manualmente.

**Parámetros:**
- `viewTag`: Tag del componente Video (obtenido con `findNodeHandle`)

**Retorna:**
```typescript
{
  success: boolean;       // true si se abandonó correctamente
  hasAudioFocus: boolean; // Estado actual (siempre false después de abandonar)
}
```

**Ejemplo:**
```typescript
await VideoAudioFocus.abandonAudioFocus(tag);
// Audio focus abandonado
```

---

### `getAudioFocusState(viewTag: number): Promise<AudioFocusState>`

Consulta el estado actual del audio focus.

**Parámetros:**
- `viewTag`: Tag del componente Video (obtenido con `findNodeHandle`)

**Retorna:**
```typescript
{
  hasAudioFocus: boolean; // true si tiene audio focus actualmente
}
```

**Ejemplo:**
```typescript
const state = await VideoAudioFocus.getAudioFocusState(tag);
console.log('Has audio focus:', state.hasAudioFocus);
```

---

## Eventos de Audio Focus

El player emite eventos cuando el audio focus cambia:

```tsx
<Video
  source={{ uri: 'https://example.com/video.mp4' }}
  onAudioFocusChanged={(event) => {
    console.log('Audio focus changed:', event.hasAudioFocus);
    
    if (event.hasAudioFocus) {
      // Ganó el audio focus
    } else {
      // Perdió el audio focus
    }
  }}
/>
```

**Tipos de cambios de audio focus:**

| Evento | Descripción | Comportamiento Default |
|--------|-------------|------------------------|
| `AUDIOFOCUS_GAIN` | Ganó el audio focus | Restaura volumen y reproduce |
| `AUDIOFOCUS_LOSS` | Perdió el audio focus permanentemente | Pausa y abandona el focus |
| `AUDIOFOCUS_LOSS_TRANSIENT` | Pérdida temporal (ej: notificación) | Solo notifica, no pausa |
| `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` | Pérdida temporal, puede reducir volumen | Reduce volumen al 80% |

---

## Casos de Uso

### 1. Android Auto / CarPlay

En Android Auto, el sistema gestiona el audio focus automáticamente:

```tsx
import { Platform } from 'react-native';

const isAndroidAuto = Platform.OS === 'android' && /* detectar Android Auto */;

<Video
  source={{ uri: 'https://example.com/audio.mp3' }}
  disableFocus={isAndroidAuto}  // ✅ Deshabilitar en Android Auto
  paused={false}
/>
```

---

### 2. Control Manual Basado en Eventos

Solicitar audio focus solo cuando el usuario presiona play:

```tsx
function MyPlayer() {
  const videoRef = useRef<Video>(null);
  const [paused, setPaused] = useState(true);

  const handlePlay = async () => {
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      const result = await VideoAudioFocus.requestAudioFocus(tag);
      if (result.granted) {
        setPaused(false);
      } else {
        alert('No se pudo obtener audio focus');
      }
    }
  };

  const handlePause = async () => {
    setPaused(true);
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      await VideoAudioFocus.abandonAudioFocus(tag);
    }
  };

  return (
    <Video
      ref={videoRef}
      source={{ uri: 'https://example.com/video.mp4' }}
      disableFocus={true}
      paused={paused}
    />
  );
}
```

---

### 3. Múltiples Players con Coordinación

Gestionar audio focus entre múltiples players:

```tsx
function MultiPlayerApp() {
  const player1Ref = useRef<Video>(null);
  const player2Ref = useRef<Video>(null);

  const switchToPlayer2 = async () => {
    // Abandonar focus del player 1
    const tag1 = findNodeHandle(player1Ref.current);
    if (tag1) {
      await VideoAudioFocus.abandonAudioFocus(tag1);
    }

    // Solicitar focus para player 2
    const tag2 = findNodeHandle(player2Ref.current);
    if (tag2) {
      await VideoAudioFocus.requestAudioFocus(tag2);
    }
  };

  return (
    <>
      <Video ref={player1Ref} disableFocus={true} {...} />
      <Video ref={player2Ref} disableFocus={true} {...} />
    </>
  );
}
```

---

## Integración con Playlists

Para usar con el sistema de playlists nativo:

```typescript
import { PlaylistControl } from 'react-native-video';

await PlaylistControl.setPlaylist(items, {
  coordinatedMode: true,
  autoNext: true,
  disableAudioFocus: true,  // ✅ Nueva opción
});
```

**Configuración:**
```typescript
export interface PlaylistConfig {
  coordinatedMode?: boolean;
  autoNext?: boolean;
  repeatMode?: PlaylistRepeatMode;
  startIndex?: number;
  skipOnError?: boolean;
  disableAudioFocus?: boolean; // ✅ Control manual de audio focus
}
```

---

## Notas Importantes

### ⚠️ Solo Android

El audio focus es un concepto específico de Android. En iOS:
- Los métodos siempre retornan `success: true` y `hasAudioFocus: true`
- No tienen efecto real en el comportamiento del player
- iOS usa su propio sistema de audio session

### ⚠️ Compatibilidad con disableFocus

La prop `disableFocus` ya existía pero tenía comportamiento limitado:
- **Antes:** Solo deshabilitaba la solicitud inicial
- **Ahora:** Deshabilita completamente el manejo automático + permite control manual

### ⚠️ Background Playback

Si reproduces en background, asegúrate de mantener el audio focus:
- El sistema puede reclamar el focus si otra app lo solicita
- Escucha el evento `onAudioFocusChanged` para reaccionar a cambios

---

## Troubleshooting

### El player no reproduce después de requestAudioFocus

**Solución:** Verifica que `result.granted === true`:
```typescript
const result = await VideoAudioFocus.requestAudioFocus(tag);
if (!result.granted) {
  console.error('Audio focus denied - otra app tiene el focus');
}
```

### El audio focus se pierde inesperadamente

**Solución:** Escucha el evento `onAudioFocusChanged` y re-solicita si es necesario:
```tsx
<Video
  onAudioFocusChanged={async (event) => {
    if (!event.hasAudioFocus) {
      // Intentar recuperar el focus
      const tag = findNodeHandle(videoRef.current);
      if (tag) {
        await VideoAudioFocus.requestAudioFocus(tag);
      }
    }
  }}
/>
```

### findNodeHandle retorna null

**Solución:** Asegúrate de que el componente está montado:
```typescript
useEffect(() => {
  // Esperar a que el componente esté montado
  setTimeout(async () => {
    const tag = findNodeHandle(videoRef.current);
    if (tag) {
      await VideoAudioFocus.requestAudioFocus(tag);
    }
  }, 100);
}, []);
```

---

## Ejemplo Completo

```tsx
import React, { useRef, useState, useEffect } from 'react';
import { View, Button, findNodeHandle } from 'react-native';
import Video, { VideoAudioFocus } from 'react-native-video';

function AudioPlayer() {
  const videoRef = useRef<Video>(null);
  const [paused, setPaused] = useState(true);
  const [hasAudioFocus, setHasAudioFocus] = useState(false);

  // Solicitar audio focus al montar
  useEffect(() => {
    const requestFocus = async () => {
      const tag = findNodeHandle(videoRef.current);
      if (tag) {
        const result = await VideoAudioFocus.requestAudioFocus(tag);
        setHasAudioFocus(result.granted);
      }
    };

    requestFocus();

    // Abandonar al desmontar
    return () => {
      const tag = findNodeHandle(videoRef.current);
      if (tag) {
        VideoAudioFocus.abandonAudioFocus(tag);
      }
    };
  }, []);

  const handlePlay = async () => {
    if (!hasAudioFocus) {
      const tag = findNodeHandle(videoRef.current);
      if (tag) {
        const result = await VideoAudioFocus.requestAudioFocus(tag);
        if (!result.granted) {
          alert('No se pudo obtener audio focus');
          return;
        }
        setHasAudioFocus(true);
      }
    }
    setPaused(false);
  };

  const handlePause = () => {
    setPaused(true);
  };

  return (
    <View>
      <Video
        ref={videoRef}
        source={{ uri: 'https://example.com/audio.mp3' }}
        disableFocus={true}  // Control manual
        paused={paused}
        onAudioFocusChanged={(event) => {
          setHasAudioFocus(event.hasAudioFocus);
          if (!event.hasAudioFocus) {
            setPaused(true);  // Pausar si perdemos el focus
          }
        }}
      />
      
      <Button 
        title={paused ? 'Play' : 'Pause'} 
        onPress={paused ? handlePlay : handlePause}
      />
      
      <Text>Audio Focus: {hasAudioFocus ? '✅' : '❌'}</Text>
    </View>
  );
}

export default AudioPlayer;
```

---

## Referencias

- [Android Audio Focus Documentation](https://developer.android.com/guide/topics/media-apps/audio-focus)
- [AudioManager API](https://developer.android.com/reference/android/media/AudioManager)
- [Media Apps Best Practices](https://developer.android.com/guide/topics/media-apps/media-apps-overview)
