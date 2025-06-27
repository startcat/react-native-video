# Servicios y Permisos del Player

En este documento se explican los permisos y servicios necesarios para el funcionamiento completo del reproductor de video, incluyendo reproducción en segundo plano, widgets multimedia, descarga de contenido y casting. También se detallan los requisitos para la aprobación en las tiendas de aplicaciones.

## ¿Por qué son necesarios estos permisos?

El reproductor de video requiere permisos específicos para proporcionar una experiencia multimedia completa:

- **Reproducción en segundo plano**: Mantener la reproducción cuando la app no está en primer plano
- **Widgets multimedia**: Mostrar controles en el sistema operativo (notificaciones, Control Center)
- **Descarga de contenido**: Permitir descargas offline para visualización posterior
- **Casting**: Enviar contenido a dispositivos externos (Chromecast, AirPlay)
- **Sincronización de datos**: Gestionar metadatos y estados de reproducción
- **Pantalla activa**: Evitar que la pantalla se apague durante la reproducción

## Configuración Android

### Permisos requeridos

Añade los siguientes permisos en `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Servicios en primer plano para reproducción multimedia -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Servicios en primer plano para descarga de contenido -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_DOWNLOAD" />

<!-- Servicios en primer plano para sincronización de datos -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<!-- Reinicio automático de servicios tras reinicio del dispositivo -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Acceso al estado de la red para verificar conectividad -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Mostrar notificaciones (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Mantener la pantalla activa durante reproducción -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

#### Descripción de permisos

| Permiso | Propósito | Uso en el Player |
|---------|-----------|------------------|
| `FOREGROUND_SERVICE` | Ejecutar servicios en primer plano | Base para todos los servicios multimedia |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Reproducción multimedia en primer plano | Widgets del sistema, reproducción en background |
| `FOREGROUND_SERVICE_MEDIA_DOWNLOAD` | Descarga de contenido multimedia | Contenido offline, cache |
| `FOREGROUND_SERVICE_DATA_SYNC` | Sincronización de datos multimedia | Metadatos, estados de reproducción, analytics |
| `RECEIVE_BOOT_COMPLETED` | Recibir notificación de reinicio | Reanudar descargas pendientes |
| `ACCESS_NETWORK_STATE` | Verificar estado de red | Adaptar calidad según conectividad |
| `POST_NOTIFICATIONS` | Mostrar notificaciones | Controles multimedia en notificaciones |
| `WAKE_LOCK` | Mantener pantalla activa | Evitar apagado durante reproducción |

### Servicios requeridos

Configura los siguientes servicios en `android/app/src/main/AndroidManifest.xml`:

```xml
<application>
    <!-- Servicio de descarga offline -->
    <service 
        android:name="com.brentvatne.offline.AxDownloadService"
        android:foregroundServiceType="mediaPlayback|dataSync"
        android:exported="false">
        <intent-filter>
            <action android:name="com.google.android.exoplayer.downloadService.action.RESTART"/>
            <category android:name="android.intent.category.DEFAULT"/>
        </intent-filter>
    </service>

    <!-- Servicio de reproducción multimedia -->
    <service 
        android:name="com.brentvatne.exoplayer.VideoPlaybackService"
        android:foregroundServiceType="mediaPlayback"
        android:exported="false">
        <intent-filter>
            <action android:name="com.brentvatne.exoplayer.action.MEDIA_BUTTON"/>
            <category android:name="android.intent.category.DEFAULT"/>
        </intent-filter>
    </service>
</application>
```

#### Descripción de servicios

| Servicio | Funcionalidad | Tipos | Características |
|----------|-----------|-------------------|-----------------| 
| `AxDownloadService` | Gestión de descargas | `mediaPlayback`, `dataSync` | Descarga offline, cache persistente, sincronización de metadatos, reanudación tras reinicio |
| `VideoPlaybackService` | Reproducción multimedia | `mediaPlayback` | Widgets del sistema, reproducción en background |

#### Tipos de servicios en primer plano

Los servicios utilizan múltiples tipos para proporcionar funcionalidades completas:

**mediaPlayback:**
- Reproducción de audio/video en segundo plano
- Controles multimedia en notificaciones
- Integración con widgets del sistema
- Gestión de sesiones multimedia

**dataSync:**
- Sincronización de metadatos de contenido
- Gestión de estado de reproducción
- Actualización de analytics y estadísticas
- Sincronización de marcadores y posiciones

## Configuración iOS

### Info.plist

Añade la siguiente configuración en `ios/YourApp/Info.plist`:

```xml
<!-- Capacidades de audio en segundo plano -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

#### Descripción de capacidades iOS

| Capacidad | Propósito | Uso en el Player |
|-----------|-----------|------------------|
| `audio` | Reproducción de audio en background | Continuar reproducción cuando la app está en segundo plano, widgets del sistema |

### Configuración adicional automática

