#!/bin/sh
# O zip da extensão para instalar em outra máquina (E12): a pasta extensao e o certificado da CA do
# homelab (só o certificado público, sem a chave). Sai na pasta do homelab, fora do repositório.
set -e
cd "$(dirname "$0")/.."
versao=$(node -p "require('./extensao/manifest.json').version")
destino="$(cd .. && pwd)/homelab-extensao-$versao.zip"
temp=$(mktemp -d)
cp -R extensao "$temp/extensao"
cp ../certs/homelab-ca.crt "$temp/" 2>/dev/null || echo "Aviso: ../certs/homelab-ca.crt não encontrado; o zip vai sem o certificado."
rm -f "$destino"
(cd "$temp" && zip -qr -X "$destino" extensao $(ls homelab-ca.crt 2>/dev/null) -x '*.DS_Store')
rm -rf "$temp"
echo "$destino"
