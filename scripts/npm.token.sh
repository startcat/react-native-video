#!/usr/bin/env bash
set -euo pipefail

KEY_FILE="./credential/google.json"
SCOPE="@overon"
REG_URL="https://europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/"

command -v gcloud >/dev/null || { echo "gcloud no encontrado"; exit 1; }
command -v yarn >/dev/null || { echo "yarn no encontrado"; exit 1; }

echo ">> Activando cuenta de servicio"
gcloud auth activate-service-account --key-file "${KEY_FILE}" >/dev/null

echo ">> Configurando credential helper"

echo ">> Obteniendo token de acceso"
TOKEN=$(gcloud auth print-access-token)

echo ">> Escribiendo .yarnrc.yml"
cat > .yarnrc.yml <<YML
npmScopes:
  overon:
    npmRegistryServer: "${REG_URL}"
    npmAlwaysAuth: true
    npmAuthToken: "${TOKEN}"

nodeLinker: node-modules
YML

echo ">> Escribiendo .npmrc"
cat > .npmrc <<NPM
${SCOPE}:registry=${REG_URL}
//europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/:username=oauth2accesstoken
//europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/:_password=$(gcloud auth print-access-token | base64)
//europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/:email=not.used@example.com
always-auth=true
NPM

echo "Listo."