iOS maneja automáticamente:
- **Audio Session**: Configurado automáticamente por react-native-video
- **Now Playing Info**: Metadatos enviados automáticamente a widgets del sistema
- **Remote Control**: Controles del Control Center y pantalla de bloqueo

## Funcionalidades habilitadas

### 1. Reproducción en segundo plano

**Android:**
- Servicio `VideoPlaybackService` mantiene la reproducción activa
- Notificación persistente con controles multimedia
- Integración con widgets del sistema

**iOS:**
- Capacidad `audio` permite reproducción continua
- Integración automática con Control Center
- Controles en pantalla de bloqueo

### 2. Widgets multimedia del sistema

**Android:**
- Notificación con controles (play/pause, siguiente, anterior)
- Metadatos del contenido (título, imagen, descripción)
- Controles desde la barra de notificaciones

**iOS:**
- Widget "Now Playing" en Control Center
- Controles en pantalla de bloqueo
- Metadatos en widgets del sistema

### 3. Descarga de contenido offline

**Android:**
- Servicio `AxDownloadService` gestiona descargas
- Reanudación automática tras reinicio del dispositivo
- Notificaciones de progreso de descarga

**iOS:**
- Gestión nativa de cache y descarga
- Integración con el sistema de archivos iOS

### 4. Casting

**Android:**
- Soporte completo para Chromecast
- Detección automática de dispositivos de casting
- Transferencia de metadatos y controles

**iOS:**
- Soporte nativo para AirPlay
- Integración automática con dispositivos compatibles

### 5. Gestión de pantalla

**Android:**
- `WAKE_LOCK` mantiene la pantalla activa durante reproducción
- Control automático según estado de reproducción

**iOS:**
- Gestión automática de la pantalla por el sistema

## Requisitos para tiendas de aplicaciones

### Google Play Console

#### 1. Declaración de permisos sensibles

**Permisos que requieren justificación:**
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `FOREGROUND_SERVICE_MEDIA_DOWNLOAD`
- `FOREGROUND_SERVICE_DATA_SYNC`
- `POST_NOTIFICATIONS`

#### 2. Formulario de declaración de permisos

En Google Play Console, debes completar:

**Sección: Permisos de aplicación**
- **Foreground Services**: Seleccionar "Media playback", "Media download", "Data sync"
- **Justificación**: "La aplicación reproduce contenido multimedia, permite descargas offline y sincroniza datos de reproducción"
- **Uso**: "Reproducción de video/audio en segundo plano, descarga de contenido multimedia y sincronización de metadatos"

**Sección: Notificaciones**
- **Tipo**: "Media controls"
- **Justificación**: "Controles multimedia en notificaciones para reproducción en segundo plano"

**Sección: Funcionalidades específicas**

**Foreground Service - Media Playback:**
```
Funcionalidad: Reproducción multimedia en segundo plano
Justificación: Permite continuar la reproducción cuando el usuario minimiza la app
Experiencia de usuario: Controles en notificaciones y widgets del sistema
```

**Foreground Service - Media Download:**
```
Funcionalidad: Descarga de contenido multimedia para visualización offline
Justificación: Permite descargas de contenido autorizado para uso posterior sin conexión
Experiencia de usuario: Disponibilidad de contenido sin conexión a internet
```

**Foreground Service - Data Sync:**
```
Funcionalidad: Sincronización de datos de reproducción y metadatos
Justificación: Mantiene sincronizados los estados de reproducción, marcadores y analytics
Experiencia de usuario: Continuidad de reproducción entre sesiones y dispositivos
```

#### 3. Descripción en la ficha de la app

```
Esta aplicación utiliza servicios en segundo plano para:
• Reproducción continua de contenido multimedia
• Controles de reproducción en notificaciones
• Descarga de contenido para visualización offline
• Integración con widgets multimedia del sistema
• Sincronización de datos de reproducción y metadatos
```

#### 4. Políticas a cumplir

- **Política de servicios en primer plano**: Uso exclusivo para funcionalidades multimedia
- **Política de notificaciones**: Solo para controles de reproducción
- **Política de permisos**: Justificación clara del uso de cada permiso

### App Store Connect (iOS)

#### 1. Capacidades en Xcode

Habilitar en Xcode:
- **Background Modes**: Audio, AirPlay, and Picture in Picture

#### 2. Descripción en App Store

```
Esta aplicación utiliza reproducción en segundo plano para:
• Continuar la reproducción de audio cuando la app está en segundo plano
• Integración con Control Center y controles de pantalla de bloqueo
• Soporte para AirPlay y casting a dispositivos externos
```

#### 3. Revisión de Apple

**Puntos de verificación:**
- Uso legítimo de reproducción en background
- Integración correcta con controles del sistema
- No abuso de capacidades de background

## Mejores prácticas para aprobación

### 1. Documentación clara

