# flash

Next.js frontend for a QR-synced phone light show. Operator plays a track; audience phones flash in time. Talks to the sibling API at `../flask-web-api`.

```bash
npm run dev:api
npm run dev
```

Web UI: https://localhost:3200 (dev uses a local HTTPS cert). API is proxied at `/api/*`.
