#!/bin/bash
# Removes the Azeroth Exchange site from Homebrew nginx and reloads nginx. Leaves nginx itself installed and running.

set -euo pipefail

BREW="$(brew --prefix)"
DEST="$BREW/etc/nginx/servers/azeroth-exchange.conf"

if [[ -f "$DEST" ]]; then
    rm "$DEST"
    echo "Removed $DEST"
    if pgrep -f 'nginx: master process' >/dev/null; then
        "$BREW/bin/nginx" -s reload
        echo "Reloaded nginx."
    fi
else
    echo "Not installed."
fi
