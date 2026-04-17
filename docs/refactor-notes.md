# Render/Postgres refactor notes

Initial architecture before the refactor:

- Express starts in `backend/src/server.js`.
- The Express app is assembled in `backend/src/app.js`, with `/api/*` routes only.
- SQLite is opened in `backend/src/db.js` through `better-sqlite3`, and `backend/src/server.js` checks the SQLite schema at startup.
- Runtime queries live in `backend/src/dashboard-repository.js` and use synchronous `db.prepare(...).get()` / `.all()` calls.
- The frontend hardcodes `http://127.0.0.1:3000/api` in `frontend/assets/js/app.js`.
- Render-hostile assumptions are the checked-in/local SQLite runtime path (`backend/data/dashboard.sqlite`), SQLite import/export scripts, and separate frontend hosting.
