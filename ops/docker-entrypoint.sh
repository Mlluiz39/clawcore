#!/bin/sh
# ClawCore — entrypoint do container backend.
#
# O processo principal sobe como root (para poder corrigir dono dos volumes bind
# montados pela host) e cai para o usuário não-privilegiado `node` imediatamente
# antes de tocar no app. Assim o Node nunca roda como root, mas bind mounts com
# dono divergente não quebram o boot.
set -eu

APP_USER=node
APP_HOME=/home/node

# Diretórios persistidos por bind mount no compose. Na host o dono depende do
# usuário que subiu o stack, então não dá para assumir uid 1000.
# Inclui data/whatsapp-session (dentro de /app/data) e ~/.config/gogcli.
for dir in /app/data /app/tmp /app/outputs "$APP_HOME/.config"; do
  mkdir -p "$dir"
  chown -R "$APP_USER:$APP_USER" "$dir" 2>/dev/null || true
done

export HOME="$APP_HOME"

# Permite sobrescrever o comando (ex.: `docker compose run backend node ...`).
if [ "$#" -gt 0 ]; then
  exec su-exec "$APP_USER" "$@"
fi

exec su-exec "$APP_USER" node dist/index.js
