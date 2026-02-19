# Tarea 01: Añadir peerDependency del paquete externo de analytics

## Objetivo

Registrar `@overon/react-native-overon-player-analytics-plugins` como `peerDependency` en `package.json` para que los consumidores del player instalen el paquete de analytics por su cuenta.

## Contexto

El paquete externo existe en:
- **Repositorio local**: `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn`
- **Nombre npm**: `@overon/react-native-overon-player-analytics-plugins`
- **Versión actual**: `0.2.0`

El paquete externo tiene sus propias dependencias que también deben declararse como peerDependencies si no lo están ya:
- `@overon/react-native-logger` — logger centralizado
- `@overon/react-native-overon-errors` — sistema de errores base

## Archivos a modificar

- `package.json` (raíz del repositorio)

## Cambios requeridos

### `package.json`

Añadir en la sección `peerDependencies`:

```json
"@overon/react-native-overon-player-analytics-plugins": ">=0.2.0"
```

Verificar si `@overon/react-native-logger` y `@overon/react-native-overon-errors` ya están como peerDependencies; si no, añadirlos también.

## Verificación

### Antes de implementar (`/verify`)

Comprobar:
1. La versión actual del paquete externo en su `package.json`
2. Que el paquete no está ya declarado como dependency/devDependency
3. Que las dependencias transitivas del paquete externo están cubiertas

### Después de implementar

```bash
# Verificar que el package.json es JSON válido
cat package.json | python3 -m json.tool

# Verificar que TypeScript sigue compilando (sin instalar aún el paquete)
yarn tsc --noEmit
```

## Criterios de aceptación

- [ ] `@overon/react-native-overon-player-analytics-plugins` aparece en `peerDependencies`
- [ ] La versión especificada es compatible con la v0.2.0 disponible
- [ ] El `package.json` es JSON válido
- [ ] No se ha añadido como `dependency` ni `devDependency` (es peerDependency)

## Notas

- Usar `>=0.2.0` como rango de versión para permitir actualizaciones menores/patch
- El paquete es **opcional** desde el punto de vista del player (solo se usa si el consumidor lo instala), pero la arquitectura lo requiere para el sistema de analytics, por lo que debe ser peerDependency y no optionalDependency
- En el futuro, cuando el paquete esté publicado en npm/registry privado, los consumidores deberán instalarlo explícitamente
