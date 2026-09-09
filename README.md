# Classmate Connect

Platform modules:
- Schedule comparison
- Timetable generation
- Students-by-courses finder
- Friends/enemies overlap foundation

## Project structure

- `backend/` Express + SQLite + scraper + migration + auth
- `src/` Frontend app (Vite + React)
- `scripts/` utility scripts (including DB update trigger)
- `frontend/` marker folder for frontend app structure

## Quick start

1. Install root dependencies:
```sh
npm install
```

2. Install backend dependencies:
```sh
npm --prefix backend install
```

3. Configure backend env:
- Copy `backend/.env.example` to `backend/.env`
- Set `ADMIN_EMAIL` to your email
- Keep/change `ADMIN_PASSWORD` (default `adminpass`)
- Set `JWT_SECRET` to a long random secret. The backend refuses to start without it.
- Student accounts can enable authenticator-app 2FA from their Profile page. To enable email-code recovery, set the SMTP variables in `backend/.env` using a Gmail/Google Workspace app password. Never commit `SMTP_PASSWORD`.

4. Seed admin account:
```sh
npm --prefix backend run init-admin
```

5. Run frontend + backend together:
```sh
npm run dev:full
```

Regular users can register at `/user-login`. Accounts are stored in `backend/data/users.db`, separate from the admin database. Registration requires accepting `/terms` and a password with at least 12 characters, including uppercase, lowercase, and a number.

## Scripts

- `npm run dev:frontend` → frontend only
- `npm run dev:backend` → backend only
- `npm run dev:full` → run both
- `npm run update:db` → login as admin then call `/api/update`

## Automatic update pipeline

`POST /api/update` runs:
1. scrape `https://stds.eng.cu.edu.eg/ClassList.aspx?s=1`
2. write snapshot to `backend/data/master_schedule.csv`
3. migrate into normalized SQLite schema

Response status:
- `success` scrape + migration done
- `partial` scrape done, migration failed
- `error` scrape failed or empty data

## Frontend API config

Set `VITE_API_BASE_URL` (default: `http://localhost:4000`).
