# Guía de Instalación y Configuración

Esta guía explica cómo instalar y configurar React Native Video con todas las funcionalidades avanzadas, incluyendo configuraciones específicas para Android e iOS.

## Instalación básica

### 1. Instalación de la librería

```bash
yarn add react-native-video@github:startcat/react-native-video#master
```
_Pendiente de migrar a los npm en Azure_

### 2. Instalación de dependencias adicionales

Para funcionalidades completas del reproductor, instala estas dependencias esenciales:

```bash
# Dependencias principales del reproductor
yarn add @react-native-async-storage/async-storage@^1.21.0
yarn add @react-native-community/netinfo@^11.2.1
yarn add @react-native-community/slider@^4.5.2
yarn add @react-navigation/native@^6.1.17

# Gestión de pantalla y energía
yarn add @sayem314/react-native-keep-awake@^1.3.0
yarn add react-native-orientation-locker@^1.7.0
yarn add react-native-system-navigation-bar@^2.6.4

# UI y componentes visuales
yarn add @ui-kitten/components@^5.3.1
yarn add react-native-actions-sheet@^0.9.3
yarn add react-native-fast-image@^8.6.3
yarn add react-native-haptic-feedback@2.2.0

# Funcionalidades de red y datos
yarn add axios@^1.7.3
yarn add qs@^6.14.0
yarn add react-native-config@^1.5.1

# Casting y AirPlay
yarn add react-airplay@^1.2.0

# Sistema y dispositivo
yarn add react-native-device-info@^11.1.0
yarn add react-native-fs@^2.20.0
yarn add react-native-background-timer@^2.4.1
yarn add react-native-event-listeners@^1.0.7
```

#### Explicación de dependencias:

| Paquete | Propósito | Uso en el Player |
|---------|-----------|------------------|
| `@react-native-async-storage/async-storage` | Almacenamiento persistente | Configuraciones, estado de reproducción, cache |
| `@react-native-community/netinfo` | Estado de conectividad | Adaptar calidad según red, modo offline |
| `@react-native-community/slider` | Control deslizante nativo | Barra de progreso, control de volumen |
| `@react-navigation/native` | Navegación entre pantallas | Navegación del reproductor |
| `@sayem314/react-native-keep-awake` | Mantener pantalla activa | Evitar sleep durante reproducción |
| `@ui-kitten/components` | Componentes UI avanzados | Interfaz moderna del reproductor |
| `axios` | Cliente HTTP | Peticiones de API, metadatos |
| `qs` | Manipulación de query strings | Parámetros de URL, configuración |
| `react-airplay` | Detección AirPlay | Conectividad automática AirPlay |
| `react-native-actions-sheet` | Hojas de acción nativas | Menús contextuales, opciones |
| `react-native-background-timer` | Timers en segundo plano | Actualizaciones periódicas |
| `react-native-config` | Variables de entorno | Configuración por ambiente |
| `react-native-device-info` | Información del dispositivo | Adaptación de funcionalidades |
| `react-native-event-listeners` | Gestión de eventos | Eventos del sistema |
| `react-native-fast-image` | Carga optimizada de imágenes | Thumbnails, portadas |
| `react-native-fs` | Sistema de archivos | Descarga offline, cache |
| `react-native-haptic-feedback` | Feedback táctil | Interacciones del usuario |
| `react-native-orientation-locker` | Control de orientación | Rotación automática, bloqueo |
| `react-native-system-navigation-bar` | Barra de navegación | Modo inmersivo, colores |

### 3. Instalación completa con un comando

```bash
# Instalar todas las dependencias de una vez
yarn add \
  @react-native-async-storage/async-storage@^1.21.0 \
  @react-native-community/netinfo@^11.2.1 \
  @react-native-community/slider@^4.5.2 \
  @react-navigation/native@^6.1.17 \
  @sayem314/react-native-keep-awake@^1.3.0 \
  @ui-kitten/components@^5.3.1 \
  axios@^1.7.3 \
  qs@^6.14.0 \
  react-airplay@^1.2.0 \
  react-native-actions-sheet@^0.9.3 \
  react-native-background-timer@^2.4.1 \
  react-native-config@^1.5.1 \
  react-native-device-info@^11.1.0 \
  react-native-event-listeners@^1.0.7 \
  react-native-fast-image@^8.6.3 \
  react-native-fs@^2.20.0 \
  react-native-haptic-feedback@2.2.0 \
  react-native-orientation-locker@^1.7.0 \
  react-native-system-navigation-bar@^2.6.4
```

## Configuración Android

