# Metadatos en Widgets del Sistema Operativo

En este documento se explica cómo configurar y utilizar los widgets multimedia del sistema operativo (Now Playing, Control Center, notificaciones de reproducción) para mostrar metadatos del contenido que se está reproduciendo.

## ¿Qué son los widgets multimedia del sistema?

Los widgets multimedia del sistema operativo son interfaces nativas que permiten a los usuarios controlar la reproducción de contenido multimedia desde fuera de la aplicación. Incluyen:

- **Android**: Notificaciones de reproducción multimedia, controles en la barra de notificaciones
- **iOS**: Widget "Now Playing" en Control Center, pantalla de bloqueo, y widgets de iOS

## Requerimientos para widgets multimedia del sistema

Para que los metadatos se muestren correctamente en los widgets multimedia del sistema operativo, es necesario configurar ciertos permisos y ajustes en cada plataforma.

### Android

Para que funcionen los widgets multimedia en Android, es necesario añadir los siguientes permisos en el archivo `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Permisos requeridos para widgets multimedia -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Permiso opcional para mostrar notificaciones -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Configuración adicional en AndroidManifest.xml:**

```xml
<application>
  <!-- Servicio para reproducción en segundo plano -->
  <service
    android:name="com.brentvatne.exoplayer.VideoPlaybackService"
    android:exported="false"
    android:foregroundServiceType="mediaPlayback">
    <intent-filter>
      <action android:name="androidx.media3.session.MediaSessionService" />
    </intent-filter>
  </service>
```

### iOS

Para iOS, los widgets multimedia funcionan automáticamente cuando se proporcionan los metadatos correctos. Sin embargo, es necesario configurar ciertos aspectos:

**Info.plist configuración:**

```xml
<!-- Capacidades de audio en segundo plano -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>background-processing</string>
</array>

<!-- Categoría de audio -->
<key>AVAudioSessionCategory</key>
<string>AVAudioSessionCategoryPlayback</string>

<!-- Permitir reproducción con el dispositivo silenciado -->
<key>AVAudioSessionCategoryOptions</key>
<array>
  <string>AVAudioSessionCategoryOptionMixWithOthers</string>
</array>
```

**Configuración de Audio Session (automática en react-native-video):**

```javascript
// Esto se maneja automáticamente por react-native-video
// pero es importante entender qué ocurre internamente
import { AudioSession } from 'react-native-audio-session';

