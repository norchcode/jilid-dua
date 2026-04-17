# Jilid Dua

Jilid Dua is the Render-ready edition of the Nemesis dashboard. It keeps the app simple: one Express service serves the API and the static frontend, and PostgreSQL stores the dashboard data.

## Architecture

- `backend/` is a Node/Express app.
- `frontend/` is plain HTML/CSS/JS with no build step.
- Express serves `frontend/` with `express.static(...)`.
- `/api/*` remains the API namespace.
- Non-API routes fall back to `frontend/index.html`.
- PostgreSQL is accessed through `pg` and `DATABASE_URL`.

## Local Development

1. Create a local PostgreSQL database.

```bash
createdb nemesis
```

2. Configure the backend.

```bash
cd backend
cp .env.example .env
```

Set `DATABASE_URL` in `backend/.env` for your local database.

3. Install dependencies and initialize the schema.

```bash
npm install
npm run db:init
```

4. Start the app.

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. The frontend calls the API through same-origin `/api/...` URLs.

## Environment Variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | Render sets this automatically. |
| `HOST` | No | `0.0.0.0` | Required for Render-compatible binding. |
| `DATABASE_URL` | Yes | none | PostgreSQL connection string. |
| `DATABASE_SSL` | No | `false` | Set to `true` only when your Postgres endpoint requires SSL. |
| `CORS_ORIGIN` | No | empty | Optional comma-separated origins if serving the frontend separately. |
| `FRONTEND_DIR` | No | `../frontend` | Override only for unusual local layouts. |

## Database Bootstrap

Run the idempotent schema initializer:

```bash
cd backend
npm run db:init
```

The schema lives in `backend/sql/schema.sql`.

The previous app depended on a local SQLite file at `backend/data/dashboard.sqlite`. That file is not part of this refactor workspace, so automatic data migration cannot be completed safely from the repo alone. Export the existing SQLite data to a neutral format, load the rows into the matching PostgreSQL tables, then run the app against that Postgres database.

## Deploy On Render

This repo includes `render.yaml` for Render Blueprint deployment:

- one Node web service
- one Render PostgreSQL database
- `DATABASE_URL` wired from the database to the web service
- backend commands scoped with `rootDir: backend`

Deploy steps:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the GitHub repo.
3. Review the generated web service and database.
4. Apply the Blueprint.

Render runs:

```bash
npm ci
npm run db:init && npm start
```

The service health check is `/api/health`.
