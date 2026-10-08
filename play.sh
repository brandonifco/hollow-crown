#!/usr/bin/env bash
# Launch The Hollow Crown: serves the game locally and opens it in your browser.
cd "$(dirname "$0")"
PORT="${PORT:-8642}"
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 0.7
fi
URL="http://127.0.0.1:$PORT/index.html"
echo "The Hollow Crown is running at $URL"
(xdg-open "$URL" || sensible-browser "$URL" || echo "Open $URL in your browser") >/dev/null 2>&1 &
