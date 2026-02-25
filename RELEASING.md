# Releasing react-native-video (startcat fork)

## Versionado

Usamos **Semantic Versioning** (semver) empezando en `v7.0.0` para marcar la separación del upstream.

- **MAJOR** (`8.0.0`): Breaking changes en la API pública, cambios de props de `<Video>`, cambios en tipos exportados
- **MINOR** (`7.1.0`): Nuevas funcionalidades (features), nuevos props, nuevos hooks
- **PATCH** (`7.0.1`): Bug fixes, mejoras de rendimiento, correcciones internas

## Cómo hacer un release

### Requisitos previos

1. Estar en la rama que quieras release-ar (normalmente `master`)
2. Working directory puede estar dirty (`requireCleanWorkingDir: false`)
3. Tener un `GITHUB_TOKEN` con permisos de repo para crear GitHub Releases:
   ```bash
   export GITHUB_TOKEN="ghp_..."
   ```

### Comandos

```bash
# Release patch (7.0.0 → 7.0.1) - bug fixes
yarn release:patch

# Release minor (7.0.0 → 7.1.0) - nuevas features
yarn release:minor

# Release major (7.0.0 → 8.0.0) - breaking changes
yarn release:major

# Release interactivo (te pregunta qué tipo)
yarn release
```

### Qué hace `release-it` automáticamente

1. Ejecuta `yarn build` para verificar que compila
2. Bump de versión en `package.json`
3. Genera/actualiza `CHANGELOG.md` a partir de conventional commits
4. Crea commit: `chore: release v7.x.x`
5. Crea tag anotado: `v7.x.x`
6. Push del commit + tag a `origin`
7. Crea GitHub Release con el changelog

### Dry run (simulación sin efectos)

```bash
yarn release -- --dry-run
```

## Convención de commits

Para que el CHANGELOG se genere correctamente, usad **Conventional Commits**:

```
feat(cast): añadir soporte DRM con FairPlay
fix(dvr): corregir cálculo de live edge en pausa
fix(downloads): proteger eliminación con índice -1
refactor(offline): extraer NativeEventBridge
chore: actualizar dependencias
```

- `feat:` → aparece en "Features" del CHANGELOG
- `fix:` → aparece en "Bug Fixes" del CHANGELOG
- `BREAKING CHANGE:` en el footer → marca como breaking change

## Consumir desde proyectos

### Antes (❌)
```json
"react-native-video": "github:startcat/react-native-video#95ed33a3aa1efda10e34b6126993f7836b40268a"
```

### Ahora (✅)
```json
"react-native-video": "github:startcat/react-native-video#v7.0.0"
```

### Actualizar a nueva versión
```json
"react-native-video": "github:startcat/react-native-video#v7.1.0"
```

> **Nota:** GitHub no soporta rangos semver (`^7.0.0`) con la sintaxis `github:`. 
> Siempre hay que especificar la versión exacta con `#v7.x.x`.

## Flujo típico de trabajo

```
1. Desarrollar en ramas feature/fix
2. Merge a master (o la rama de release)
3. yarn release:patch   (o :minor / :major)
4. En proyectos consumidores: actualizar #vX.Y.Z en package.json
5. yarn install / pod install
```

## Pre-releases (opcional)

Para versiones de prueba antes de un release estable:

```bash
yarn release -- --preRelease=beta
# Ejemplo: 7.1.0 → 7.2.0-beta.0

yarn release -- --preRelease=beta
# Ejemplo: 7.2.0-beta.0 → 7.2.0-beta.1
```

Consumir en proyectos:
```json
"react-native-video": "github:startcat/react-native-video#v7.2.0-beta.0"
```
