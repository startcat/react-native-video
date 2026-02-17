# Tarea: Setup infraestructura de tests Android

> Tarea 04 de 22 | Fase A: Red de seguridad
> Plan de refactorización de Android Native Module

## Contexto

El módulo nativo Android no tiene ninguna infraestructura de testing. No hay dependencias de test en `build.gradle`, ni directorios `src/test/` ni `src/androidTest/`. Esta tarea crea la base necesaria para que todas las demás tareas de testing puedan ejecutarse.

**IDs de auditoría cubiertos**: Ninguno directamente — es prerequisito transversal.

## Objetivo

Configurar la infraestructura de tests unitarios (JUnit 4, Mockito, Robolectric) en el módulo Android para que los tests de contrato puedan compilar y ejecutarse.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene la configuración requerida en la sección "Nota sobre infraestructura de tests". Usar esa configuración como punto de partida.

**No rediseñar los tests desde cero.** La auditoría ya hizo el análisis. Si el código propuesto tiene errores, corregirlos; si le falta cobertura, ampliarla.

## Alcance

### Código bajo test (NO modificar)

- Ningún fichero de producción se modifica en esta tarea

### Ficheros a crear/modificar

- `android/build.gradle` — Añadir dependencias de test (JUnit, Mockito, Robolectric)
- `android/src/test/java/com/brentvatne/` — Crear estructura de directorios

### Fuera de alcance

- NO escribir tests en esta tarea (solo infraestructura)
- NO modificar código de producción
- NO añadir tests de integración (androidTest) por ahora

## Configuración requerida

### Dependencias en `build.gradle`

```groovy
dependencies {
    // ... dependencias existentes ...

    // Unit tests
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:5.8.0'
    testImplementation 'org.mockito:mockito-inline:5.2.0'
    testImplementation 'org.robolectric:robolectric:4.11.1'
    testImplementation 'androidx.test:core:1.5.0'
    testImplementation 'org.json:json:20231013'
}
```

### Estructura de directorios

```
android/src/test/java/com/brentvatne/
├── exoplayer/
│   ├── source/
│   ├── tracks/
│   ├── buffer/
│   ├── events/
│   ├── drm/
│   └── ads/
├── react/
│   └── downloads/
├── offline/
├── license/
│   └── internal/
│       └── utils/
└── util/
```

### Test de humo

Crear un test mínimo que verifique que la infraestructura funciona:

```java
// android/src/test/java/com/brentvatne/SmokeTest.java
package com.brentvatne;

import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class SmokeTest {
    @Test
    public void infrastructure_works() {
        assertTrue(true);
    }
}
```

## Criterios de aceptación

- [ ] Las dependencias de test están en `build.gradle`
- [ ] La estructura de directorios existe
- [ ] El test de humo compila y pasa: `./gradlew :react-native-video:test`
- [ ] No se ha modificado ningún fichero de producción

## Dependencias

### Tareas previas requeridas
- Ninguna (esta es la primera tarea a ejecutar)

### Tareas que dependen de esta
- Todas las demás tareas del plan (01, 02, 03, 05-22)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: incompatibilidad de versiones entre dependencias de test y las dependencias existentes del proyecto
- **Mitigación**: verificar que las versiones de Mockito y Robolectric son compatibles con la versión de Android SDK y ExoPlayer del proyecto
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas

## Notas

- El `build.gradle` actual no tiene ninguna dependencia de test. Verificar que el bloque `dependencies` existe y añadir las líneas al final.
- Robolectric requiere Java 11+. Verificar la versión de Java del proyecto.
- Si el proyecto usa Gradle Kotlin DSL en lugar de Groovy, adaptar la sintaxis.
