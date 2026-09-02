# TaskFlow

A collaborative task-board application (Trello/Jira-style) built with a real backend, real database, JWT-based authentication with refresh tokens, role-based project membership, and live real-time updates via WebSockets.

## What it does

TaskFlow lets users sign up, create projects, and invite other registered users as project members. Tasks are managed on a Kanban-style board with three columns: To Do, In Progress, and Done. Project owners can invite and remove members; any member can create and edit tasks. Only the assigned member or the project owner can mark a task as Done. Only the task creator or the project owner can delete a task.

Every project has a reverse-chronological activity feed. Tasks support comments. All changes — task creates, updates, deletes, new comments, member invites and removals — propagate live to every connected member via WebSockets, with no manual refresh needed. A personal "Assigned to Me" view shows all tasks assigned to you across every project you belong to. A dashboard summarizes your workload with task counts by status, tasks completed this week, and the busiest project by open task count.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (React 19, App Router) | File-based routing and a mature ecosystem for a data-heavy multi-page app |
| Styling | Tailwind CSS v4 | Utility-first, zero runtime overhead |
| Backend | Express 5 (Node.js) | Plain, explicit request/response handling that's easy to trace line by line |
| Database | PostgreSQL via Prisma ORM | The data model is deeply relational — users, projects, memberships, tasks, comments, and activity all reference each other; a relational DB with real foreign keys and cascade deletes is the natural fit |
| Real-time | Socket.io | Built-in reconnection handling and room-based broadcasting fit the project-scoped live-update requirement directly |
| Auth | JWT access + refresh tokens, bcrypt | Short-lived access tokens in memory, long-lived refresh token in an httpOnly cookie |

## How to run it (clean clone)

### Prerequisites

- Node.js v18 or later
- PostgreSQL running locally (or accessible via a connection string)

### 1. Clone and install

```bash
git clone <repo-url>
cd taskflow

cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment variables

**backend/.env** (copy from `backend/.env.example`):

```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/taskflow"
JWT_ACCESS_SECRET=<a long random string>
JWT_REFRESH_SECRET=<a different long random string>
PORT=5000
FRONTEND_URL=http://localhost:3000
```

Generate secure random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run it twice — one value for each secret. The server will refuse to start if either JWT secret is missing; without them tokens would be signed with the literal string `"undefined"`, making every token appear valid to any server with the same broken config.

**frontend/.env.local** (copy from `frontend/.env.example`):

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev --name init
```

