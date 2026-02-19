# Especificación Técnica: Añadir peerDependency del paquete externo de analytics

> Generado a partir de task.md el 2026-02-19

## Resumen

Añadir `@overon/react-native-overon-player-analytics-plugins` (y sus dependencias transitivas `@overon/react-native-logger` y `@overon/react-native-overon-errors`) como `peerDependencies` en `package.json`, sin instalarlas como dependencias directas.

---

## 1. Alcance

### Módulos afectados

**Directos:**
- `package.json` (raíz): único archivo a modificar

**Indirectos:**
- Ninguno — este cambio es puramente declarativo en el manifiesto del paquete

### Dependencias impactadas

**Externas (nuevas peerDependencies):**
- `@overon/react-native-overon-player-analytics-plugins@>=0.2.0`: paquete principal de analytics
- `@overon/react-native-logger@*`: dependencia transitiva del paquete anterior (logger centralizado)
- `@overon/react-native-overon-errors@*`: dependencia transitiva del paquete anterior (sistema de errores base)

**Existentes (verificar que no colisionan):**
- Todas las `peerDependencies` actuales en `package.json` — no deben verse afectadas

### Archivos de configuración

- `package.json`: añadir entradas en la sección `peerDependencies`

---

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
|---|---|---|---|
| `peerDependencies["@overon/react-native-overon-player-analytics-plugins"]` | Nuevo | ausente | `">=0.2.0"` |
| `peerDependencies["@overon/react-native-logger"]` | Nuevo (si no existe) | ausente | `"*"` o versión específica |
| `peerDependencies["@overon/react-native-overon-errors"]` | Nuevo (si no existe) | ausente | `"*"` o versión específica |

### Cambios en tipos/interfaces

Ninguno — este cambio no afecta a ningún tipo TypeScript.

### Cambios en eventos/callbacks

Ninguno.

---

## 3. Flujo de datos

### Estado global afectado

Ninguno — cambio puramente de configuración de manifiesto.

### Persistencia

- **Local storage**: sin impacto
- **Base de datos**: sin impacto
- **Cache**: sin impacto

### Comunicación entre módulos

Ninguna — este cambio no altera la comunicación entre módulos en tiempo de ejecución.

---

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
|---|---|---|
| Los consumidores del player que no tengan instalado `@overon/react-native-overon-player-analytics-plugins` verán un warning de peerDependency no satisfecha | Baja | El paquete aún no se usa en código (las tareas 02-04 lo harán); el warning es informativo, no bloquea la compilación |
| Rango `>=0.2.0` podría incluir versiones futuras con breaking changes | Baja | Acotar a `^0.2.0` si se prefiere semver estricto (solo minor/patch) |

### Impacto en rendimiento

- Ninguno — cambio declarativo en `package.json`, sin efecto en runtime.

### Casos edge problemáticos

- **Paquete no publicado en registry**: si `@overon/react-native-overon-player-analytics-plugins` no está en el registry npm/privado, los consumidores no podrán instalarlo. Actualmente solo existe en local. Esto es aceptable mientras la migración está en curso.
- **Versiones de `@overon/react-native-logger` y `@overon/react-native-overon-errors`**: usar `"*"` es permisivo; si el paquete externo requiere versiones mínimas específicas, conviene alinearse con las que declara en su propio `package.json`.

---

## 5. Estrategias

### Testing

- **Unitarios**: no aplica (cambio de configuración)
- **Integración**: no aplica en esta tarea aislada
- **E2E**: no aplica
- **Manual**: verificar que `cat package.json | python3 -m json.tool` no devuelve error (JSON válido) y que `yarn tsc --noEmit` sigue pasando

### Rollback

1. Eliminar las 3 entradas añadidas en `peerDependencies` de `package.json`
2. Verificar que `yarn tsc --noEmit` sigue pasando

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí (revertir las líneas añadidas en `package.json`)

---

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Cambio de 3 líneas en `package.json`. Sin lógica de código, sin cambios de tipos, sin riesgo de regresión funcional.
- **Tiempo estimado**: 5-10 minutos

---

## 7. Preguntas sin resolver

### Técnicas

- [ ] **Rango de versión exacto**: ¿usar `>=0.2.0` (permisivo) o `^0.2.0` (semver estricto)? Depende de si se espera que el paquete externo siga semver correctamente.
- [ ] **Versiones de dependencias transitivas**: ¿qué versiones exactas de `@overon/react-native-logger` y `@overon/react-native-overon-errors` requiere el paquete externo? Consultar su `package.json` en `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn/package.json` (sección `dependencies`).
- [ ] **¿Son `@overon/react-native-logger` y `@overon/react-native-overon-errors` necesarias como peerDependencies del player?** Las peerDependencies transitivas no siempre necesitan declararse explícitamente — solo si el player las usa directamente. En esta tarea (01) el player aún no las usa directamente, así que podrían omitirse hasta la tarea 03.

### De negocio

- [ ] **¿El paquete `@overon/react-native-overon-player-analytics-plugins` está publicado en algún registry?** Si no, los consumidores del player no podrán instalarlo hasta que se publique. ¿Se usará un registry privado (GitLab/npm)?

### De rendimiento

- No aplica para esta tarea.

---

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
