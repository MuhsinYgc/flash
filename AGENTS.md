# flah-web — agent notes

Next.js frontend. Backend API lives in sibling project `../flask-web-api`.

Run API first: `npm run dev:api` (port 3201), then `npm run dev` (port 3200). `/api/*` is proxied to the API.

Prefer reading existing patterns before changing code. Run `npm run lint` and `npm run build` before merging substantial changes.