This creates the `taskflow` database (if it doesn't exist) and applies all migrations.

### 4. Seed demo data

```bash
npm run seed
```

> **Warning:** The seed script wipes all existing data before inserting the demo dataset. Don't run it against a database you care about.

This creates two test users, a shared project with five tasks across all three statuses, one comment, and a full activity log — enough to test collaboration and real-time flows immediately.

**Demo credentials:**

| User | Email | Password | Role |
|---|---|---|---|
| Test User | test@example.com | password123 | Project Owner |
| Second User | second@example.com | password123 | Project Member |

### 5. Run both servers

In one terminal:

```bash
cd backend
npm run dev
```

In a second terminal:

```bash
cd frontend
npm run dev
```

Backend runs on `http://localhost:5000`, frontend on `http://localhost:3000`.

## Project structure

```
taskflow/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Data model
│   │   └── seed.js             # Demo data seed script
│   └── src/
│       ├── config/db.js        # Prisma client singleton
│       ├── controllers/        # All business logic lives here
│       ├── middleware/
│       │   ├── authMiddleware.js      # JWT verification, attaches req.userId
│       │   └── projectMiddleware.js   # Membership check, attaches req.membership
│       ├── routes/             # Express routers
│       ├── sockets/
│       │   ├── socket.js       # Socket.io init, auth middleware, room joins
│       │   ├── emitters.js     # Thin wrappers — controllers call these to broadcast
│       │   └── socketRegistry.js     # In-memory userId → socketId map
│       ├── utils/
│       │   ├── activityLogger.js     # Shared helper for writing ActivityLog rows
│       │   └── asyncHandler.js       # Wraps async route handlers to forward errors
│       └── server.js           # Express + Socket.io server entry point
└── frontend/
    ├── app/                    # Next.js App Router pages
    │   ├── dashboard/          # Workload summary
    │   ├── projects/           # Project list + per-project board and task detail
    │   ├── assigned-to-me/     # Cross-project tasks assigned to the current user
    │   ├── login/ signup/      # Auth pages
    │   └── layout.tsx          # Root layout with AuthProvider + SocketProvider
    ├── components/NavBar.jsx
    ├── context/
    │   ├── AuthContext.jsx     # Access token state, authedFetch with refresh retry
    │   └── SocketContext.jsx   # Socket.io connection lifecycle
    └── lib/api.js              # Base fetch wrapper (credentials: include)
```

## API routes

Auth-required routes expect `Authorization: Bearer <token>`. The signup, login, refresh, and logout endpoints are open; `/api/auth/me` requires a token.

```
# No auth required
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/refresh               # reads httpOnly cookie, returns new access token
POST   /api/auth/logout                # clears httpOnly cookie

# Auth required (Authorization: Bearer <token>)
GET    /api/auth/me

GET    /api/projects                          # projects the current user belongs to
POST   /api/projects                          # create a project (auto-adds OWNER membership)
GET    /api/projects/:id                      # get project (members only)
DELETE /api/projects/:id                      # delete project (owner only, cascades)
GET    /api/projects/:id/members              # list members
POST   /api/projects/:id/members              # invite member by email (owner only)
DELETE /api/projects/:id/members/:userId      # remove member (owner only)
GET    /api/projects/:id/activity             # paginated activity feed
GET    /api/projects/:id/tasks                # list/filter/sort/search tasks (paginated)
POST   /api/projects/:id/tasks                # create task
GET    /api/projects/:id/tasks/:taskId        # get task
PATCH  /api/projects/:id/tasks/:taskId        # update task
DELETE /api/projects/:id/tasks/:taskId        # delete task (creator or owner only)
GET    /api/projects/:id/tasks/:taskId/comments
POST   /api/projects/:id/tasks/:taskId/comments

GET    /api/tasks/assigned-to-me              # tasks assigned to the current user (all projects)
GET    /api/dashboard                         # workload summary for the current user
```

## Data model

Six tables, all relationally connected:

- **User** — id, name, email, hashed password
- **Project** — id, name, ownerId (→ User)
- **Membership** — many-to-many join between User and Project. Carries a `role` (`OWNER` or `MEMBER`). A unique constraint on `(projectId, userId)` prevents duplicates.
- **Task** — belongs to a Project, has status (`TODO`/`IN_PROGRESS`/`DONE`), priority (`LOW`/`MEDIUM`/`HIGH`), optional dueDate/completedAt, an optional assignee (→ User), and a creator (→ User)
- **Comment** — belongs to a Task, has an author (→ User) and a body
- **ActivityLog** — belongs to a Project, records an actor (→ User), a type string, and a human-readable message. Types used: `TASK_CREATED`, `TASK_MOVED`, `TASK_ASSIGNED`, `MEMBER_INVITED`, `MEMBER_REMOVED`, `COMMENT_ADDED`

Deleting a Project cascades and removes its Memberships, Tasks, Comments, and ActivityLog entries automatically (`onDelete: Cascade`). Removing a Membership does not delete tasks the removed user created — it only revokes access and auto-unassigns any tasks assigned to them (done atomically in a transaction alongside the membership deletion).

Deleting a User also cascades to remove their Memberships (`onDelete: Cascade`). Tasks they were assigned to have `onDelete: SetNull` on the `assigneeId` foreign key, so those tasks remain but become unassigned.

## Authorization rules

| Action | Who can do it |
|---|---|
| View project / tasks / members / activity | Any project member |
| Create task | Any project member |
| Edit task (title, description, priority, due date, assignee, move to TODO or IN_PROGRESS) | Any project member |
| Mark task as Done | Assignee or project owner only |
| Delete task | Task creator or project owner only |
| Invite member | Project owner only |
| Remove member | Project owner only |
| Delete project | Project owner only |

## Auth and token flow

Login issues two tokens:

- **Access token** — 15-minute lifetime, returned in the JSON response body. The frontend holds it in React state only — never `localStorage` or `sessionStorage`, limiting XSS exposure.
- **Refresh token** — 7-day lifetime, set as an `httpOnly` cookie (the `secure` flag is added in production). Inaccessible to JavaScript; sent automatically by the browser on same-site requests.

Every API call attaches the access token via `Authorization: Bearer`. When a request returns `401`, `AuthContext.authedFetch` automatically calls `POST /api/auth/refresh` — which reads the httpOnly cookie, verifies it, and issues a new access token — then retries the original request once with the new token. If refresh also fails, auth state is cleared and the user is redirected to login. This happens transparently; the user never sees the expiry unless their refresh token itself has expired.

On page load, the frontend silently calls `/api/auth/refresh` to restore a session from a previous visit. If that succeeds it also calls `/api/auth/me` to hydrate the user object.

Logout calls `POST /api/auth/logout`, which clears the httpOnly cookie server-side. Access tokens are not actively invalidated on logout — they expire naturally within 15 minutes.

## WebSocket design

Socket.io runs on the same HTTP server as Express. Authentication happens at the connection handshake: the client sends its access token, the server verifies it with the same JWT secret used for REST, and rejects the connection outright if invalid.

On a successful connection, the server queries the database for every project the authenticated user currently belongs to, and joins the socket to one room per project (`project:<id>`), plus a personal room (`user:<id>`) used for cross-project notifications like task assignment. Room membership is always decided server-side from a live database query — the client never requests which rooms to join.

REST controllers are the single source of truth for all business logic. After a database write succeeds, the controller calls a thin emitter function in `emitters.js` that broadcasts the relevant event to the right room(s). There is no separate "socket version" of any business logic.

**Socket events emitted by the server:**

| Event | Room | Payload |
|---|---|---|
| `task:created` | `project:<id>` | Task object |
| `task:updated` | `project:<id>` | Updated task object |
| `task:deleted` | `project:<id>` | `{ taskId }` |
| `task:assigned-to-you` | `user:<id>` | Task object |
| `comment:added` | `project:<id>` | Comment object (includes author) |
| `member:invited` | `project:<id>` | Membership object |
| `member:removed` | `project:<id>` | `{ userId }` |

**Member invite/remove and live sockets:** When a user is invited to a project, if they already have an open socket connection the server immediately joins all their current socket instances to the new project's room — no reconnect needed. When a member is removed, the server first broadcasts `member:removed` to the project room (while they're still in it, so they receive the notification), then forcibly evicts all their socket instances from that room. This ensures REST access revocation and WebSocket eviction happen at the same moment, rather than leaving a removed member receiving live updates until their next reconnect.

