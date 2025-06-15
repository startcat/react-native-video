# Continue Watching: Seguimiento del Progreso de Visualización

En este documento se explica la funcionalidad de Continue Watching en el componente Player, que permite hacer seguimiento del progreso de visualización del usuario y reanudar la reproducción desde donde se quedó.

## ¿Qué es Continue Watching?

Continue Watching es una funcionalidad que permite al reproductor hacer seguimiento automático del progreso de visualización del usuario y reportar esta información a un sistema externo para poder reanudar la reproducción desde el punto exacto donde se detuvo en sesiones futuras.

## Props de configuración

### `watchingProgressInterval`

| Prop | Tipo | Requerido | Valor predeterminado | Descripción |
|------|------|-----------|---------------------|-------------|
| `watchingProgressInterval` | number | No | - | Intervalo en milisegundos para reportar el progreso de visualización |

Esta prop define con qué frecuencia el reproductor reportará el progreso actual de visualización. Un valor más bajo proporcionará actualizaciones más frecuentes pero puede impactar el rendimiento, mientras que un valor más alto será más eficiente pero menos preciso.

**Valores recomendados:**
- Para contenido VOD: 5000-10000 ms (5-10 segundos)
- Para contenido en vivo: 2000-5000 ms (2-5 segundos)

### `addContentProgress`

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `addContentProgress` | (currentTime: number, duration: number, id?: number) => void | No | Función callback que recibe el progreso actual de visualización |

Esta función se ejecuta automáticamente según el intervalo definido en `watchingProgressInterval` y recibe la información actual del progreso de reproducción.

#### Parámetros de `addContentProgress`

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `currentTime` | number | Tiempo actual de reproducción en segundos |
| `duration` | number | Duración total del contenido en segundos |
| `id` | number (opcional) | Identificador único del contenido, si se proporcionó en la prop `id` del Player |

## Funcionamiento

El sistema de Continue Watching funciona de la siguiente manera:

1. **Inicio del seguimiento**: Cuando se inicia la reproducción, el Player comienza a hacer seguimiento del progreso si ambas props están configuradas.

2. **Reportes periódicos**: Cada `watchingProgressInterval` milisegundos, el Player ejecuta la función `addContentProgress` con los valores actuales.

3. **Información reportada**: En cada reporte se incluye:
   - Posición actual en segundos
   - Duración total del contenido
   - ID del contenido (si se proporcionó)

4. **Persistencia externa**: La función `addContentProgress` debe implementar la lógica para guardar esta información en el sistema de persistencia elegido (base de datos, API, localStorage, etc.).

## Implementación

### Ejemplo básico

```javascript
const handleContentProgress = (currentTime, duration, id) => {
  // Guardar el progreso en tu sistema de persistencia
  console.log(`Contenido ${id}: ${currentTime}/${duration} segundos`);
  
  // Ejemplo: guardar en localStorage
  localStorage.setItem(`progress_${id}`, JSON.stringify({
    currentTime,
    duration,
    percentage: (currentTime / duration) * 100,
    lastUpdated: new Date().toISOString()
  }));
};

// Uso en el componente Player
<Player
  id={123}
  manifests={manifests}
  watchingProgressInterval={5000} // Reportar cada 5 segundos
  addContentProgress={handleContentProgress}
  {...otrosProps}
/>
```

### Ejemplo con API externa

```javascript
const handleContentProgress = useCallback(async (currentTime, duration, id) => {
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentId: id,
        currentTime,
        duration,
        userId: getCurrentUserId(),
        timestamp: Date.now()
      })
    });
  } catch (error) {
    console.error('Error guardando progreso:', error);
  }
}, []);

<Player
  id={contentId}
  manifests={manifests}
  watchingProgressInterval={10000} // Reportar cada 10 segundos
  addContentProgress={handleContentProgress}
  startPosition={getLastWatchedPosition(contentId)} // Reanudar desde la última posición
  {...otrosProps}
/>
```

## Consideraciones importantes

### Rendimiento

- **Memoización**: Utiliza `useCallback` para la función `addContentProgress` para evitar re-renderizados innecesarios.
- **Intervalo apropiado**: No configures intervalos demasiado cortos que puedan impactar el rendimiento.
- **Manejo de errores**: Implementa manejo de errores en `addContentProgress` para evitar que fallos en la persistencia afecten la reproducción.

### Casos especiales

- **Contenido en vivo**: Para contenido en vivo (`isLive: true`), el progreso se reporta pero generalmente no se utiliza para reanudar reproducción.
- **Contenido offline**: El seguimiento funciona normalmente en modo offline, pero debes considerar cómo sincronizar los datos cuando se recupere la conectividad.
- **Múltiples sesiones**: Si `multiSession` es `true`, asegúrate de que tu lógica de persistencia maneje correctamente múltiples sesiones del mismo contenido.

### Privacidad y datos

- Considera las implicaciones de privacidad al hacer seguimiento del progreso de visualización.
- Implementa políticas de retención de datos apropiadas.
- Permite a los usuarios controlar o desactivar el seguimiento si es necesario.

## Integración con startPosition

La funcionalidad Continue Watching se complementa perfectamente con la prop `startPosition` del Player:

```javascript
// Al cargar un contenido, recuperar la última posición guardada
const lastPosition = await getLastWatchedPosition(contentId);

<Player
  id={contentId}
  startPosition={lastPosition} // Reanudar desde donde se quedó
  watchingProgressInterval={5000}
  addContentProgress={handleContentProgress} // Seguir guardando el progreso
  {...otrosProps}
/>
```

Esta combinación permite una experiencia fluida de "continuar viendo" donde el usuario puede reanudar exactamente donde dejó el contenido en cualquier momento.