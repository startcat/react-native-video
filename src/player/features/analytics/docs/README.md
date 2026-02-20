# Sistema de Analytics del Player

> ⚠️ **El código de este módulo ha sido migrado al paquete externo `@overon/react-native-overon-player-analytics-plugins`.**
> Esta carpeta conserva únicamente la documentación de referencia y el historial de migración.

## Índice

1. [Introducción](#introducción)
2. [Origen del código](#origen-del-código)
3. [Arquitectura](#arquitectura)
4. [Guía de Implementación](#guía-de-implementación)
5. [Mejores Prácticas](#mejores-prácticas)

## Introducción

El sistema de analytics del player proporciona una arquitectura extensible y modular para integrar servicios de analíticas externos como **ComScore Streaming Tag**, **Adobe Analytics**, **Youbora**, y otros proveedores.

### Características principales:

- ✅ **Arquitectura de plugins** - Soporte para múltiples proveedores simultáneos
- ✅ **Tipado completo** - Interfaces TypeScript para todos los eventos
- ✅ **Configuración por ambiente** - Dev/Staging/Prod
- ✅ **Manejo de errores** - Aislamiento de fallos entre plugins con logging centralizado
- ✅ **Extensibilidad** - Fácil adición de nuevos servicios
- ✅ **Hook React** - Integración sencilla con componentes

## Origen del código

El código del sistema de analytics **ya no vive en este repositorio**. Fue migrado al paquete externo:

```
@overon/react-native-overon-player-analytics-plugins
```

### Imports correctos

```typescript
// ✅ Correcto — importar desde el paquete externo
import {
	BaseAnalyticsPluginFactory,
	PlayerAnalyticsEvents,
	usePlayerAnalyticsEvents,
	type PlayerAnalyticsPlugin,
	type AnalyticsFactoryConfig,
} from "@overon/react-native-overon-player-analytics-plugins";

// ✅ También disponible a través del player (re-exports selectivos)
import {
	BaseAnalyticsPluginFactory,
	type PlayerAnalyticsPlugin,
} from "@player/features";
```

### Instalación

```bash
# El paquete es peerDependency del player — instalar en el proyecto consumidor
yarn add @overon/react-native-overon-player-analytics-plugins
```

## Arquitectura

El sistema se basa en el patrón **Factory** y **Observer**:

1. **Factory**: Crea plugins específicos del proyecto (`BaseAnalyticsPluginFactory`)
2. **Event Manager**: Distribuye eventos a todos los plugins (`PlayerAnalyticsEvents`)
3. **Plugins**: Implementan la lógica específica de cada proveedor (`PlayerAnalyticsPlugin`)

## Guía de Implementación Rápida

### Paso 1: Instalar Dependencias

```bash
# Paquete de analytics del player
yarn add @overon/react-native-overon-player-analytics-plugins

# SDKs de los proveedores que necesites
npm install @plugin-comscore-streaming-tag        # Para ComScore
npm install @plugin-adobe-media                   # Para Adobe Analytics
npm install @plugin-youbora                       # Para Youbora
```

### Paso 2: Crear Factory Personalizado del Proyecto

```typescript
// analytics/ProjectAnalyticsFactory.ts
import { BaseAnalyticsPluginFactory } from "@overon/react-native-overon-player-analytics-plugins";

interface MyProjectMediaData {
	id: string;
	title: string;
	category: string;
	contentType: "live" | "vod";
	duration?: number;
}

export class ProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
	protected static mapMediaDataToComscoreMetadata(
		mediaData: MyProjectMediaData
	): any {
		return {
			c4: mediaData.title,
			c6: mediaData.id,
			c12: mediaData.category,
			ns_st_ci: mediaData.id,
			ns_st_ep: mediaData.title,
			ns_st_ge: mediaData.category,
			ns_st_cl: Math.round(mediaData.duration || 0).toString(),
			ns_st_ty: mediaData.contentType === "live" ? "live" : "content",
		};
	}
}
```

### Paso 3: Usar Analytics en tu Player

```typescript
// components/VideoPlayer.tsx
import React from 'react';
import { ProjectAnalyticsFactory } from './analytics/ProjectAnalyticsFactory';

function VideoPlayer({ mediaData }) {
    const plugins = ProjectAnalyticsFactory.createPlugins(mediaData, analyticsConfig);

    return (
        <ReactNativeVideoPlayer
            source={{ uri: mediaData.url }}
            features={{ analyticsConfig: plugins }}
        />
    );
}
```

## 📚 Documentación Adicional

- **[Guía de Implementación](./guia-implementacion.md)** - Guía paso a paso para crear plugins personalizados
- **[Referencia de Eventos](./eventos-plugin.md)** - Lista completa de eventos y parámetros disponibles
- **[Mejores Prácticas](./mejores-practicas.md)** - Configuración, performance, debugging y testing
- **[Historial de migración](./migration/)** - Tareas y specs del proceso de migración al paquete externo
