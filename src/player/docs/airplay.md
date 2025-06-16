# Integración con AirPlay

Este documento explica cómo funciona y cómo configurar AirPlay en el componente Player para la transmisión inalámbrica de contenido multimedia a dispositivos Apple TV y otros receptores compatibles.

## ¿Qué es AirPlay?

AirPlay es la tecnología de transmisión inalámbrica de Apple que permite enviar contenido multimedia desde dispositivos iOS a receptores compatibles como:

- **Apple TV**: Dispositivos de streaming de Apple
- **Altavoces compatibles**: HomePod, altavoces con AirPlay 2
- **Smart TVs**: Televisores con soporte nativo de AirPlay
- **Receptores de audio**: Sistemas de sonido compatibles

### Características principales

- **Transmisión sin cables**: Envío de video y audio por WiFi
- **Calidad alta**: Soporte para video HD y 4K según el dispositivo
- **Control remoto**: El dispositivo iOS actúa como control remoto
- **Sincronización**: Audio y video perfectamente sincronizados
- **Multi-room**: Reproducción simultánea en múltiples dispositivos (AirPlay 2)

## Configuración en el Player

### 1. Dependencias necesarias

El Player utiliza la librería `react-airplay` para la integración:

```json
{
  "dependencies": {
    "react-airplay": "^1.0.0"
  }
}
```

### 2. Configuración automática

AirPlay se configura automáticamente en el Player cuando se ejecuta en dispositivos iOS. No requiere configuración adicional por parte del desarrollador.

### 3. Detección de conectividad

El Player detecta automáticamente cuando está conectado a un dispositivo AirPlay:

```javascript
import { useAirplayConnectivity } from 'react-airplay';

const MyPlayer = () => {
  const isAirplayConnected = useAirplayConnectivity();
  
  // El Player ajusta su comportamiento según la conectividad
  return (
    <Player
      // ... props del player
      // La configuración de AirPlay es automática
    />
  );
};
```

## Funcionalidades automáticas

### 1. Ajustes de reproducción

Cuando AirPlay está conectado, el Player ajusta automáticamente:

| Configuración | Valor normal | Valor con AirPlay | Descripción |
|---------------|--------------|-------------------|-------------|
| `playInBackground` | `false` | `true` | Permite reproducción en segundo plano |
| `playWhenInactive` | `false` | `true` | Continúa reproducción cuando la app está inactiva |
| `preventsDisplaySleepDuringVideoPlayback` | `true` | `false` | No previene el bloqueo de pantalla (no necesario) |

### 2. Comportamiento de controles

- **Controles siempre visibles**: Los controles permanecen visibles durante la transmisión AirPlay
- **Control remoto**: El dispositivo iOS actúa como control remoto completo
- **Sincronización**: Los controles se sincronizan con el estado del reproductor remoto

### 3. Gestión de DRM

Para contenido protegido, el Player utiliza automáticamente:

- **FairPlay DRM**: Protocolo de Apple para contenido protegido
- **Transmisión segura**: El contenido se transmite de forma cifrada
- **Autenticación**: Validación de licencias en el dispositivo receptor

## Botón AirPlay

### 1. Configuración del botón

El Player incluye un botón AirPlay nativo que se muestra automáticamente en iOS:

```javascript
// El botón se incluye automáticamente en la barra de controles
const AirplayButton = ({
  accessibilityLabel = 'Airplay',
  disabled = false
}) => {
  // Configuración automática del botón nativo
  return (
    <NativeAirplayButton
      prioritizesVideoDevices={true}
      tintColor="white"
      activeTintColor="#007AFF"
      accessibilityRole="button"
    />
  );
};
```

### 2. Propiedades del botón

| Propiedad | Tipo | Descripción | Valor por defecto |
|-----------|------|-------------|-------------------|
| `prioritizesVideoDevices` | boolean | Prioriza dispositivos de video sobre audio | `true` |
| `tintColor` | string | Color del icono cuando está inactivo | `"white"` |
| `activeTintColor` | string | Color del icono cuando está activo | `"#007AFF"` |
| `accessibilityLabel` | string | Etiqueta de accesibilidad | `"Airplay"` |
| `disabled` | boolean | Deshabilita el botón | `false` |

### 3. Acción de control

El botón AirPlay utiliza la acción tipada:

```javascript
// Acción definida en CONTROL_ACTION
CONTROL_ACTION.AIRPLAY = 'airplay'

// Se ejecuta automáticamente al presionar el botón
const handleAirplayPress = () => {
  showRoutePicker({ prioritizesVideoDevices: true });
};
```

## Configuración avanzada

### 1. Personalización del botón

```javascript
// Personalizar apariencia del botón AirPlay
const CustomAirplayButton = () => {
  return (
    <AirplayButton
      accessibilityLabel="Transmitir a Apple TV"
      disabled={false}
    />
  );
};

// Usar en el Player
<Player
  controlsHeaderBar={CustomAirplayButton}
  // ... otras props
/>
```

### 2. Detección de dispositivos

```javascript
import { showRoutePicker } from 'react-airplay';

// Mostrar selector de dispositivos manualmente
const showAirplayPicker = () => {
  showRoutePicker({
    prioritizesVideoDevices: true
  });
};
```

### 3. Eventos de conectividad