**Access token expiry and sockets:** The socket connection authenticates at handshake time. If the access token expires mid-session the socket won't automatically re-authenticate, unlike REST requests which retry transparently via `authedFetch`. In practice `SocketContext` creates a new connection whenever the access token changes (the effect depends on `accessToken`), so a successful REST token refresh also triggers a socket reconnect with the new token. On reconnect, the frontend silently refetches current state via REST, recovering any events missed while disconnected.

## What was hard

Coming from an ML/AI background rather than full-stack web development, the parts that took the most care weren't the CRUD logic — they were the security and consistency details that don't have an obvious correct answer without research:

- Designing the access/refresh token split correctly: why httpOnly cookies, why not store anything in localStorage, what exactly happens at logout vs. token expiry
- Making WebSocket room membership genuinely server-authoritative rather than trusting anything the client sent
- The trickiest specific bug: ensuring a removed project member's live socket connection actually stopped receiving that project's events. REST access revokes instantly on the next request, but an already-open socket doesn't re-authenticate per event. This needed an explicit eviction step tracked through a small in-memory socket registry (`socketRegistry.js`). Getting the ordering right — broadcast the removal event first so the removed user receives it, then evict them — was non-obvious.

## Known gaps

- **No automated test suite.** All functionality was verified through manual testing (browser UI) and scripted testing (Postman for every REST endpoint, custom Node scripts for WebSocket scenarios including cross-project isolation, member eviction, and reconnect recovery).
- **Board pagination tradeoff.** The default 3-column "all statuses" view fetches up to 100 tasks and groups them client-side, because true server-side pagination doesn't map cleanly onto three simultaneous columns. A project with more than 100 tasks should use the per-status filtered view, which is fully paginated with 20 tasks per page.
- **Socket auth on token expiry.** If the access token expires and the REST refresh succeeds, `SocketContext` reconnects automatically. But if the socket's `connect_error` fires before a REST request triggers a refresh, the socket stays disconnected until the next REST call completes the refresh cycle.
- **No Docker setup.** Each service (Postgres, backend, frontend) must be started manually.

## What I'd improve with more time

- Automated test suite covering auth flows, role enforcement, and the assignment permission rules
- True per-column pagination for the board's default view
- Optimistic UI updates with rollback for a snappier feel on task moves
- Drag-and-drop for moving tasks between columns
- Docker Compose to make local setup a single command

## Where AI was used

Architecture and design discussions happened with Claude before writing any code — planning the data model, the token flow, the WebSocket room design. Cursor handled the more complex implementation work (WebSocket layer, authorization middleware chains). Kiro handled more routine CRUD implementation and bug fixes. Every piece of generated code was verified — manually through the UI, through Postman for every REST endpoint (success and error cases), and through custom scripts for WebSocket scenarios. Several real bugs were caught this way, including a missing authorization check on task deletion and a startup-time gap where a missing JWT secret would have silently signed tokens with an invalid key.
