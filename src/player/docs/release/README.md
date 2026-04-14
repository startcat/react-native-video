# Guía de Release

## Comandos de release

```bash
GITHUB_TOKEN=$GITHUB_TOKEN yarn release:patch   # 7.0.0 → 7.0.1 (bug fixes)
GITHUB_TOKEN=$GITHUB_TOKEN yarn release:minor   # 7.0.0 → 7.1.0 (features)
GITHUB_TOKEN=$GITHUB_TOKEN yarn release:major   # 7.0.0 → 8.0.0 (breaking changes)
```

Si tienes `GITHUB_TOKEN` exportado en `~/.zshrc` puedes omitir el prefijo:

```bash
yarn release:patch
yarn release:minor
yarn release:major
```

### ¿Cuándo usar cada uno?

| Comando         | Cuándo usarlo                              | Ejemplo                                            |
| --------------- | ------------------------------------------ | -------------------------------------------------- |
| `release:patch` | Bug fixes, mejoras internas, correcciones  | Fix de seek en Cast, corrección de DVR timestamps  |
| `release:minor` | Nuevas funcionalidades, nuevos props/hooks | Nuevo sistema de playlists, soporte DRM en Cast    |
| `release:major` | Cambios que rompen la API existente        | Cambio de firma de props, eliminar funcionalidades |

---

## Configuración del GITHUB_TOKEN

Para que el release pueda hacer push y crear GitHub Releases, necesitas un **Personal Access Token (PAT)**.

### Crear el token

1. Ve a [GitHub → Settings → Developer Settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Configura:
   - **Token name**: `release-react-native-video`
   - **Expiration**: lo que prefieras (recomendado: 1 año)
   - **Repository access**: "Only select repositories" → `startcat/react-native-video`
   - **Permisos**:
     - **Contents**: `Read and write`
     - **Metadata**: `Read-only` (se marca solo)
4. Click **"Generate token"** y copia el valor (`github_pat_...`)

### Configurar el token en tu máquina

Añade esta línea a tu `~/.zshrc` (o `~/.bashrc`):

```bash
export GITHUB_TOKEN="github_pat_AQUI_TU_TOKEN"
```

Luego recarga:

```bash
source ~/.zshrc
```

Así no tienes que escribir el token cada vez. Los comandos `yarn release:*` lo detectarán automáticamente.

> **Alternativa temporal**: Si no quieres guardarlo permanentemente, puedes pasarlo inline:
>
> ```bash
> GITHUB_TOKEN=github_pat_... yarn release:patch
> ```

---

## Errores de TypeScript preexistentes

El proyecto tiene errores TS preexistentes (peerDependencies no instaladas, variables sin usar, etc.). Estos **no bloquean el release** porque el hook `before:init: yarn build` ha sido eliminado del `.release-it.json`.

El módulo se distribuye vía GitHub tags, no vía npm, por lo que no es necesario verificar que el build compila en cada release. Los errores TS se corrigen en sus propias tareas de desarrollo.

### Modo no interactivo (CI)

Para ejecutar sin prompts de confirmación:

```bash
yarn release:patch --ci
```

---

## Problema con SSH

Si `git push` falla con "Permission denied (publickey)", el remote está configurado con SSH pero no tienes la clave SSH configurada. Dos opciones:

### Opción A: Configurar SSH (recomendado a largo plazo)

```bash
# Generar clave SSH si no tienes
ssh-keygen -t ed25519 -C "tu@email.com"

# Copiar la clave pública
pbcopy < ~/.ssh/id_ed25519.pub

# Añadir en GitHub → Settings → SSH and GPG keys → New SSH key
```

### Opción B: Push manual con HTTPS + token

Si SSH no funciona, puedes hacer el release en dos pasos:

```bash
# 1. Crear tag local (sin push)
yarn release:patch -- --no-hooks --ci --no-git.push --no-github.release

# 2. Push manual con HTTPS
git push https://x-access-token:$GITHUB_TOKEN@github.com/startcat/react-native-video.git master --follow-tags
```

---

## Flujo completo de un release

```
1. Asegúrate de estar en `master` con todos los cambios mergeados
2. Verifica la versión actual:
   cat package.json | grep version

3. Ejecuta el release:
   yarn release:patch

4. Verifica en GitHub:
   https://github.com/startcat/react-native-video/releases

5. En los proyectos consumidores, actualiza package.json:
   "react-native-video": "github:startcat/react-native-video#v7.0.1"

6. Instala:
   yarn install
   cd ios && pod install
```

---

## Pre-releases (betas)

Para versiones de prueba antes de un release estable:

```bash
yarn release -- --preRelease=beta
# 7.0.1 → 7.1.0-beta.0

yarn release -- --preRelease=beta
# 7.1.0-beta.0 → 7.1.0-beta.1
```

Consumir en proyectos:

```json
"react-native-video": "github:startcat/react-native-video#v7.1.0-beta.0"
```

---

## Convención de commits

Para que el CHANGELOG se genere correctamente, usad **Conventional Commits**:

```
feat(cast): añadir soporte DRM con FairPlay
fix(dvr): corregir cálculo de live edge en pausa
fix(downloads): proteger eliminación con índice -1
refactor(offline): extraer NativeEventBridge
chore: actualizar dependencias
```

| Prefijo            | Sección en CHANGELOG                       |
| ------------------ | ------------------------------------------ |
| `feat:`            | Features                                   |
| `fix:`             | Bug Fixes                                  |
| `perf:`            | Performance Improvements                   |
| `BREAKING CHANGE:` | Breaking Changes (en el footer del commit) |

---

## Dry run (simulación)

Para ver qué haría el release sin ejecutarlo:

```bash
yarn release:patch -- --dry-run
```

---

## Troubleshooting

### "Unable to fetch from git@github.com"

→ SSH no configurado. Ver sección "Problema con SSH" arriba.

### "GITHUB_TOKEN is required for automated GitHub Releases"

→ No tienes el token configurado. Ver sección "Configuración del GITHUB_TOKEN".

### Build falla con errores TypeScript

→ El hook de build ya no existe en `.release-it.json`. Si vuelve a aparecer este error, revisa que `before:init` no esté en el fichero de configuración.

### "tag already exists"

→ El tag ya fue creado. Borra el tag si necesitas recrearlo:

```bash
git tag -d v7.0.1
git push origin :refs/tags/v7.0.1
```
