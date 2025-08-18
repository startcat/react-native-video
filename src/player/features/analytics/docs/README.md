# Sistema de Analytics del Player

## Índice

1. [Introducción](#introducción)
2. [Arquitectura](#arquitectura) 
3. [Componentes Principales](#componentes-principales)
4. [Guía de Implementación](#guía-de-implementación)
5. [Ejemplos Prácticos](#ejemplos-prácticos)
6. [Integración con el Player](#integración-con-el-player)
7. [Configuración por Ambientes](#configuración-por-ambientes)
8. [Mejores Prácticas](#mejores-prácticas)

## Introducción

El sistema de analytics del player proporciona una arquitectura extensible y modular para integrar servicios de analíticas externos como **ComScore Streaming Tag**, **Adobe Analytics**, **Youbora**, y otros proveedores.

### Características principales:

- ✅ **Arquitectura de plugins** - Soporte para múltiples proveedores simultáneos
- ✅ **Tipado completo** - Interfaces TypeScript para todos los eventos
- ✅ **Configuración por ambiente** - Dev/Staging/Prod
- ✅ **Manejo de errores** - Aislamiento de fallos entre plugins
- ✅ **Extensibilidad** - Fácil adición de nuevos servicios
- ✅ **Hook React** - Integración sencilla con componentes

## Arquitectura

El sistema se basa en el patrón **Factory** y **Observer**:

1. **Factory**: Crea plugins específicos del proyecto
2. **Event Manager**: Distribuye eventos a todos los plugins
3. **Plugins**: Implementan la lógica específica de cada proveedor

## Componentes Principales

### 1. Tipos e Interfaces (`/types/`)

- **`Plugin.ts`** - Define la interfaz `PlayerAnalyticsPlugin` y parámetros de eventos
- **`Factory.ts`** - Interfaces para configuración y factory de plugins

### 2. Clases Base

- **`BaseAnalyticsPluginFactory`** - Clase abstracta para crear factories
- **`PlayerAnalyticsEvents`** - Gestor de eventos que distribuye a plugins

### 3. Hook React

- **`usePlayerAnalyticsEvents`** - Hook para usar el sistema en componentes

### 4. Ejemplo de Implementación

- **`AnalyticsPluginFactory.example.ts`** - Plantilla de implementación específica

## Guía de Implementación Rápida

### Paso 1: Instalar Dependencias de Analytics

```bash
# Instalar SDKs de los proveedores que necesites
npm install @plugin-comscore-streaming-tag        # Para ComScore
npm install @plugin-adobe-media                   # Para Adobe Analytics  
npm install @plugin-youbora                       # Para Youbora
```

### Paso 2: Configurar Analytics en tu Proyecto

```typescript
// analytics/config.ts
import { ProjectAnalyticsFactory } from '@player/features/analytics';

// Configurar IDs y claves de tus proveedores
const analyticsConfig = {
    plugins: {
        comscore: {
            enabled: true,
            config: {
                c2: 'TU_COMSCORE_CLIENT_ID',
                debug: process.env.NODE_ENV === 'development'
            }
        },
        adobe: {
            enabled: true,
            config: {
                trackingServer: 'tu-servidor.adobe.com',
                reportSuite: 'tu-report-suite'
            }
        },
        youbora: {
            enabled: true,
            config: {
                accountCode: 'TU_YOUBORA_ACCOUNT'
            }
        }
    }
};

export { analyticsConfig };
```

### Paso 3: Crear Factory Personalizado del Proyecto

Crea un factory que mapee los datos de tu proyecto a los formatos requeridos por cada proveedor:

```typescript
// analytics/ProjectAnalyticsFactory.ts
import { BaseAnalyticsPluginFactory } from '@player/features/analytics';
import { analyticsConfig } from './config';

// Define el tipo de datos de medios de tu proyecto
interface MyProjectMediaData {
    id: string;
    title: string;
    category: string;
    contentType: 'live' | 'vod';
    duration?: number;
    // ... otros campos específicos de tu proyecto
}

export class ProjectAnalyticsFactory extends BaseAnalyticsPluginFactory {
    
    // Mapear datos de tu proyecto para ComScore
    protected static mapMediaDataToComscoreMetadata(mediaData: MyProjectMediaData): any {
        return {
            c4: mediaData.title,
            c6: mediaData.id,
            c12: mediaData.category,
            ns_st_ci: mediaData.id,
            ns_st_ep: mediaData.title,
            ns_st_ge: mediaData.category,
            ns_st_cl: Math.round(mediaData.duration || 0).toString(),
            ns_st_ty: mediaData.contentType === 'live' ? 'live' : 'content'
        };
    }
    
    // Mapear datos de tu proyecto para Adobe
    protected static mapMediaDataToAdobeMetadata(mediaData: MyProjectMediaData): any {
        return {
            videoName: mediaData.title,
            videoId: mediaData.id,
            videoLength: mediaData.duration || 0,
            videoGenre: mediaData.category,
            videoType: mediaData.contentType
        };
    }
    
    // Obtener configuración por ambiente
    static getConfig() {
        return analyticsConfig;
    }
}
```

### Paso 4: Usar Analytics en tu Player

```typescript
// components/VideoPlayer.tsx
import React from 'react';
import { ProjectAnalyticsFactory } from '@player/features/analytics';
import { analyticsConfig } from '../analytics/config';

function VideoPlayer({ mediaData }) {
    // Crear plugins automáticamente basados en configuración
    const plugins = ProjectAnalyticsFactory.createPlugins(mediaData, analyticsConfig);
    
    // Usar hook del player para conectar analytics
    const analytics = usePlayerAnalyticsEvents(mediaData, plugins);
    
    return (
        <ReactNativeVideoPlayer
            source={{ uri: mediaData.url }}
            analytics={analytics}  // El player conecta automáticamente los eventos
            // ... otras props
        />
    );
}
```

## 📚 Documentación Adicional

- **[Guía de Implementación](./guia-implementacion.md)** - Guía paso a paso para crear plugins personalizados
- **[Referencia de Eventos](./eventos-plugin.md)** - Lista completa de eventos y parámetros disponibles
- **[Mejores Prácticas](./mejores-practicas.md)** - Configuración, performance, debugging y testing
