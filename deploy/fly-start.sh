#!/bin/sh
set -e
# Fly -> nginx :8080; Next :3001; y-websocket sync :1234 (isolated PORT in subshells).

(
  export HOST=0.0.0.0
  export PORT=1234
  exec node /app/sync/index.js
) &

(
  export PORT=3001
  export HOSTNAME=127.0.0.1
  cd /app && exec node server.js
) &

nginx -c /etc/nginx/nginx-fly.conf -g "daemon off;"