### 1. Configuración del proyecto principal (android/build.gradle)

Configura las versiones y características en el archivo `android/build.gradle`:

```gradle
buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 29
        compileSdkVersion = 35
        targetSdkVersion = 35
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.10"
        
        // Configuración del Cast Framework
        castFrameworkVersion = "21.3.0"
        
        // Habilitar ExoPlayer IMA para anuncios
        useExoplayerIMA = true
    }
    
    dependencies {
        classpath("com.android.tools.build:gradle:8.1.4")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
    }
}
```

#### Explicación de configuraciones clave:

| Configuración | Propósito | Valor recomendado |
|---------------|-----------|-------------------|
| `castFrameworkVersion` | Versión del Google Cast Framework | "21.3.0" |
| `useExoplayerIMA` | Habilita soporte para anuncios IMA | `true` |
| `minSdkVersion` | Versión mínima de Android | 29 (Android 10) |
| `compileSdkVersion` | Versión de compilación | 35 (Android 14) |
| `targetSdkVersion` | Versión objetivo | 35 (Android 14) |

### 2. Configuración de repositorios para Youbora (Opcional)

Si planeas usar Youbora Analytics, añade el repositorio en `android/build.gradle`:

```gradle
allprojects {
    repositories {
        google()
        mavenCentral()
        
        // Repositorio de Youbora para analytics
        maven {
            url "https://artifact.plugin.npaw.com/artifactory/plugins/android"
        }
        
        // Otros repositorios existentes...
        maven { url "https://www.jitpack.io" }
    }
}
```

### 3. Configuración de la aplicación (android/app/build.gradle)

Configura la compilación para arquitecturas de 64 bits para evitar errores con la librería de descarga en segundo plano:

```gradle
android {
    namespace "com.yourapp"
    compileSdkVersion rootProject.ext.compileSdkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    
    defaultConfig {
        applicationId "com.yourapp"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        
        // IMPORTANTE: Configuración para 64-bit para evitar errores
        // con @kesha-antonov/react-native-background-downloader
        ndk {
            abiFilters "arm64-v8a", "x86_64"
        }
        
        // Para debugging adicional del NDK (opcional)
        externalNativeBuild {
            cmake {
                arguments "-DANDROID_ARM_NEON=TRUE", "-DGWP_ASAN=ON"
            }
        }
    }
    
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}
```

#### ¿Por qué 64-bit?

La configuración `ndk { abiFilters "arm64-v8a", "x86_64" }` es **esencial** porque:

- **Compatibilidad**: Google Play Store requiere soporte para 64-bit desde 2019
- **Rendimiento**: Las arquitecturas de 64-bit ofrecen mejor rendimiento
- **Estabilidad**: Evita crashes con la librería de descarga en segundo plano
- **Futuro**: Google está deprecando gradualmente el soporte para 32-bit

### 4. Permisos requeridos (android/app/src/main/AndroidManifest.xml)

Añade los permisos necesarios según las funcionalidades que uses:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- PERMISOS BÁSICOS -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- PERMISOS PARA SERVICIOS MULTIMEDIA -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_DOWNLOAD" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    
    <!-- PERMISOS ADICIONALES -->
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    
    <application>
        <!-- Tu configuración de aplicación -->
    </application>
</manifest>
```

## Configuración iOS

### 1. Configuración del Podfile

Configura el `ios/Podfile` con las fuentes y características necesarias:

```ruby
# Fuentes de CocoaPods
source 'https://cdn.cocoapods.org'

# Fuente adicional para Youbora (si lo usas)
source 'https://repo.plugin.npaw.com/release/plugin-ios-cocoapods.git'

# Requerimientos de plataforma
platform :ios, min_ios_version_supported
prepare_react_native_project!

target 'TuApp' do
  config = use_native_modules!
  
  # IMPORTANTE: Usar frameworks estáticos para compatibilidad
  use_frameworks! :linkage => :static
  
  # CONFIGURACIÓN DE CARACTERÍSTICAS DE REACT-NATIVE-VIDEO
  
  # Habilitar Google IMA para anuncios
  $RNVideoUseGoogleIMA = true
  
  # Habilitar cache de video para reproducción offline
  $RNVideoUseVideoCaching = true
  
  # Habilitar Youbora Analytics (opcional)
  $RNVideoUseYoubora = true
  
  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )
  
  post_install do |installer|
    # Configuraciones post-instalación de React Native
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )
  end
