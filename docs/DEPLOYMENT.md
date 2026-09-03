# Deployment

Leafmark runs as one web service. The production Fastify process serves `/api/*` and the built PWA from `apps/web/dist`. Permanent records are stored in PostgreSQL, while in-progress browser drafts remain in IndexedDB.

## Render Free + Neon Postgres

This is the recommended zero-cost hosting setup for a family deployment.

1. Create a PostgreSQL database on Neon and copy its pooled connection string.
2. In Render, create a Web Service from this repository, branch `main`.
3. Select **Node** and the **Free** compute plan. Leave Root Directory blank.
4. Build command: `npm install --include=dev && npm run build`
5. Start command: `APP_ORIGIN=$RENDER_EXTERNAL_URL npm start`
6. Health check path: `/health`
7. Add environment variables:
   - `DATABASE_URL` = the Neon connection string
   - `COOKIE_SECRET` = a random value of at least 32 characters
   - `PARENT_PIN` = your chosen parent PIN
   - `CHILDREN` = for example `Gavin:1357,Savannah:2468` with your chosen PINs
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `NODE_VERSION=22.14.0`
8. Deploy. The application runs database migrations automatically at startup.

No Render persistent disk is required. Do not set `DATABASE_PATH`.

The repository also contains `render.yaml` with the same free-service configuration if you prefer Render's Blueprint flow.

## AI endpoint

A cloud Render service cannot directly reach a Bonsai server listening on `127.0.0.1` on your home machine. Without a remotely reachable OpenAI-compatible endpoint, Leafmark uses deterministic safe fallbacks. To enable model-backed phrasing/evaluation, set `LOCAL_AI_BASE_URL`, `LOCAL_AI_API_KEY`, and optionally `LOCAL_AI_MODEL` to an endpoint Render can reach.

## Self-hosting

For a home-server deployment, install Node.js 22+, provide any reachable PostgreSQL `DATABASE_URL`, copy `.env.example` to `.env`, and set a production `APP_ORIGIN`, secrets, and PINs. Then run:

```text
npm install
npm run db:migrate
npm run build
NODE_ENV=production npm start
```

If you expose Leafmark beyond a trusted LAN, use HTTPS.

## Updating

Update the repository, run `npm install`, `npm run build`, and restart. Startup migrations are additive and recorded in `schema_migrations`.
