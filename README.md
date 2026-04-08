# Edulytics

Edulytics is a full-stack academic management application with:

- `client/`: React + Vite frontend
- `server/`: Express + Prisma + PostgreSQL backend

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+ or Docker Desktop

## Local Setup

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Configure the backend:

```bash
cd server
copy .env.example .env
```

Update `server/.env` with your actual production or local values.

3. Install backend dependencies and initialize the database:

```bash
npm install
npm run db:init
```

4. Optionally seed a default admin and baseline configuration:

```bash
npm run seed
```

5. Configure and start the frontend:

```bash
cd ../client
copy .env.example .env
npm install
npm run dev
```

6. Start the backend:

```bash
cd ../server
npm run dev
```

Frontend default: `http://localhost:5173`

API default: `http://localhost:4000`

Health check: `GET /health`

## Production Deployment

- Set a strong `JWT_SECRET`
- Set `CLIENT_ORIGIN` to the deployed frontend URL
- Use `COOKIE_SECURE=true`
- Use `COOKIE_SAME_SITE="none"` only when frontend and API are on different HTTPS origins
- Run `npm run db:init` during first-time database setup
- Run `npm run build` before `npm start`

## Seeded Admin

If you run `npm run seed`, the admin user is created from:

- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

The seeded admin is marked `mustChangePassword=true`.
