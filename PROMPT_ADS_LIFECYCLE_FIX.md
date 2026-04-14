# Prompt: Corrección del Ciclo de Vida de Anuncios (IMA SDK)

## Contexto

Este módulo `react-native-video` integra Google IMA SDK para reproducir anuncios (pre-roll, mid-roll, post-roll) tanto en iOS como en Android. Actualmente hay tres problemas críticos relacionados con el ciclo de vida de los anuncios:

1. **App en segundo plano durante ads**: Cuando la app pasa a background mientras se reproduce un anuncio y el usuario cierra la notificación nativa de reproducción, al volver a la app se queda en pantalla negra. En iOS, la app se cuelga completamente.

2. **Controles no responden después de los anuncios**: Una vez terminan los anuncios (ej: 2 pre-rolls), el vídeo empieza pero los controles del player no responden. Al tocar la pantalla aparecen visualmente, pero no registran los eventos de toque, como si hubiera una capa invisible absorbiendo los eventos.

---

## Archivos a Revisar y Modificar

### iOS Nativo

**`ios/Video/RCTVideo.swift`**
- Líneas ~289-322: Métodos del ciclo de vida de la app (`applicationWillResignActive`, `applicationDidEnterBackground`, `applicationDidBecomeActive`, `applicationWillEnterForeground`)
- Líneas ~878-907: Método `setPaused` que maneja pausa/resume del IMA ads manager
- Propiedad `_adPlaying` (línea ~106): Estado que indica si hay un anuncio reproduciéndose

**`ios/Video/Features/RCTIMAAdsManager.swift`**
- Líneas ~165-175: Métodos `adsManagerDidRequestContentPause` y `adsManagerDidRequestContentResume`
- Líneas ~100-139: Método `adsManager(_:didReceive:)` que emite eventos de ads a React Native
- Método `getAdsManager()`: Acceso al `IMAAdsManager` para pausar/resumir

### Android Nativo

**`android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`**
- Líneas ~394-416: Métodos del ciclo de vida (`onHostResume`, `onHostPause`, `onHostDestroy`)
- Líneas ~366-368: Método `isPlayingAd()` que verifica si hay un anuncio reproduciéndose
- Líneas ~309-313: En `updateProgress()`, se ocultan los controles durante ads
- Líneas ~488-492: Click listener que ignora toques durante ads
- Líneas ~888-894: Creación del `ImaAdsLoader`
- Líneas ~926-928: Asociación del `adsLoader` con el player
- Líneas ~1480-1502: Método `releasePlayer()` que libera el `adsLoader`
- Líneas ~2723-2737: Método `onAdEvent()` que emite eventos de ads

### React Native (TypeScript)

**`src/player/flavours/normal/index.tsx`**
- Líneas ~1483-1504: Función `handleOnReceiveAdEvent` que actualiza el estado `isPlayingAd`
- Líneas ~1712-1752: Renderizado condicional del `<Overlay>` basado en `!isPlayingAd`

---

## Problema 1: App en Segundo Plano Durante Ads

### Causa Raíz

Cuando la app va a background durante un anuncio:
- **iOS**: El `_playerLayer` se desconecta (`_playerLayer?.player = nil`) pero el IMA SDK no se pausa. Al volver, el SDK intenta renderizar sobre un container inválido.
- **Android**: El `ImaAdsLoader` no recibe notificación del cambio de estado de la app. El `onHostPause` pausa el ExoPlayer pero no el ads loader.

### Solución Requerida

#### iOS (`RCTVideo.swift`)

Modificar los métodos del ciclo de vida para pausar/resumir el IMA SDK:

