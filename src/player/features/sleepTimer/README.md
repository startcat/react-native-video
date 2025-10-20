# Sleep Timer

El Sleep Timer es una funcionalidad nativa que permite pausar automáticamente la reproducción del player después de un tiempo determinado o cuando el episodio actual termina.

## Características

- ✅ **Implementación nativa**: Funciona en iOS (Swift) y Android (Java)
- ✅ **Módulo global**: No requiere referencias al player, funciona de forma centralizada
- ✅ **Dos modos de operación**:
  - **Timer por tiempo**: Pausa después de X segundos
  - **Finalizar episodio actual**: Pausa cuando el media termina (evita auto-advance)
- ✅ **Reinicio automático**: Al reactivar el timer, se reinicia la cuenta atrás
- ✅ **Pausa automática**: Cuando el timer llega a 0 o el media termina, pausa la reproducción
- ✅ **Funciona en background**: El timer continúa ejecutándose aunque la app esté en segundo plano
- ✅ **Detección nativa**: El modo finish-current detecta el fin del media directamente en código nativo

## Uso

### Importar el módulo

```typescript
import { SleepTimerControl } from 'react-native-video';
```

### Activar el sleep timer por tiempo

```typescript
// Activar timer para 30 minutos (1800 segundos)
SleepTimerControl.activateSleepTimer(1800);

// Si ya existe un timer activo, se reinicia con el nuevo valor
SleepTimerControl.activateSleepTimer(3600); // 1 hora
```

### Activar el modo "Finalizar episodio actual"

```typescript
// Pausará cuando el episodio actual termine
// Evita el auto-advance al siguiente item de la playlist
SleepTimerControl.activateFinishCurrentTimer();
```

### Cancelar el sleep timer

```typescript
// Cancela cualquier modo activo (tiempo o finish-current)
SleepTimerControl.cancelSleepTimer();
```

### Consultar el estado del timer

```typescript
const status = await SleepTimerControl.getSleepTimerStatus();

console.log(status.isActive);              // true/false
console.log(status.remainingSeconds);      // segundos restantes (-1 en modo finish-current)
console.log(status.isFinishCurrentMode);   // true si está en modo finish-current
```

## Ejemplo completo

```typescript
import React, { useState, useEffect } from 'react';
import { View, Button, Text } from 'react-native';
import { SleepTimerControl } from 'react-native-video';

function MyPlayer() {
  const [timerStatus, setTimerStatus] = useState({
    isActive: false,
    remainingSeconds: 0,
    isFinishCurrentMode: false
  });

  // Actualizar estado cada segundo
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await SleepTimerControl.getSleepTimerStatus();
      setTimerStatus(status);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleActivate30Min = () => {
    SleepTimerControl.activateSleepTimer(1800); // 30 minutos
  };

  const handleActivateFinishCurrent = () => {
    SleepTimerControl.activateFinishCurrentTimer();
  };

  const handleCancel = () => {
    SleepTimerControl.cancelSleepTimer();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View>
      {/* Botones de control */}
      <Button title="30 minutos" onPress={handleActivate30Min} />
      <Button title="Al finalizar episodio" onPress={handleActivateFinishCurrent} />
      <Button title="Cancelar" onPress={handleCancel} />

      {/* Estado del timer */}
      {timerStatus.isActive && (
        <View>
          {timerStatus.isFinishCurrentMode ? (
            <Text>⏸️ Pausará al finalizar episodio actual</Text>
          ) : (
            <Text>⏰ Pausará en: {formatTime(timerStatus.remainingSeconds)}</Text>
          )}
        </View>
      )}
    </View>
  );
}
```

## Integración en los flavours

El sleep timer ya está integrado en el `AudioFlavour` y puede ser controlado mediante el `CONTROL_ACTION.SLEEP`:

```typescript
// En el componente que usa AudioFlavour
<AudioFlavour
  events={{
    onPress: (action, value) => {
      if (action === CONTROL_ACTION.SLEEP) {
        // El AudioFlavour maneja automáticamente el sleep timer
      }
    }
  }}
/>
```

### Obtener el estado del Sleep Timer desde fuera de la librería

El `AudioFlavour` incluye automáticamente el estado del sleep timer en el evento `audioPlayerProgress`:

```typescript
import { EventRegister } from 'react-native-event-listeners';

// En tu componente que consume el AudioFlavour
useEffect(() => {
  const listener = EventRegister.addEventListener(
    'audioPlayerProgress',
    (data: AudioControlsProps) => {
      // El estado del sleep timer está disponible en data.sleepTimer
      if (data.sleepTimer?.isActive) {
        if (data.sleepTimer.isFinishCurrentMode) {
          console.log('Sleep timer: Pausará al finalizar episodio');
        } else {
          const minutes = Math.floor(data.sleepTimer.remainingSeconds / 60);
          const seconds = data.sleepTimer.remainingSeconds % 60;
          console.log(`Sleep timer activo: ${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      } else {
        console.log('Sleep timer inactivo');
      }
    }
  );

  return () => {
    EventRegister.removeEventListener(listener);
  };
}, []);
```

### Ejemplo completo con UI

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import { AudioFlavour, CONTROL_ACTION } from 'react-native-video';

function MyAudioPlayer() {
  const [sleepTimerStatus, setSleepTimerStatus] = useState({
    isActive: false,
    remainingSeconds: 0
  });

  useEffect(() => {
    const listener = EventRegister.addEventListener(
      'audioPlayerProgress',
      (data) => {
        if (data.sleepTimer) {
          setSleepTimerStatus(data.sleepTimer);
        }
      }
    );

    return () => EventRegister.removeEventListener(listener);
  }, []);

  const handleActivateSleepTimer = (minutes: number) => {
    // Activar mediante el evento onPress del AudioFlavour
    // Esto se haría desde los controles personalizados
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View>
      <AudioFlavour
        playlistItem={/* tu item */}
        events={{
          onPress: (action, value) => {
            // Manejar acciones
          }
        }}
      />

      {/* Mostrar estado del sleep timer */}
      {sleepTimerStatus.isActive && (
        <View>
          <Text>Sleep Timer Activo</Text>
          <Text>Tiempo restante: {formatTime(sleepTimerStatus.remainingSeconds)}</Text>
        </View>
      )}
    </View>
  );
}
```

