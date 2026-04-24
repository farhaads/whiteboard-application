#!/bin/sh
set -e
# Fly hits 8080 (nginx). Next must use 3001; sync uses 1234 — isolate PORT per subshell.

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