```swift
@objc
func applicationWillResignActive(notification _: NSNotification!) {
    let isExternalPlaybackActive = _player?.isExternalPlaybackActive ?? false
    if _playInBackground || _playWhenInactive || !_isPlaying || isExternalPlaybackActive { return }

    #if RNUSE_GOOGLE_IMA
    // Pausar el IMA SDK si hay un anuncio reproduciéndose
    if _adPlaying {
        _imaAdsManager.getAdsManager()?.pause()
    }
    #endif

    _player?.pause()
    _player?.rate = 0.0
}

@objc
func applicationDidBecomeActive(notification _: NSNotification!) {
    let isExternalPlaybackActive = _player?.isExternalPlaybackActive ?? false
    if _playInBackground || _playWhenInactive || !_isPlaying || isExternalPlaybackActive { return }

    #if RNUSE_GOOGLE_IMA
    // Resumir el IMA SDK si había un anuncio pausado y el player no está en pausa
    if _adPlaying && !_paused {
        _imaAdsManager.getAdsManager()?.resume()
    }
    #endif

    if !_adPlaying {
        _player?.play()
        _player?.rate = _rate
    }
}

@objc
func applicationDidEnterBackground(notification _: NSNotification!) {
    let isExternalPlaybackActive = _player?.isExternalPlaybackActive ?? false
    
    // Si playInBackground está activo, mantener el audio del anuncio
    if _playInBackground {
        // Solo desconectar el video layer, mantener el audio
        if !isExternalPlaybackActive {
            _playerLayer?.player = nil
            _playerViewController?.player = nil
        }
        return
    }
    
    if isExternalPlaybackActive { return }
    
    _playerLayer?.player = nil
    _playerViewController?.player = nil
}

@objc
func applicationWillEnterForeground(notification _: NSNotification!) {
    self.applyModifiers()
    _playerLayer?.player = _player
    _playerViewController?.player = _player
    
    #if RNUSE_GOOGLE_IMA
    // Si había un anuncio, el IMA SDK necesita reconectar su display container
    if _adPlaying {
        // El IMA SDK debería reconectar automáticamente, pero verificar el estado
        _imaAdsManager.getAdsManager()?.resume()
    }
    #endif
}
```

#### Android (`ReactExoplayerView.java`)

Modificar los métodos del ciclo de vida:

```java
@Override
public void onHostPause() {
    isInBackground = true;
    if (playInBackground) {
        return;
    }
    
    // Pausar el IMA ads loader si hay un anuncio reproduciéndose
    if (isPlayingAd() && adsLoader != null) {
        // ImaAdsLoader no tiene método pause() directo, pero podemos pausar el player
        // El IMA SDK detectará que el player está pausado
    }
    
    setPlayWhenReady(false);
}

@Override
public void onHostResume() {
    if (!playInBackground || !isInBackground) {
        setPlayWhenReady(!isPaused);
    }
    isInBackground = false;
}
```

**Nota**: En Android, el `ImaAdsLoader` de ExoPlayer maneja mejor el ciclo de vida porque está integrado con el player. El problema principal es asegurar que `playInBackground` se respete durante los ads.

---

## Problema 2: Controles No Responden Después de los Anuncios

### Causa Raíz

En `src/player/flavours/normal/index.tsx`, el estado `isPlayingAd` controla si se renderiza el `<Overlay>`:

```tsx
{!isPlayingAd && !tudumRef.current?.isPlaying ? (
    <Overlay ... />
) : null}
```

El problema es que `isPlayingAd` se actualiza con eventos `STARTED` y `COMPLETED` individuales:

```tsx
if (e.event === "STARTED") {
    setIsPlayingAd(true);
} else if (e.event === "COMPLETED" || e.event === "ALL_ADS_COMPLETED" || ...) {
    setIsPlayingAd(false);
}
```

Cuando hay múltiples ads en un pod (ej: 2 pre-rolls), el flujo es:
1. `STARTED` (ad 1) → `isPlayingAd = true`
2. `COMPLETED` (ad 1) → `isPlayingAd = false` ❌ (incorrecto, aún hay más ads)
3. `STARTED` (ad 2) → `isPlayingAd = true`
4. `COMPLETED` (ad 2) → `isPlayingAd = false`
5. `ALL_ADS_COMPLETED` → (ya es false)

Si hay un race condition o el evento `STARTED` del segundo ad no llega a tiempo, el Overlay puede quedar en un estado inconsistente.

Además, en iOS el `IMAAdDisplayContainer` puede quedar como una capa invisible sobre el video bloqueando los toques.

### Solución Requerida

#### React Native (`src/player/flavours/normal/index.tsx`)

Cambiar la lógica para usar `AD_BREAK_STARTED` y `AD_BREAK_ENDED`:

```tsx
const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
    currentLogger.current?.debug(`[ADS] onReceiveAdEvent: ${e.event}`, {
        event: e.event,
        data: e.data,
    });

    // Usar AD_BREAK para manejar pods de múltiples ads correctamente
    if (e.event === "AD_BREAK_STARTED") {
        currentLogger.current?.info("[ADS] Ad break started");
        setIsPlayingAd(true);
        onAdStarted(e);
    } else if (e.event === "AD_BREAK_ENDED" || e.event === "ALL_ADS_COMPLETED") {
        currentLogger.current?.info(`[ADS] Ad break finished: ${e.event}`);
        setIsPlayingAd(false);
    } else if (e.event === "ERROR") {
        currentLogger.current?.error("[ADS] Ad error", { data: e.data });
        // En caso de error, asegurar que los controles vuelvan
        setIsPlayingAd(false);
    }
    
    // Mantener callbacks para eventos individuales si es necesario
    if (e.event === "STARTED") {
        onAdStarted(e);
    }
};
```

**Alternativa con fallback de seguridad**:

```tsx
const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
    // ... logging ...

    if (e.event === "AD_BREAK_STARTED" || e.event === "STARTED") {
        setIsPlayingAd(true);
        if (e.event === "STARTED") {
            onAdStarted(e);
        }
    } else if (
        e.event === "AD_BREAK_ENDED" ||
        e.event === "ALL_ADS_COMPLETED" ||
        e.event === "CONTENT_RESUME_REQUESTED"
    ) {
        setIsPlayingAd(false);
    } else if (e.event === "ERROR") {
        setIsPlayingAd(false);
    }
};

// Añadir timeout de seguridad
useEffect(() => {
    if (isPlayingAd) {
        const safetyTimeout = setTimeout(() => {
            console.warn('[ADS] Safety timeout triggered - forcing controls to show');
            setIsPlayingAd(false);
        }, 180000); // 3 minutos máximo para un ad break
        
        return () => clearTimeout(safetyTimeout);
    }
}, [isPlayingAd]);
```

#### iOS (`RCTIMAAdsManager.swift`)

Asegurar que se emiten los eventos `AD_BREAK_STARTED` y `AD_BREAK_ENDED`. Verificar en el método `convertEventToString`:

```swift
private func convertEventToString(event: IMAAdEventType) -> String {
    switch event {
    case .AD_BREAK_STARTED:
        return "AD_BREAK_STARTED"
    case .AD_BREAK_ENDED:
        return "AD_BREAK_ENDED"
    case .ALL_ADS_COMPLETED:
        return "ALL_ADS_COMPLETED"
    // ... otros casos
    }
}
```

#### Android (`ReactExoplayerView.java`)

Verificar que el `onAdEvent` emite los eventos correctos:

```java
@Override
public void onAdEvent(AdEvent adEvent) {
    DebugLog.d(TAG, "Ad Event: " + adEvent.getType().name());
    // El nombre del evento ya viene en el formato correcto (AD_BREAK_STARTED, etc.)
    if (adEvent.getAdData() != null) {
        eventEmitter.receiveAdEvent(adEvent.getType().name(), adEvent.getAdData());
    } else {
        eventEmitter.receiveAdEvent(adEvent.getType().name());
    }
}
```

---

## Verificación

Después de implementar los cambios, verificar:

1. **Test Background durante Pre-roll**:
   - Iniciar video con pre-roll
   - Enviar app a background durante el anuncio
   - Cerrar notificación de reproducción
   - Volver a la app
   - ✅ El video debe continuar o mostrar estado consistente (no pantalla negra)

2. **Test Background con playInBackground=true**:
   - Configurar player con `playInBackground: true`
   - Iniciar video con pre-roll
   - Enviar app a background
   - ✅ El audio del anuncio debe continuar
   - Volver a la app
   - ✅ El video debe sincronizarse correctamente

3. **Test Controles después de múltiples ads**:
   - Configurar VMAP con 2+ pre-rolls
   - Esperar a que terminen todos los anuncios
   - ✅ Los controles deben responder inmediatamente
   - Tocar pantalla para mostrar/ocultar controles
   - ✅ Play/pause debe funcionar

4. **Test Error en ads**:
   - Simular error en ad (URL inválida)
   - ✅ Los controles deben aparecer y funcionar
   - ✅ El contenido principal debe reproducirse

---

## Notas Adicionales

- El IMA SDK en iOS usa `IMAAVPlayerContentPlayhead` para trackear la posición del contenido
- En Android, ExoPlayer integra IMA via `ImaAdsLoader` que es más robusto con el ciclo de vida
- Los eventos de ads se propagan via el bridge de React Native (`onReceiveAdEvent`)
- La propiedad `playInBackground` debe respetarse tanto para contenido como para anuncios