**Para Google Play:**
- Explicar claramente el uso de cada permiso
- Proporcionar capturas de pantalla de las funcionalidades
- Documentar el flujo de usuario que requiere cada permiso

**Para App Store:**
- Describir las funcionalidades multimedia claramente
- Mostrar la integración con controles del sistema
- Explicar el beneficio para el usuario

### 2. Implementación responsable

```javascript
// Ejemplo de uso responsable de servicios
const PlayerWithServices = ({ content }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Solo activar servicios cuando sea necesario
  useEffect(() => {
    if (isPlaying && content) {
      // Activar servicio de reproducción
      startMediaService();
    } else {
      // Detener servicio cuando no se necesite
      stopMediaService();
    }
    
    return () => {
      stopMediaService();
    };
  }, [isPlaying, content]);
  
  return (
    <Player
      {...props}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onEnd={() => setIsPlaying(false)}
    />
  );
};
```

### 3. Gestión de permisos

**Android (API 33+):**
```javascript
// Solicitar permiso de notificaciones cuando sea necesario
const requestNotificationPermission = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
};
```

### 4. Transparencia con el usuario

- **Explicar funcionalidades**: Informar al usuario sobre reproducción en background
- **Controles claros**: Proporcionar opciones para desactivar funcionalidades
- **Notificaciones útiles**: Solo mostrar notificaciones relevantes para el usuario

## Troubleshooting común

### Google Play Console

**Rechazo por uso de foreground services:**
- Verificar que el uso esté claramente justificado
- Asegurar que solo se usan para funcionalidades multimedia
- Proporcionar capturas de pantalla de la funcionalidad
- Documentar específicamente el uso de cada tipo de servicio (mediaPlayback, dataSync)

**Rechazo por notificaciones:**
- Verificar que las notificaciones son solo para controles multimedia
- No usar notificaciones para promociones o contenido no relacionado

**Rechazo por permisos de Data Sync:**
- Demostrar que la sincronización es para datos multimedia únicamente
- Explicar claramente qué datos se sincronizan (metadatos, posiciones, marcadores)
- No usar para sincronización de datos no relacionados con multimedia

### App Store

**Rechazo por background audio:**
- Verificar que solo se reproduce audio/video legítimo
- No usar background audio para otras funcionalidades
- Asegurar integración correcta con controles del sistema

**Rechazo por funcionalidades de casting:**
- Demostrar integración legítima con AirPlay
- Verificar que no se realiza screen recording no autorizado
- Asegurar que el casting es para contenido multimedia únicamente

## Consideraciones de desarrollo

### Testing

```javascript
// Test de servicios en background
describe('Background Services', () => {
  test('should start media service when playing', () => {
    const { getByTestId } = render(<PlayerWithServices />);
    fireEvent.press(getByTestId('play-button'));
    expect(MediaService.isRunning()).toBe(true);
  });
  
  test('should stop media service when paused', () => {
    const { getByTestId } = render(<PlayerWithServices />);
    fireEvent.press(getByTestId('pause-button'));
    expect(MediaService.isRunning()).toBe(false);
  });
  
  test('should sync playback data when position changes', () => {
    const { getByTestId } = render(<PlayerWithServices />);
    const player = getByTestId('video-player');
    
    // Simular cambio de posición
    fireEvent(player, 'onProgress', { currentTime: 120 });
    expect(DataSyncService.getLastSyncedPosition()).toBe(120);
  });
  
  test('should handle casting to external devices', () => {
    const { getByTestId } = render(<PlayerWithServices />);
    const castButton = getByTestId('cast-button');
    
    fireEvent.press(castButton);
    expect(MediaProjectionService.isCasting()).toBe(true);
  });
  
  test('should maintain service types correctly', () => {
    const { getByTestId } = render(<PlayerWithServices />);
    
    // Verificar que los servicios usan los tipos correctos
    expect(AxDownloadService.getServiceTypes()).toContain('mediaPlayback');
    expect(AxDownloadService.getServiceTypes()).toContain('dataSync');
    expect(VideoPlaybackService.getServiceTypes()).toContain('mediaPlayback');
  });
});
```

### Monitoreo

- **Uso de batería**: Monitorear el impacto en la batería
- **Uso de red**: Controlar el consumo de datos en descargas
- **Rendimiento**: Verificar que los servicios no afecten el rendimiento

### Actualizaciones

- **Cambios en políticas**: Mantenerse actualizado con cambios en políticas de Google/Apple
- **Nuevas versiones de Android/iOS**: Adaptar a nuevos requisitos de permisos
- **Feedback de usuarios**: Ajustar funcionalidades según feedback

## Resumen de implementación

1. **Configurar permisos** según la plataforma
2. **Implementar servicios** necesarios para cada funcionalidad
3. **Documentar uso** claramente en las tiendas
4. **Seguir mejores prácticas** para aprobación
5. **Mantener transparencia** con los usuarios
6. **Monitorear rendimiento** y uso de recursos