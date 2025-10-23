# Error Handling - Manejo de Errores en Progress Managers

## 📋 Propósito

Este documento especifica cómo los **Progress Managers** (Base, VOD, DVR y Unified) deben manejar errores usando el sistema centralizado `PlayerError`.

## ⚠️ Requisito Crítico

**TODOS** los Progress Managers **DEBEN** usar el sistema de errores `PlayerError` definido en `src/player/core/errors/instructions/ErrorSystem.md`.

## 🎯 Managers Afectados

1. **BaseProgressManager** - Manager base con funcionalidad común
2. **VODProgressManagerClass** - Manager para contenido VOD
3. **DVRProgressManagerClass** - Manager para contenido DVR/Live
4. **ProgressManagerUnified** - Fachada unificada ✅ (Implementado)

## 📦 Códigos de Error Específicos

### Errores de Progress Managers

```typescript
// Definidos en: src/player/core/errors/definitions/player-errors.ts

PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED
  → Manager no inicializado antes de uso
  
PLAYER_PROGRESS_MANAGER_DISPOSED
  → Operación en manager disposed
  
PLAYER_PROGRESS_INVALID_CONTENT_TYPE
  → Tipo de contenido inválido
  
PLAYER_PROGRESS_INVALID_SEEK_TIME
  → Tiempo de seek fuera de rango
  
PLAYER_PROGRESS_UPDATE_FAILED
  → Fallo al actualizar datos del player
  
PLAYER_PROGRESS_INVALID_STATE
  → Estado inválido para la operación
  
PLAYER_PROGRESS_MANAGER_CREATION_FAILED
  → Fallo al crear instancia del manager
```

## ✅ Reglas de Implementación

### 1. Importar PlayerError

```typescript
import { PlayerError } from '../errors';
// o desde el core:
import { PlayerError } from '../../core/errors';
```

### 2. Lanzar PlayerError en lugar de Error

```typescript
// ❌ MAL
throw new Error('Manager not initialized');

// ✅ BIEN
throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED');
```

### 3. Incluir Contexto Relevante

```typescript
// ❌ MAL
throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME');

// ✅ BIEN
throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME', {
  requestedTime: time,
  seekableRange: this._seekableRange,
  contentType: this.contentType,
  currentTime: this._currentTime
});
```

### 4. Capturar y Convertir Errores Genéricos

```typescript
try {
  await this.dvrManager.updatePlayerData(data);
} catch (error) {
  // Si ya es PlayerError, propagar
  if (error instanceof PlayerError) {
    throw error;
  }
  
  // Convertir a PlayerError
  throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
    originalError: error,
    contentType: this.contentType,
    data
  });
}
```

### 5. NO Usar console.error para Errores

```typescript
// ❌ MAL
console.error('Failed to update player data');
return;

// ✅ BIEN
throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', { data });
```

## 📝 Ejemplos de Uso

### Ejemplo 1: Validación de Inicialización

```typescript
// En ProgressManagerUnified
private ensureInitialized(): void {
  if (!this.isInitialized) {
    throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED', {
      operation: 'ensureInitialized',
      message: 'Call initialize() first'
    });
  }
}
```

### Ejemplo 2: Validación de Estado

```typescript
// En BaseProgressManager
protected validateState(): void {
  if (!this._hasReceivedPlayerData) {
    throw new PlayerError('PLAYER_PROGRESS_INVALID_STATE', {
      reason: 'No player data received yet',
      hasReceivedPlayerData: this._hasReceivedPlayerData,
      isInitialized: this._isInitialized
    });
  }
}
```

### Ejemplo 3: Validación de Seek

```typescript
// En DVRProgressManager
validateSeekTime(time: number): number {
  if (time < this._seekableRange.start || time > this._seekableRange.end) {
    throw new PlayerError('PLAYER_PROGRESS_INVALID_SEEK_TIME', {
      requestedTime: time,
      seekableRange: this._seekableRange,
      minimumAllowed: this._seekableRange.start,
      maximumAllowed: this._seekableRange.end
    });
  }
  return time;
}
```

### Ejemplo 4: Error en Creación de Manager

```typescript
// En ProgressManagerUnified
initialize(config: ProgressManagerUnifiedConfig): void {
  try {
    this.vodManager = new VODProgressManagerClass(config.vod);
    this.dvrManager = new DVRProgressManagerClass(config.dvr);
  } catch (error) {
    throw new PlayerError('PLAYER_PROGRESS_MANAGER_CREATION_FAILED', {
      originalError: error,
      config
    });
  }
}
```

### Ejemplo 5: Error en Actualización

```typescript
// En DVRProgressManager
async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
  try {
    this._validatePlayerData(data);
    this._updateBasicPlayerData(data);
    this._updateDVRSpecificData(data);
    await this._checkProgramChange();
  } catch (error) {
    if (error instanceof PlayerError) {
      throw error;
    }
    throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
      originalError: error,
      data,
      currentState: this.getStats()
    });
  }
}
```

## 🔍 Checklist de Migración

Para migrar un Progress Manager existente a usar PlayerError:

- [ ] Importar `PlayerError` desde `../errors` o `../../core/errors`
- [ ] Reemplazar todos los `throw new Error()` con `throw new PlayerError()`
- [ ] Reemplazar todos los `console.error()` con `throw new PlayerError()`
- [ ] Agregar contexto relevante a cada error lanzado
- [ ] Capturar errores genéricos y convertirlos a PlayerError
- [ ] Propagar PlayerError existentes sin modificar
- [ ] Validar que todos los métodos públicos manejen errores correctamente
- [ ] Actualizar tests para verificar PlayerError en lugar de Error

## 🎯 Estado de Implementación

### ✅ Implementado

- **ProgressManagerUnified** - Usa PlayerError en todos los métodos
- **Códigos de error** - Definidos en player-errors.ts
- **Documentación** - Actualizada en instructions/

### 📝 Pendiente

- **BaseProgressManager** - Migrar a PlayerError
- **VODProgressManagerClass** - Migrar a PlayerError
- **DVRProgressManagerClass** - Migrar a PlayerError
- **Tests** - Actualizar para verificar PlayerError

## 📚 Referencias

- **Sistema de Errores**: `src/player/core/errors/instructions/ErrorSystem.md`
- **Definiciones de Errores**: `src/player/core/errors/definitions/player-errors.ts`
- **PlayerError Clase**: `src/player/core/errors/PlayerError.ts`
- **Guía de Uso**: `src/player/core/errors/docs/ErrorHandling.md`

---

**Versión**: 1.0  
**Fecha**: 2025-01-23  
**Estado**: ✅ Especificado | 📝 Implementación parcial (Unified completo, Base/VOD/DVR pendientes)