end
```

#### Explicación de las características iOS:

| Variable | Propósito | Recomendado |
|----------|-----------|-------------|
| `$RNVideoUseGoogleIMA` | Soporte para anuncios Google IMA | `true` |
| `$RNVideoUseVideoCaching` | Cache de video para offline | `true` |
| `$RNVideoUseYoubora` | Analytics con Youbora | `true` si lo usas |

### 2. Configuración del Info.plist

Añade las capacidades necesarias en `ios/TuApp/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Configuración existente... -->
    
    <!-- CAPACIDADES DE AUDIO EN SEGUNDO PLANO -->
    <key>UIBackgroundModes</key>
    <array>
        <string>audio</string>
    </array>
    
    <!-- DESCRIPCIÓN PARA ACCESO A RED LOCAL (para AirPlay/Casting) -->
    <key>NSLocalNetworkUsageDescription</key>
    <string>Esta aplicación necesita acceso a la red local para detectar dispositivos de reproducción compatibles como Apple TV y AirPlay.</string>
    
    <!-- CONFIGURACIÓN DE ORIENTACIÓN -->
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
</dict>
</plist>
```

### 3. Instalación de pods

Después de configurar el Podfile, instala las dependencias:

```bash
cd ios
pod install
cd ..
```

## Configuraciones opcionales avanzadas

### 1. Configuración de ProGuard (Android)

Si usas minificación en Android, añade en `android/app/proguard-rules.pro`:

```proguard
# React Native Video
-keep class com.brentvatne.** { *; }
-keep class androidx.media3.** { *; }

# ExoPlayer
-dontwarn com.google.android.exoplayer2.**
-keep class com.google.android.exoplayer2.** { *; }

# Google Cast
-keep class com.google.android.gms.cast.** { *; }

# Youbora (si lo usas)
-keep class com.npaw.youbora.** { *; }
```

### 2. Configuración de Metro (React Native)

Para resolver mejor los assets de video, configura `metro.config.js`:

```javascript
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  resolver: {
    assetExts: [
      // Assets por defecto
      'bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'svg', 'webp',
      // Formatos de video y audio
      'mp4', 'mov', 'avi', 'mkv', 'mp3', 'm4a', 'aac', 'wav',
      // Subtítulos
      'vtt', 'srt', 'ass', 'ssa'
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

## Verificación de la instalación

### 1. Test básico

Crea un componente de prueba para verificar que todo funciona:

```javascript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Player } from 'react-native-video';

const TestPlayer = () => {
  return (
    <View style={styles.container}>
      <Player
        source={{
          uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
        }}
        style={styles.player}
        controls={true}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  player: {
    width: '100%',
    height: 200,
  },
});

export default TestPlayer;
```

### 2. Verificaciones post-instalación

Ejecuta estos comandos para verificar que todo está correctamente configurado:

```bash
# Verificar dependencias
yarn list react-native-video

# Limpiar caché (si hay problemas)
yarn start --reset-cache

# Android: Limpiar y reconstruir
cd android
./gradlew clean
cd ..
yarn react-native run-android

# iOS: Limpiar y reconstruir
cd ios
rm -rf build/
pod install
cd ..
yarn react-native run-ios
```

## Troubleshooting común

### Android

**Error: "Unable to load script"**
- Solución: `yarn start --reset-cache`

**Error: "Could not find cast framework"**
- Verificar que `castFrameworkVersion` está configurado en `build.gradle`

**Error con arquitecturas**
- Verificar `abiFilters "arm64-v8a", "x86_64"` en `app/build.gradle`

### iOS

**Error: "No such module 'react_native_video'"**
- Ejecutar `cd ios && pod install`

**Error de firma de código**
- Configurar el equipo de desarrollo en Xcode

**Error de AirPlay no funciona**
- Verificar `NSLocalNetworkUsageDescription` en `Info.plist`

## Próximos pasos

Una vez completada la instalación:

1. ✅ Revisa la [documentación de uso básico](./usage.md)
2. ✅ Configura [servicios y permisos](./services.md) según tus necesidades
3. ✅ Implementa funcionalidades avanzadas como [AirPlay](./airplay.md) o [Youbora](./youbora.md)
4. ✅ Personaliza la [interfaz de usuario](./ui-customization.md)

## Recursos adicionales

- [Documentación oficial de React Native Video](https://github.com/react-native-video/react-native-video)
- [Guía de ExoPlayer](https://exoplayer.dev/)
- [Documentación de AVPlayer](https://developer.apple.com/documentation/avfoundation/avplayer)
- [Google Cast SDK](https://developers.google.com/cast)
- [Youbora Analytics](https://youbora.nicepeopleatwork.com/)