AudioSession.setCategory('Playback', {
  mixWithOthers: true,
  duckOthers: true,
  interruptSpokenAudioAndMixWithOthers: true,
});
```

## Verificación de funcionamiento

Para verificar que los widgets multimedia funcionan correctamente:

### Android
1. Reproduce contenido con metadatos completos
2. Ve a la barra de notificaciones
3. Verifica que aparece la notificación de reproducción con:
   - Título y subtítulo del contenido
   - Imagen del póster
   - Controles de reproducción (play/pause, siguiente, anterior)

### iOS
1. Reproduce contenido con metadatos completos
2. Abre el Control Center
3. Verifica que aparece el widget "Now Playing" con:
   - Título y subtítulo del contenido
   - Imagen del póster (usar `squaredPoster` para mejor visualización)
   - Controles de reproducción

## Troubleshooting común

### Android
- **Los metadatos no aparecen**: Verifica que los permisos estén correctamente configurados
- **La imagen no se muestra**: Asegúrate de que la URL del póster sea accesible y esté en formato soportado
- **Los controles no funcionan**: Verifica la configuración del MediaBrowserService
- **La notificación no persiste**: Asegúrate de que el servicio en primer plano esté correctamente configurado

### iOS
- **El widget no aparece**: Verifica que la categoría de audio esté configurada como "Playback"
- **La imagen se ve distorsionada**: Usa `squaredPoster` en lugar de `poster` para widgets de iOS
- **Los controles no responden**: Verifica que los eventos del Player estén correctamente configurados
- **No funciona en pantalla de bloqueo**: Verifica los UIBackgroundModes en Info.plist

## Implementación

### Ejemplo básico con widgets del sistema

```javascript
const PlayerWithSystemWidgets = ({ contentData }) => {
  return (
    <Player
      // Metadatos completos para widgets del sistema
      title={contentData.title}
      subtitle={contentData.subtitle}
      description={contentData.description}
      poster={contentData.poster} // Para Android y interfaz general
      squaredPoster={contentData.squaredPoster} // Para widgets de iOS
      
      // Configuración del contenido
      manifests={contentData.manifests}
      
      // Eventos para integración con controles del sistema
      onPlay={() => {
        // Se ejecuta cuando se presiona play desde el widget del sistema
        console.log('Reproducción iniciada desde widget del sistema');
      }}
      onPause={() => {
        // Se ejecuta cuando se presiona pause desde el widget del sistema
        console.log('Reproducción pausada desde widget del sistema');
      }}
      onNext={() => {
        // Se ejecuta cuando se presiona siguiente desde el widget del sistema
        console.log('Siguiente contenido desde widget del sistema');
      }}
      
      {...otherProps}
    />
  );
};
```

### Ejemplo con gestión de estados para widgets

```javascript
const PlayerWithAdvancedSystemIntegration = ({ playlist, currentIndex }) => {
  const currentContent = playlist[currentIndex];
  
  const handleNext = useCallback(() => {
    if (currentIndex < playlist.length - 1) {
      // Lógica para pasar al siguiente contenido
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, playlist.length]);
  
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      // Lógica para pasar al contenido anterior
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);
  
  return (
    <Player
      title={currentContent.title}
      subtitle={currentContent.subtitle}
      description={currentContent.description}
      poster={currentContent.poster}
      squaredPoster={currentContent.squaredPoster}
      manifests={currentContent.manifests}
      
      // Habilitar botón siguiente si hay más contenido
      hasNext={currentIndex < playlist.length - 1}
      
      // Eventos del sistema
      onNext={handleNext}
      onPrevious={handlePrevious}
      onPlay={() => {
        // Actualizar estado de reproducción
        updatePlaybackState('playing');
      }}
      onPause={() => {
        // Actualizar estado de reproducción
        updatePlaybackState('paused');
      }}
    />
  );
};
```

### Ejemplo con metadatos dinámicos

```javascript
const PlayerWithDynamicMetadata = ({ contentData, isLive }) => {
  // Para contenido en vivo, actualizar metadatos periódicamente
  const [liveMetadata, setLiveMetadata] = useState(contentData);
  
  useEffect(() => {
    if (isLive) {
      const interval = setInterval(() => {
        // Actualizar metadatos del programa en vivo
        fetchCurrentProgramInfo().then(setLiveMetadata);
      }, 30000); // Actualizar cada 30 segundos
      
      return () => clearInterval(interval);
    }
  }, [isLive]);
  
  return (
    <Player
      title={liveMetadata.title}
      subtitle={isLive ? `EN VIVO • ${liveMetadata.subtitle}` : liveMetadata.subtitle}
      description={liveMetadata.description}
      poster={liveMetadata.poster}
      squaredPoster={liveMetadata.squaredPoster}
      manifests={liveMetadata.manifests}
      isLive={isLive}
      
      // Para contenido en vivo, algunos controles no aplican
      onNext={isLive ? undefined : handleNext}
      onSeek={isLive ? undefined : handleSeek}
    />
  );
};
```

## Consideraciones importantes

### Permisos y privacidad

- **Android 13+**: Es necesario solicitar permiso explícito para mostrar notificaciones
- **iOS**: Los widgets funcionan automáticamente, pero respetan la configuración de privacidad del usuario
- **Datos sensibles**: Evita mostrar información sensible en widgets que pueden ser visibles en pantalla de bloqueo

### Optimización de recursos

- **Imágenes**: Las imágenes de pósters deben estar optimizadas para diferentes tamaños de pantalla
- **Metadatos**: Mantén los títulos y descripciones concisos para mejor visualización
- **Actualizaciones**: No actualices metadatos muy frecuentemente para evitar consumo excesivo de batería

### Compatibilidad

- **Fallbacks**: Siempre proporciona tanto `poster` como `squaredPoster` para máxima compatibilidad
- **Versiones de SO**: Prueba en diferentes versiones de Android e iOS
- **Dispositivos**: Considera las diferencias entre tablets y teléfonos

### Testing

#### Android
```bash
# Verificar permisos
adb shell dumpsys package com.yourapp | grep permission

# Verificar servicios en ejecución
adb shell dumpsys activity services | grep MediaPlayback

# Verificar notificaciones
adb shell dumpsys notification
```

#### iOS
```bash
# Verificar configuración de audio session
# (requiere dispositivo físico o simulador con Xcode)

# Verificar background modes en Info.plist
plutil -p Info.plist | grep -A5 UIBackgroundModes
```

## Integración con otras funcionalidades

Los widgets del sistema se integran con otras funcionalidades del Player:

- **Continue Watching**: Los metadatos se mantienen al reanudar reproducción desde widgets
- **Casting**: Los controles del sistema pueden coexistir con controles de casting
- **Youbora**: Las interacciones desde widgets pueden reportarse en analíticas
- **Offline**: Los widgets funcionan normalmente en modo offline
