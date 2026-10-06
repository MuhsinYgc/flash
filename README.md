# flash

Next.js frontend — QR ile senkron tribün flaşı. DJ YouTube çalar; telefonlar sunucu saatine göre yanar. Show server: `../flask-web-api`.

## Maç öncesi

1. `npm run dev:api` (3202)
2. `npm run dev` (HTTPS 3200)
3. yt-dlp binary: `flask-web-api/node_modules/youtube-dl-exec/bin`
4. Operator: `https://localhost:3200/operator` — DJ hesabı env’de (`SHOW_OPERATOR_USER` / `SHOW_OPERATOR_PASS`)
5. İki telefonla `/join` + flaş izni
6. Flaş ofseti varsayılan 170 ms; değiştirmeden mevcut senkron aynı kalır

## Sayfalar

- Operator: `/operator`
- Taraftar: `/join`
- Salon QR: `/screen`

`/show-http/*` show server’a proxy edilir. Telefonda flaş için HTTPS gerekir.

Analiz için ses indirilir; kabin çalımı YouTube embed’dir.