```javascript
import { useAirplayConnectivity } from 'react-airplay';

const MyComponent = () => {
  const isAirplayConnected = useAirplayConnectivity();
  
  useEffect(() => {
    if (isAirplayConnected) {
      console.log('Conectado a AirPlay');
      // Lógica cuando se conecta
    } else {
      console.log('Desconectado de AirPlay');
      // Lógica cuando se desconecta
    }
  }, [isAirplayConnected]);
};
```

## Compatibilidad y requisitos

### 1. Requisitos del sistema

| Requisito | Especificación |
|-----------|----------------|
| **Plataforma** | iOS 9.0+ |
| **Dispositivos** | iPhone, iPad, iPod touch |
| **Red** | WiFi compartida entre dispositivos |
| **Receptores** | Apple TV, dispositivos compatibles con AirPlay |

### 2. Formatos de contenido soportados

| Formato | Video | Audio | DRM |
|---------|-------|-------|-----|
| **HLS** | ✅ | ✅ | FairPlay |
| **MP4** | ✅ | ✅ | No |
| **M4A** | ❌ | ✅ | No |
| **DASH** | ❌ | ❌ | No |

### 3. Limitaciones

- **Solo iOS**: AirPlay solo está disponible en dispositivos iOS
- **Red WiFi**: Requiere que ambos dispositivos estén en la misma red
- **Latencia**: Puede haber ligero retraso en la transmisión
- **Calidad**: Depende de la velocidad y estabilidad de la red WiFi

## Integración con otras funcionalidades

### 1. Youbora Analytics

Cuando AirPlay está activo, las analíticas se configuran automáticamente:

```javascript
// Configuración automática para AirPlay
const youboraConfig = {
  // ... configuración base
  content: {
    customDimension: {
      1: "airplay",  // Identifica transmisión AirPlay
      // ... otras dimensiones
    }
  }
};
```

### 2. Controles personalizados

Los controles se adaptan automáticamente cuando AirPlay está conectado:

```javascript
// Los controles permanecen visibles durante AirPlay
const ControlsOverlay = ({ isAirplayConnected }) => {
  return (
    <Overlay
      alwaysVisible={isAirplayConnected}
      // ... otras props
    />
  );
};
```

### 3. Gestión de estado

El estado del Player se sincroniza automáticamente:

```javascript
// Estados sincronizados automáticamente
const PlayerStates = {
  playing: true,     // Estado de reproducción
  currentTime: 120,  // Posición actual
  duration: 3600,    // Duración total
  volume: 0.8,       // Nivel de volumen
  muted: false       // Estado de silencio
};
```

## Troubleshooting

### Problemas comunes

**1. Botón AirPlay no aparece**
- Verificar que el dispositivo sea iOS
- Comprobar que hay dispositivos AirPlay disponibles en la red
- Reiniciar la aplicación

**2. No se detectan dispositivos AirPlay**
- Verificar que ambos dispositivos estén en la misma red WiFi
- Comprobar que AirPlay esté habilitado en el receptor
- Reiniciar el router WiFi si es necesario

**3. Problemas de reproducción**
- Verificar la estabilidad de la conexión WiFi
- Comprobar que el formato de video sea compatible
- Verificar que no haya interferencias en la red

**4. Audio sin video o viceversa**
- Verificar que el contenido tenga ambas pistas
- Comprobar configuración de audio en el dispositivo receptor
- Reiniciar la transmisión AirPlay

### Debug y logs

```javascript
// Habilitar logs de debug para AirPlay
const debugAirplay = () => {
  console.log('AirPlay connected:', useAirplayConnectivity());
  console.log('Available devices:', getAirplayDevices());
  console.log('Current route:', getCurrentAirplayRoute());
};
```

## Mejores prácticas

### 1. Experiencia de usuario

- **Indicador visual**: Mostrar claramente cuando AirPlay está activo
- **Controles intuitivos**: Mantener controles familiares durante la transmisión
- **Feedback**: Proporcionar retroalimentación sobre el estado de conexión

### 2. Rendimiento

- **Calidad adaptativa**: Ajustar calidad según la red
- **Buffer inteligente**: Mantener buffer adecuado para transmisión estable
- **Gestión de memoria**: Optimizar uso de memoria durante transmisión

### 3. Compatibilidad

- **Detección automática**: Detectar capacidades del dispositivo receptor
- **Fallback**: Proporcionar alternativas si AirPlay no está disponible
- **Testing**: Probar con diferentes dispositivos y configuraciones de red

## Consideraciones de desarrollo

### 1. Testing

```javascript
// Simular conectividad AirPlay en desarrollo
const mockAirplayConnectivity = (connected = true) => {
  // Mock para testing
  return connected;
};
```

### 2. Configuración de proyecto

Asegurar que el proyecto iOS tenga las capacidades necesarias:

```xml
<!-- Info.plist -->
<key>NSLocalNetworkUsageDescription</key>
<string>Esta app usa la red local para transmitir contenido a dispositivos AirPlay</string>
```

### 3. Optimización

- **Lazy loading**: Cargar componentes AirPlay solo cuando sea necesario
- **Memoización**: Memorizar configuraciones que no cambian
- **Cleanup**: Limpiar recursos cuando se desconecta AirPlay

## Enlaces útiles

- [Documentación oficial de AirPlay](https://developer.apple.com/airplay/)
- [Guía de implementación AirPlay](https://developer.apple.com/documentation/avfoundation/airplay)
- [react-airplay en GitHub](https://github.com/react-native-airplay/react-airplay)
- [Especificaciones técnicas de AirPlay](https://developer.apple.com/airplay/specifications/)