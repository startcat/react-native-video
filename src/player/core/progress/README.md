# Progress Management System

Sistema unificado de gestión de progreso para contenido VOD y DVR/Live en react-native-video.

## 📋 Índice

- [Introducción](#introducción)
- [Arquitectura](#arquitectura)
- [Componentes](#componentes)
- [Guías de Uso](#guías-de-uso)
- [Documentación Técnica](#documentación-técnica)
- [Migración](#migración)

## 🎯 Introducción

El **Progress Management System** proporciona una solución completa para gestionar el progreso de reproducción tanto en contenido **VOD** (Video on Demand) como en **DVR/Live** (streaming en directo con ventana DVR).

### Características Principales

- ✅ **Gestión Unificada**: API única para VOD y DVR
- ✅ **Detección Automática**: Identifica automáticamente el tipo de contenido
- ✅ **DVR Completo**: Soporte para ventanas DVR, EPG y múltiples modos de reproducción
- ✅ **Manejo de Errores**: Integración con sistema PlayerError
- ✅ **Type-Safe**: TypeScript con tipos completos
- ✅ **Callbacks**: Sistema de eventos para cambios de estado

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────┐
│           ProgressManagerUnified                    │
│         (Fachada Unificada)                         │
└─────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│ VODProgressMgr   │  │ DVRProgressMgr   │
│ (Contenido VOD)  │  │ (Live/DVR)       │
└──────────────────┘  └──────────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
        ┌─────────────────────┐
        │ BaseProgressManager │
        │ (Funcionalidad Base)│
        └─────────────────────┘
```

### Flujo de Datos

```
Player/Cast → ProgressManagerUnified → VOD/DVR Manager → Callbacks → UI
```

## 📦 Componentes

### 1. **ProgressManagerUnified**
Fachada que proporciona una API unificada para gestionar progreso de VOD y DVR.

**Responsabilidades:**
- Delegación automática al manager apropiado
- Detección de tipo de contenido
- Transiciones limpias entre VOD y Live
- Manejo centralizado de errores

📖 [Documentación Completa](./docs/ProgressManagerUnified.md)  
📋 [Especificación](./instructions/ProgressManagerUnified.md)

### 2. **VODProgressManagerClass**
Manager especializado para contenido VOD (videos bajo demanda).

**Responsabilidades:**
- Tracking de progreso lineal
- Cálculo de valores de slider
- Validación de seeks
- Gestión de estado de reproducción

📖 [Documentación](./docs/VODProgressManager.md)

### 3. **DVRProgressManagerClass**
Manager especializado para contenido Live/DVR con ventana temporal.

**Responsabilidades:**
- Gestión de ventana DVR dinámica
- Integración con EPG (Electronic Program Guide)
- Múltiples modos de reproducción (WINDOW, PROGRAM, PLAYLIST)
- Cálculo de live edge y offsets temporales
- Gestión de pausas en directo

📖 [Documentación](./docs/DVRProgressManager.md)  
📋 [Reglas Fundamentales](./instructions/rules.md)

### 4. **BaseProgressManager**
Clase base abstracta con funcionalidad común.

**Responsabilidades:**
- Estado común del reproductor
- Sistema de logging
- Callbacks base
- Métodos de seeking comunes

## 📚 Guías de Uso

### Inicio Rápido

```typescript
import { ProgressManagerUnified } from '@player/core/progress';

// 1. Crear instancia
const progressManager = new ProgressManagerUnified();

// 2. Inicializar con configuración
progressManager.initialize({
  vod: {
    onProgressUpdate: (data) => console.log('VOD progress:', data),
  },
  dvr: {
    onModeChange: (data) => console.log('DVR mode:', data.playbackType),
    onProgramChange: (data) => console.log('Program:', data.currentProgram),
    onProgressUpdate: (data) => console.log('DVR progress:', data),
  },
  logger: myLogger,
  initialContentType: 'vod',
});

// 3. Actualizar con datos del player
await progressManager.updatePlayerData({
  currentTime: 120,
  duration: 3600,
  isPaused: false,
  isBuffering: false,
});

// 4. Obtener valores para UI
const sliderValues = progressManager.getSliderValues();
```

📖 **Guías Detalladas:**
- [Guía de Uso General](./docs/Usage.md)
- [Integración con VOD](./docs/VODIntegration.md)
- [Integración con DVR](./docs/DVRIntegration.md)
- [Manejo de Errores](./docs/ErrorHandling.md)

## 📖 Documentación Técnica

### Para Desarrolladores

- 📋 [Reglas Fundamentales DVR](./instructions/rules.md) - Invariantes y reglas críticas
- 📋 [Especificación ProgressManagerUnified](./instructions/ProgressManagerUnified.md) - Diseño detallado
- 📋 [Contexto del Sistema](./instructions/context.md) - Contexto y decisiones de diseño
- 📋 [Manejo de Errores](./instructions/Error_Handling.md) - Sistema de errores PlayerError

### Documentación de Usuario

- 📖 [Guía de Uso](./docs/Usage.md) - Cómo usar el sistema
- 📖 [API Reference](./docs/API.md) - Referencia completa de la API
- 📖 [Ejemplos](./docs/Examples.md) - Ejemplos de uso común
- 📖 [Troubleshooting](./docs/Troubleshooting.md) - Solución de problemas

### Tipos TypeScript

```typescript
// Tipos principales exportados
export {
  // Managers
  ProgressManagerUnified,
  VODProgressManagerClass,
  DVRProgressManagerClass,
  BaseProgressManager,
  
  // Tipos
  ProgressManagerUnifiedConfig,
  ProgressManagerUnifiedPlayerData,
  ProgressManagerUnifiedContentLoadData,
  IProgressManagerUnified,
  
  // Enums
  DVR_PLAYBACK_TYPE,
  
  // Interfaces
  SliderValues,
  SeekableRange,
  ModeChangeData,
  ProgramChangeData,
  EPGErrorData,
};
```

## 🔄 Migración

### Desde Sistema Anterior

Si estás migrando desde el sistema anterior de progress managers:

1. **Reemplazar imports**
   ```typescript
   // ANTES
   import { DVRProgressManager } from './old-path';
   
   // DESPUÉS
   import { ProgressManagerUnified } from '@player/core/progress';
   ```

2. **Usar API unificada**
   ```typescript
   // ANTES: Gestión manual de dos managers
   if (isLive) {
     dvrManager.updatePlayerData(data);
   } else {
     vodManager.updatePlayerData(data);
   }
   
   // DESPUÉS: Delegación automática
   progressManager.updatePlayerData(data);
   ```

3. **Actualizar callbacks**
   ```typescript
   // Configurar todos los callbacks en initialize()
   progressManager.initialize({
     vod: { onProgressUpdate: handleVODProgress },
     dvr: { 
       onProgressUpdate: handleDVRProgress,
       onModeChange: handleModeChange,
       onProgramChange: handleProgramChange,
     }
   });
   ```

📖 [Guía de Migración Completa](./docs/Migration.md)

## 🧪 Testing

```typescript
import { ProgressManagerUnified } from '@player/core/progress';

describe('ProgressManagerUnified', () => {
  it('should detect VOD content', () => {
    const manager = new ProgressManagerUnified();
    manager.initialize({ initialContentType: 'vod' });
    
    manager.onContentLoaded({
      duration: 3600,
      isLive: false,
    });
    
    expect(manager.isLiveContent()).toBe(false);
  });
});
```

📖 [Guía de Testing](./docs/Testing.md)

## 🐛 Troubleshooting

### Problemas Comunes

**Error: Manager not initialized**
```typescript
// Solución: Llamar initialize() antes de usar
progressManager.initialize(config);
```

**Error: Invalid seek time**
```typescript
// Solución: Validar tiempo antes de seek
const validTime = progressManager.validateSeekTime(requestedTime);
```

**DVR no actualiza correctamente**
```typescript
// Solución: Asegurar que seekableRange se proporciona
progressManager.updatePlayerData({
  currentTime: time,
  seekableRange: { start: 0, end: dvrWindow },
});
```

📖 [Troubleshooting Completo](./docs/Troubleshooting.md)

## 📊 Estado del Proyecto

### ✅ Completado

- ✅ ProgressManagerUnified implementado
- ✅ Sistema de tipos completo
- ✅ Integración con PlayerError
- ✅ Documentación técnica
- ✅ Especificaciones detalladas

### 🚧 En Progreso

- 🚧 Guías de usuario en `/docs`
- 🚧 Ejemplos de integración
- 🚧 Tests unitarios completos

### 📝 Planificado

- 📝 Migración de BaseProgressManager a PlayerError
- 📝 Migración de VODProgressManager a PlayerError
- 📝 Migración de DVRProgressManager a PlayerError
- 📝 Optimizaciones de rendimiento

## 🤝 Contribuir

Para contribuir al sistema de progreso:

1. Lee las [Reglas Fundamentales](./instructions/rules.md)
2. Revisa la [Especificación](./instructions/ProgressManagerUnified.md)
3. Sigue el sistema de [Manejo de Errores](./instructions/Error_Handling.md)
4. Añade tests para nuevas funcionalidades
5. Actualiza la documentación

## 📄 Licencia

Este código es parte de react-native-video y está sujeto a su licencia.

---

**Versión**: 2.0  
**Última actualización**: Octubre 2025  
**Mantenedores**: react-native-video team
