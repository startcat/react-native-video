# Android Auto Integration - Documentación

> **Estado:** ✅ Implementación completa y funcional  
> **Última actualización:** Octubre 2025

## 📚 Documentos Disponibles

### 1. [native-playback.md](./native-playback.md) - **EMPEZAR AQUÍ**
**Implementación completa con reproducción nativa**

- Arquitectura detallada con diagramas
- Código completo de todos los componentes
- Flujo de reproducción paso a paso
- Configuración desde JavaScript
- Ventajas y problemas resueltos
- Guía de testing

**Ideal para:** Entender cómo funciona la implementación final.

---

### 2. [architecture.md](./architecture.md)
**Arquitectura del sistema**

- Componentes principales
- Flujos de navegación y reproducción
- Integración con código existente
- Reglas de implementación

**Ideal para:** Visión general de la arquitectura.

---

### 3. [context.md](./context.md)
**Contexto y decisiones de diseño**

- Objetivos del proyecto
- Principios fundamentales
- Opciones evaluadas
- Solución final adoptada
- Reglas de implementación

**Ideal para:** Entender el "por qué" de las decisiones.

---

### 4. [implementation-steps.md](./implementation-steps.md)
**Pasos de implementación**

- Orden de implementación por fases
- Código de cada componente
- Checklist de progreso
- Testing realizado

**Ideal para:** Referencia durante la implementación.

---

## 🎯 Resumen Ejecutivo

### ¿Qué es esto?

Integración completa de **Android Auto** con `react-native-video` que permite:

- ✅ **Navegación** por biblioteca de medios con app cerrada
- ✅ **Reproducción nativa** con ExoPlayer (sin React Native)
- ✅ **Notificación multimedia** con controles completos
- ✅ **Sincronización perfecta** entre Android Auto y notificación
- ✅ **Audio focus** manejado automáticamente
- ✅ **Funciona con pantalla apagada**

### ¿Cómo funciona?

```
Usuario en Android Auto → Selecciona contenido
    ↓
AndroidAutoMediaBrowserService (nativo)
    ↓
MediaCache obtiene URI del disco
    ↓
GlobalPlayerManager reproduce con ExoPlayer
    ↓
VideoPlaybackService muestra notificación
    ↓
✅ Audio se reproduce
✅ Controles sincronizados
✅ App puede estar cerrada
```

### Configuración Básica (JavaScript)

```typescript
import { AndroidAutoControl } from 'react-native-video';

// 1. Habilitar Android Auto
await AndroidAutoControl.enable();

// 2. Configurar biblioteca con URIs
await AndroidAutoControl.setMediaLibrary([
  {
    id: 'podcast_1',
    title: 'Episodio 1',
    uri: 'https://example.com/audio.mp3', // ← IMPORTANTE
    artist: 'Host',
    artworkUri: 'https://example.com/image.jpg',
    playable: true,
    parentId: 'root_podcasts'
  }
]);

// 3. Marcar como listo
await AndroidAutoControl.setJavaScriptReady();
```

---

## 🏗️ Componentes Principales

### Nativos (Kotlin)

1. **GlobalPlayerManager** - Singleton con ExoPlayer compartido
2. **AndroidAutoMediaBrowserService** - Servicio de Android Auto
3. **MediaCache** - Caché persistente con URIs
4. **VideoPlaybackService** - Foreground Service con notificación

### JavaScript/TypeScript

1. **AndroidAutoControl** - API estática para configuración
2. **useAndroidAuto** - Hook React opcional
3. **AndroidAutoProvider** - Provider global opcional

---

## ✅ Testing

### Test Básico

```bash
# 1. Force-stop la app
adb shell am force-stop <package>

# 2. Abrir Android Auto en el móvil o coche

# 3. Navegar por la biblioteca
# ✅ Debe mostrar contenido sin abrir la app

# 4. Seleccionar un item
# ✅ Debe reproducir audio
# ✅ Debe mostrar notificación multimedia
# ✅ Debe mostrar reproductor en Android Auto
```

### Verificar Sincronización

```bash
# 1. Reproducir desde Android Auto
# 2. Pausar desde notificación móvil
# ✅ Android Auto debe mostrar pausa

# 3. Reanudar desde Android Auto
# ✅ Notificación debe mostrar reproduciendo
```

---

## 🚀 Características

### ✅ Implementadas

- Navegación con app cerrada
- Reproducción nativa completa
- Notificación multimedia con controles
- Sincronización Android Auto ↔ Notificación
- Audio focus automático
- Foreground Service
- MediaCache persistente
- Configuración desde JavaScript

### 🔮 Futuras (Opcionales)

- Búsqueda de contenido
- Colas de reproducción
- Metadata dinámica
- Integración con descargas offline

---

## 📖 Orden de Lectura Recomendado

### Para Implementadores

1. **[native-playback.md](./native-playback.md)** - Entender la solución completa
2. **[architecture.md](./architecture.md)** - Ver la arquitectura
3. **[implementation-steps.md](./implementation-steps.md)** - Referencia de código

### Para Arquitectos

1. **[context.md](./context.md)** - Entender decisiones de diseño
2. **[architecture.md](./architecture.md)** - Ver componentes y flujos
3. **[native-playback.md](./native-playback.md)** - Detalles de implementación

### Para Usuarios de la Librería

1. **[native-playback.md](./native-playback.md)** - Sección "Configuración desde JavaScript"
2. Ejemplos de código en la app de prueba

---

## 🎓 Conceptos Clave

### MediaBrowserService
Servicio de Android que permite a apps externas (como Android Auto) navegar y controlar contenido multimedia.

### MediaSession
Objeto que representa una sesión de reproducción multimedia y permite control desde múltiples interfaces.

### GlobalPlayerManager
Singleton que mantiene una instancia única de ExoPlayer compartida entre Android Auto y React Native.

### MediaCache
Sistema de caché que almacena la biblioteca de medios en disco para acceso instantáneo sin JavaScript.

### Audio Focus
Sistema de Android que gestiona qué app puede reproducir audio en cada momento.

---

## 🆘 Troubleshooting

### No se ve contenido en Android Auto
- Verificar que `AndroidAutoControl.enable()` fue llamado
- Verificar que `setMediaLibrary()` incluye URIs
- Verificar logs: "MediaCache loaded"

### No suena el audio
- Verificar que los items tienen campo `uri`
- Verificar logs: "ExoPlayer created with audio focus handling"
- Verificar que no hay otra app usando audio focus

### Notificación sin controles
- Verificar que `VideoPlaybackService` está registrado en manifest
- Verificar logs: "Player registered with VideoPlaybackService"

---

## 📝 Notas Importantes

1. **Opt-in total** - Solo se activa si la app lo habilita
2. **Sin breaking changes** - No afecta código existente
3. **Reproducción nativa** - No requiere React Native activo
4. **Testing exhaustivo** - Verificado en múltiples escenarios

---

## 🔗 Enlaces Útiles

- [Android Auto Developer Guide](https://developer.android.com/training/cars/media)
- [Media3 Documentation](https://developer.android.com/guide/topics/media/media3)
- [ExoPlayer Guide](https://developer.android.com/guide/topics/media/exoplayer)

---

**¿Preguntas?** Consulta los documentos específicos o revisa el código de ejemplo en la app de prueba.
