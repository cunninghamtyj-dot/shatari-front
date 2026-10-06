#!/bin/bash
# Installs (or updates) the Azeroth Exchange site in Homebrew nginx, then starts or reloads nginx.
# Usage: nginx/install.sh [port]    Default port: 8420.
# Build the site first (npm run build). Rerun after changing the template or the port.

set -euo pipefail

PORT="${1:-8420}"
cd "$( dirname "${BASH_SOURCE[0]}" )/.."
FRONT="$(pwd -P)"

BREW="$(brew --prefix)"
NGINX="$BREW/bin/nginx"
DEST="$BREW/etc/nginx/servers/azeroth-exchange.conf"

if [[ ! -f dist/index.html ]]; then
    echo "No built site in $FRONT/dist. Run: npm run build" >&2
    exit 1
fi
if [[ ! -d data ]]; then
    echo "Missing $FRONT/data (should be a symlink to the back end's data folder)." >&2
    exit 1
fi
if [[ ! -d json/realms ]]; then
    echo "Missing $FRONT/json/realms (should be a symlink to the back end's realms folder)." >&2
    exit 1
fi
DATA="$(cd data && pwd -P)"

OWNER="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -Fc 2>/dev/null | sed -n 's/^c//p' | head -1 || true)"
if [[ -n "$OWNER" && "$OWNER" != "nginx" ]]; then
    echo "Port $PORT is already used by $OWNER. Pick another: nginx/install.sh <port>" >&2
    exit 1
fi

mkdir -p "$(dirname "$DEST")"
sed -e "s#__PORT__#$PORT#g" -e "s#__FRONT__#$FRONT#g" -e "s#__DATA__#$DATA#g" \
    nginx/azeroth-exchange.conf.template > "$DEST"
echo "Wrote $DEST"

"$NGINX" -t

if pgrep -x nginx >/dev/null; then
    "$NGINX" -s reload
    echo "Reloaded nginx."
else
    brew services start nginx
fi

sleep 1
if curl -fsS -o /dev/null "http://localhost:$PORT/"; then
    echo "Azeroth Exchange: http://localhost:$PORT/"
else
    echo "nginx isn't answering on port $PORT. Check $BREW/var/log/nginx/error.log" >&2
    echo "(Homebrew's default nginx.conf also listens on 8080; if another program uses 8080, nginx can't start.)" >&2
    exit 1
fi
