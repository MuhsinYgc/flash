# flash — agent notes

Next.js frontend. Show sync server is in sibling project `../flask-web-api`.

Run API first: `npm run dev:api` (show server on 3202), then `npm run dev` (port 3200). `/show-http/*` is proxied to the show server.

Prefer reading existing patterns before changing code. Run `npm run lint` and `npm run build` before merging substantial changes.
