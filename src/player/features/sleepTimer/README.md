# Sleep Timer

El Sleep Timer es una funcionalidad nativa que permite pausar automáticamente la reproducción del player después de un tiempo determinado.

## Características

- ✅ **Implementación nativa**: Funciona en iOS (Swift) y Android (Java)
- ✅ **Reinicio automático**: Al reactivar el timer, se reinicia la cuenta atrás
- ✅ **Pausa automática**: Cuando el timer llega a 0, pausa la reproducción
- ✅ **Funciona en background**: El timer continúa ejecutándose aunque la app esté en segundo plano
- ✅ **Compatible con todos los modos**: Funciona en modo standalone y coordinado

## Uso

### Importar el módulo

```typescript
import { SleepTimerControl } from 'react-native-video';
```

### Activar el sleep timer

```typescript
// Activar timer para 30 minutos (1800 segundos)
SleepTimerControl.activateSleepTimer(videoRef, 1800);

// Si ya existe un timer activo, se reinicia con el nuevo valor
SleepTimerControl.activateSleepTimer(videoRef, 3600); // 1 hora
```

### Cancelar el sleep timer

```typescript
SleepTimerControl.cancelSleepTimer(videoRef);
```

### Consultar el estado del timer

```typescript
const status = await SleepTimerControl.getSleepTimerStatus(videoRef);

console.log(status.isActive);          // true/false
console.log(status.remainingSeconds);  // segundos restantes
```

## Ejemplo completo

```typescript
import React, { useRef } from 'react';
import Video, { SleepTimerControl } from 'react-native-video';

function MyPlayer() {
  const videoRef = useRef(null);

  const handleActivateSleepTimer = () => {
    // Activar timer para 30 minutos
    SleepTimerControl.activateSleepTimer(videoRef.current, 1800);
  };

  const handleCancelSleepTimer = () => {
    SleepTimerControl.cancelSleepTimer(videoRef.current);
  };

  const handleCheckStatus = async () => {
    const status = await SleepTimerControl.getSleepTimerStatus(videoRef.current);
    if (status.isActive) {
      console.log(`Timer activo: ${status.remainingSeconds} segundos restantes`);
    } else {
      console.log('Timer inactivo');
    }
  };

  return (
    <Video
      ref={videoRef}
      source={{ uri: 'https://example.com/video.m3u8' }}
      // ... otras props
    />
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

## Comportamiento

1. **Al activar**: El timer comienza a contar hacia atrás cada segundo
2. **Al reactivar**: Si ya existe un timer activo, se cancela y se crea uno nuevo con el valor especificado
3. **Al llegar a 0**: El player se pausa automáticamente y el timer se desactiva
4. **Al cancelar**: El timer se detiene inmediatamente y se reinicia el contador

## Implementación técnica

### iOS (Swift)
- Usa `Timer.scheduledTimer` para el countdown
- Llama a `setPaused(true)` cuando llega a 0
- Se limpia automáticamente en el `deinit` del player

### Android (Java)
- Usa `Handler` con `postDelayed` para el countdown
- Llama a `setPausedModifier(true)` cuando llega a 0
- Se limpia automáticamente en `cleanUpResources`

## Notas

- El timer es independiente para cada instancia del player
- No afecta al estado de reproducción hasta que llega a 0
- Los logs de debug están disponibles con el tag `[SleepTimer]` (TypeScript) y `[RCTVideo]` (iOS) / `ReactExoplayerView` (Android)
