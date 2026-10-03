# flash

Next.js frontend for a QR-synced phone light show. Operator plays a track; audience phones flash in time. Sync server lives in the sibling `../flask-web-api` project.

```bash
npm run dev:api
npm run dev
```

- Operator: https://localhost:3200/operator
- Audience join: https://localhost:3200/join

Dev uses local HTTPS certs in `certificates/` (not committed).