## Comportamiento

### Modo Timer por Tiempo

1. **Al activar**: El timer comienza a contar hacia atrás cada segundo
2. **Al reactivar**: Si ya existe un timer activo, se cancela y se crea uno nuevo con el valor especificado
3. **Al llegar a 0**: El player se pausa automáticamente y el timer se desactiva
4. **Al cancelar**: El timer se detiene inmediatamente y se reinicia el contador

### Modo Finalizar Episodio Actual

1. **Al activar**: El timer entra en modo de espera, monitoreando el fin del media
2. **Detección en foreground**: JavaScript detecta el evento `onEnd` y notifica al módulo nativo
3. **Detección en background**: El player nativo detecta `STATE_ENDED` (Android) o `didPlayToEndTime` (iOS) y pausa directamente
4. **Al finalizar el media**: El player se pausa automáticamente ANTES del auto-advance al siguiente episodio
5. **Al cancelar**: El modo se desactiva y el auto-advance funciona normalmente

## Implementación técnica

### Arquitectura Global

- **Módulo singleton**: `VideoSleepTimerModule` es un módulo nativo global
- **No requiere referencias**: Funciona sin necesidad de `videoRef`
- **Estado compartido**: Un solo timer activo para toda la app
- **Comunicación bidireccional**: JavaScript ↔ Nativo vía eventos

### iOS (Swift)

**Archivo**: `VideoSleepTimerModule.swift`

- **Timer por tiempo**: Usa `Timer.scheduledTimer` con intervalo de 1 segundo
- **Finish-current**: Detecta `handlePlayerItemDidReachEnd` en `RCTVideo.swift`
- **Evento a JS**: Hereda de `RCTEventEmitter` y emite `sleepTimerFinished`
- **Background**: Funciona mediante notificación directa desde el player
- **Singleton**: Instancia compartida para emitir eventos desde métodos estáticos
- **Cleanup**: Se limpia automáticamente en `deinit`

### Android (Java)

**Archivos**: `VideoSleepTimerModule.java`, `ReactExoplayerView.java`

- **Timer por tiempo**: Usa `Handler.postDelayed` con delay de 1000ms
- **Finish-current**: Detecta `Player.STATE_ENDED` en `ReactExoplayerView`
- **Evento a JS**: Usa `DeviceEventManagerModule.RCTDeviceEventEmitter`
- **Background**: Funciona mediante `BroadcastReceiver` que escucha `SLEEP_TIMER_MEDIA_ENDED`
- **Comunicación nativa**: Broadcast desde `ReactExoplayerView` → `VideoSleepTimerModule`
- **Cleanup**: Se limpia automáticamente en `onHostDestroy`

### Flujo de Pausa

1. **Timer/Media termina** → Módulo nativo detecta
2. **Emite evento** `sleepTimerFinished` → JavaScript
3. **AudioFlavour escucha** → `DeviceEventEmitter.addListener`
4. **Ejecuta pausa** → `setPaused(true)`

### Detección de Fin de Media

**Foreground (app activa)**:
```
Player onEnd → AudioFlavour.handleOnEnd() → VideoSleepTimerModule.notifyMediaEnded()
```

**Background (app suspendida)**:

- **Android**: `Player.STATE_ENDED` → Broadcast → BroadcastReceiver → Pausa
- **iOS**: `didPlayToEndTime` → `VideoSleepTimerModule.notifyPlayerEnded()` → Pausa

## Interface TypeScript

```typescript
export interface SleepTimerStatus {
  isActive: boolean;              // Timer activo
  remainingSeconds: number;       // Segundos restantes (-1 en finish-current)
  isFinishCurrentMode: boolean;   // true si está en modo finish-current
}

export class SleepTimerControl {
  static activateSleepTimer(seconds: number): void;
  static activateFinishCurrentTimer(): void;
  static cancelSleepTimer(): void;
  static async getSleepTimerStatus(): Promise<SleepTimerStatus>;
}
```

## Notas

- ✅ **Global**: Un solo timer para toda la app (no por instancia de player)
- ✅ **Sin referencias**: No necesita `videoRef`, funciona de forma centralizada
- ✅ **Background**: Ambos modos funcionan con la app en segundo plano
- ✅ **Evita auto-advance**: El modo finish-current pausa ANTES de avanzar al siguiente episodio
- ✅ **Logs detallados**: Tag `🔔 [SLEEP TIMER]` en iOS y Android para debugging
- ⚠️ **Limitación**: Solo un timer puede estar activo a la vez (por diseño)

## Casos de Uso

### 1. Dormir después de 30 minutos
```typescript
SleepTimerControl.activateSleepTimer(1800);
```

### 2. Terminar episodio actual sin continuar
```typescript
SleepTimerControl.activateFinishCurrentTimer();
// Útil para podcasts o series donde no quieres auto-play
```

### 3. Combinar con playlists
```typescript
// Usuario escucha podcast antes de dormir
// Quiere que termine el episodio actual pero no continúe
SleepTimerControl.activateFinishCurrentTimer();

// El auto-advance se previene automáticamente
```
