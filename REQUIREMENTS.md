# Requirements

This is a JavaScript/Node.js project. Dependencies are managed via `npm` and declared in `package.json` files — not `requirements.txt`, which is a Python convention. This file documents all runtime and development dependencies across the stack.

---

## System requirements

| Requirement | Version used | Notes |
|---|---|---|
| Node.js | v22.14.0 | v18+ required minimum |
| npm | v11.5.2 | Bundled with Node.js |
| PostgreSQL | any recent v14+ | Must be running before starting the backend |

---

## Backend (`backend/package.json`)

### Runtime dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP server and routing |
| `@prisma/client` | ^6.19.3 | Database client (auto-generated from schema) |
| `prisma` | ^6.19.3 | ORM — migrations, schema management, seed runner |
| `socket.io` | ^4.8.3 | WebSocket server (real-time events) |
| `jsonwebtoken` | ^9.0.3 | JWT signing and verification (access + refresh tokens) |
| `bcrypt` | ^6.0.0 | Password hashing |
| `cookie-parser` | ^1.4.7 | Parses httpOnly cookie for refresh token |
| `cors` | ^2.8.6 | Cross-origin request headers for frontend ↔ backend |
| `dotenv` | ^17.4.2 | Loads `.env` file into `process.env` |

### Dev dependencies

| Package | Version | Purpose |
|---|---|---|
| `nodemon` | ^3.1.14 | Auto-restarts server on file changes during development |
| `socket.io-client` | ^4.8.3 | Used in manual WebSocket test scripts only |

---

## Frontend (`frontend/package.json`)

### Runtime dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.3.3 | React framework — App Router, SSR, file-based routing |
| `react` | 19.2.8 | UI library |
| `react-dom` | 19.2.8 | DOM renderer for React |
| `socket.io-client` | ^4.8.3 | WebSocket client — connects to the backend Socket.io server |

### Dev dependencies

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | ^4 | Utility-first CSS framework |
| `@tailwindcss/postcss` | ^4 | PostCSS plugin required for Tailwind v4 |
| `typescript` | ^5 | Type checking (Next.js config and layout files) |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/react` | ^19 | React type definitions |
| `@types/react-dom` | ^19 | React DOM type definitions |
| `eslint` | ^9 | JavaScript/TypeScript linter |
| `eslint-config-next` | 16.3.3 | ESLint ruleset for Next.js projects |

---

## External services

| Service | Used for | Required |
|---|---|---|
| PostgreSQL | Primary database | Yes — the app will not start without a valid `DATABASE_URL` |

No other external services, APIs, or paid third-party integrations are required.

---

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list. The backend will exit at startup if `DATABASE_URL`, `JWT_ACCESS_SECRET`, or `JWT_REFRESH_SECRET` are missing.

---

## Installing all dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

After installation, run the Prisma migration to create the database schema:

```bash
cd backend
npx prisma migrate dev --name init
```

Optionally seed demo data (this wipes and recreates all data):

```bash
npm run seed
```
