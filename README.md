# ⚡ PulseBoard AI

> **Jira tells you what's happening. PulseBoard tells you what to do next.**

A production-grade, AI-native project management platform built with Node.js, React, PostgreSQL, Redis, Socket.IO, LangGraph, and Docker. Not a tutorial project — a real system with real engineering decisions.

---

## 🚀 Live Demo

> Coming soon — deploying to Railway

---

## 🧠 The Problem

Software teams waste hours on:
- **Manual sprint planning** — guessing story points, ignoring velocity data
- **Stale Kanban boards** — refreshing to see teammate updates
- **Slow code reviews** — waiting days for human reviewer to check obvious bugs
- **No visibility** — nobody knows who's blocked or why

PulseBoard fixes all four.

---

## ⚡ Features

### 🤖 AI Sprint Planner (LangGraph Multi-Agent)
4 specialised agents in a directed graph:
- **Velocity Analyser** — reads past sprint data, calculates team capacity
- **Task Estimator** — uses Claude API to estimate story points per task
- **Sprint Builder** — creates balanced sprint plan respecting team capacity
- **Conflict Checker** — validates plan, loops back if any developer is overloaded

Conditional edges + human-in-the-loop checkpoint before saving to database.

### 📋 Real-time Kanban Board
- Drag and drop tasks between columns — Todo, In Progress, Review, Done
- WebSocket broadcasts updates to all viewers instantly — no refresh needed
- Redis pub/sub adapter scales across multiple Node instances
- Optimistic UI updates with server reconciliation

### 🔍 AI PR Reviewer
- GitHub webhook triggers automatically when PR is opened
- Code diff sent to Claude API for line-level analysis
- Severity-scored review (high/medium/low) posted as GitHub comments within 30 seconds
- Runs as BullMQ background job — never blocks main server thread

### 🛡️ Rate Limiting
- Redis sliding window algorithm using atomic Lua scripts
- Prevents brute force attacks on auth endpoints
- O(log N) time complexity, zero race conditions under concurrent load
- 5 req/min on auth, 100 req/min on API — configurable per route

### 📊 Analytics Engine
- Team velocity tracking per sprint
- Individual contribution metrics
- Automatic blocker detection — flags tasks stuck for more than 3 days
- Redis cache-aside pattern — analytics P95 response time: 4ms
- Cache invalidation on every write operation

### 🔔 Notification Queue
- BullMQ async job processing backed by Redis
- WebSocket delivery if user is online, PostgreSQL storage if offline
- Exponential backoff retry on failure (1s → 2s → 4s)
- Dead letter queue for permanently failed jobs

### 💬 Real-time Comments
- Comment threads on every task
- Socket.IO room-based broadcasting to task viewers
- Edit and delete with ownership verification
- Comment notifications via BullMQ queue

### 🏃 Sprint System
- Full lifecycle: planning → active → completed
- Story point tracking and team velocity calculation
- Burndown data generation per sprint
- Velocity history feeds AI sprint planner

### 🔗 Invite Link System
- Cryptographically secure tokens via `crypto.randomBytes(32)`
- 7-day expiry TTL stored in PostgreSQL
- Auto-join workspace on link click
- WebSocket notification to workspace on member join

### 🔐 JWT Auth + RBAC
- bcrypt password hashing with 12 salt rounds
- JWT tokens with 7-day expiry
- Role-based access: Owner, Admin, Member
- Auth middleware enforces permissions on every protected route

### 🐳 Docker Compose
- 3 containers: Node.js backend, PostgreSQL, Redis
- Health checks ensure DB and Redis ready before backend starts
- Volume persistence for data across restarts
- Single command deployment: `docker-compose up`

---

## 🏗️ Architecture

┌─────────────────────────────────────────────────────────┐

│                    React Frontend                         │

│          Login · Dashboard · Kanban · Workspace           │

│              Socket.IO Client · Axios                     │

└──────────────────────┬──────────────────────────────────┘

          │ HTTP REST + WebSocket

┌──────────────────────▼──────────────────────────────────┐

│               Node.js + Express Backend                   │

│                                                           │

│  ┌───────────┐  ┌────────────┐  ┌──────────────────┐    │

│  │  Routes   │  │ Middleware │  │   Controllers    │    │

│  │  /auth    │  │  JWT Auth  │  │  Auth · Task     │    │

│  │  /tasks   │  │  Rate Limit│  │  Workspace · AI  │    │

│  │  /ai      │  │  Helmet    │  │  Analytics · etc │    │

│  │  /webhooks│  │  CORS      │  │                  │    │

│  └───────────┘  └────────────┘  └──────────────────┘    │

│                                                           │

│  ┌────────────────────────────────────────────────────┐  │

│  │                Socket.IO Server                     │  │

│  │      Project rooms · Workspace rooms · Presence     │  │

│  └────────────────────────────────────────────────────┘  │

└────────────┬──────────────┬──────────────┬──────────────┘

           │              │              │

┌────────────▼───┐  ┌───────▼──────┐  ┌───▼────────────┐

│   PostgreSQL   │  │    Redis      │  │  BullMQ Workers│

│                │  │               │  │                │

│  users         │  │  Rate limiter │  │  Notification  │

│  workspaces    │  │  Analytics    │  │  PR Review     │

│  projects      │  │  cache (TTL)  │  │  AI Sprint     │

│  tasks         │  │  Pub/Sub      │  │                │

│  sprints       │  │  BullMQ store │  │  Retry + DLQ   │

│  comments      │  └───────────────┘  └────────────────┘

│  notifications │

└────────────────┘

│

┌────────────▼────────────────────────────────────────────┐

│                  LangGraph AI Engine                      │

│                                                           │

│   velocityAnalyser ──► taskEstimator                     │

│          │                   │                            │

│          └──────► sprintBuilder ──► conflictChecker      │

│                        ▲                   │              │

│                        │ (if conflicts)     │ (if valid)  │

│                        └───────────────────┘              │

│                                    │                      │

│                          humanCheckpoint                  │

│                                    │                      │

│                            save to database               │

└───────────────────────────────────────────────────────────┘

---

## 🧪 Load Test Results

Tested with k6 simulating **200 concurrent users** over 5.5 minutes:

| Metric | Result | Threshold |
|--------|--------|-----------|
| Total requests | 95,943 | — |
| Failed requests | 0 | — |
| Failure rate | 0.00% | < 5% ✅ |
| Avg response time | 4ms | — |
| P95 response time | 10ms | < 500ms ✅ |
| Peak throughput | 290 req/sec | — |
| Error rate | 0.00% | < 10% ✅ |

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Node.js + Express | Non-blocking I/O for high concurrency |
| Frontend | React 18 | Component-based UI with hooks |
| Database | PostgreSQL | ACID compliance, foreign keys, UUID PKs |
| Cache | Redis | Microsecond latency for rate limiting and analytics |
| Queue | BullMQ | Persistent async jobs with retry and DLQ |
| Real-time | Socket.IO | WebSocket with fallback, room-based broadcasting |
| AI Agents | LangGraph + Claude API | Multi-agent orchestration with conditional edges |
| Auth | JWT + bcrypt | Stateless auth, O(1) verification |
| DevOps | Docker + Docker Compose | Reproducible environments, one command deploy |
| Load Testing | k6 | Realistic concurrent user simulation |
| Rate Limiting | Redis Lua | Atomic sliding window, zero race conditions |

---

## 📁 Project Structure

PULSEBOARD AI/

├── src/

│   ├── ai/

│   │   ├── sprintPlanner.js     ← LangGraph 4-agent system

│   │   └── prReviewer.js        ← Claude API PR reviewer

│   ├── config/

│   │   ├── database.js          ← PostgreSQL connection pool

│   │   ├── redis.js             ← Redis + BullMQ connections

│   │   └── migrate.js           ← Database schema migrations

│   ├── controllers/

│   │   ├── authController.js    ← Register, login

│   │   ├── workspaceController.js

│   │   ├── projectController.js

│   │   ├── taskController.js    ← Kanban CRUD + WebSocket

│   │   ├── sprintController.js  ← Sprint lifecycle + velocity

│   │   ├── analyticsController.js ← Redis cached analytics

│   │   ├── notificationController.js

│   │   ├── commentController.js

│   │   ├── webhookController.js ← GitHub webhook handler

│   │   └── aiController.js      ← LangGraph trigger

│   ├── middleware/

│   │   ├── authMiddleware.js    ← JWT verification

│   │   └── rateLimiter.js       ← Redis Lua sliding window

│   ├── queues/

│   │   ├── notificationQueue.js ← BullMQ producer

│   │   └── notificationWorker.js ← BullMQ consumer

│   ├── routes/

│   │   ├── authRoutes.js

│   │   ├── workspaceRoutes.js

│   │   ├── projectRoutes.js

│   │   ├── taskRoutes.js

│   │   ├── sprintRoutes.js

│   │   ├── analyticsRoutes.js

│   │   ├── notificationRoutes.js

│   │   ├── commentRoutes.js

│   │   ├── webhookRoutes.js

│   │   └── aiRoutes.js

│   ├── app.js                   ← Express app setup

│   └── server.js                ← HTTP + Socket.IO server

├── frontend/                    ← React application

│   └── src/

│       ├── api/                 ← Axios API layer

│       ├── context/             ← Auth context

│       ├── hooks/               ← useSocket hook

│       └── pages/

│           ├── Login.js         ← Thanos theme + 12 stones

│           ├── Register.js

│           ├── Dashboard.js     ← Marvel loading + cinematic

│           ├── WorkspacePage.js ← Projects + members

│           └── ProjectPage.js   ← Kanban board + drag drop

├── k6-load-test.js              ← Load testing script

├── Dockerfile

├── docker-compose.yml

├── .env.example

└── README.md

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker Desktop

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/Bhavgulati/Pulseboard.git
cd Pulseboard

cp .env.example .env
# Add your ANTHROPIC_API_KEY and GITHUB_TOKEN to .env

docker-compose up
```

Then run migrations:
```bash
docker exec pulseboard-backend node src/config/migrate.js
```

Visit `http://localhost:5000/health` ✅

### Option 2 — Manual

```bash
# Start databases
docker run --name pulseboard-db \
  -e POSTGRES_USER=pulse_user \
  -e POSTGRES_PASSWORD=pulse_pass \
  -e POSTGRES_DB=pulseboard \
  -p 5432:5432 -d postgres

docker run --name pulseboard-redis -p 6379:6379 -d redis

# Backend
npm install
node src/config/migrate.js
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm start
```

---

## 🔑 Environment Variables

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=pulseboard
DB_USER=pulse_user
DB_PASSWORD=pulse_pass

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=your_jwt_secret_here

ANTHROPIC_API_KEY=your_anthropic_api_key
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, get JWT |

### Workspaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | Get my workspaces |
| POST | `/api/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace + members |
| POST | `/api/workspaces/:id/invite-link` | Generate invite link |
| POST | `/api/workspaces/join/:token` | Join via invite |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects/workspace/:id` | List projects |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/project/:id` | Get Kanban board |
| PATCH | `/api/tasks/:id/status` | Move between columns |
| PATCH | `/api/tasks/:id` | Update task details |
| DELETE | `/api/tasks/:id` | Delete task |

### Sprints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sprints` | Create sprint |
| GET | `/api/sprints/project/:id` | List sprints |
| GET | `/api/sprints/:id` | Sprint + tasks + metrics |
| POST | `/api/sprints/:id/tasks` | Add task to sprint |
| GET | `/api/sprints/velocity/:projectId` | Team velocity data |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/sprint-plan` | Trigger AI sprint planner (async) |
| POST | `/api/webhooks/github` | GitHub PR webhook receiver |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/workspace/:id` | Workspace overview |
| GET | `/api/analytics/project/:id` | Project deep dive |
| GET | `/api/analytics/me/:workspaceId` | Personal metrics |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all read |

---

## 🎯 Design Patterns

| Pattern | Implementation |
|---------|---------------|
| Observer | WebSocket event system, BullMQ notifications |
| Strategy | Task priority assignment, sprint planning |
| Factory | LangGraph agent node creation |
| Repository | Database access abstraction |
| State Machine | Task lifecycle (todo→in_progress→review→done) |
| Cache-Aside | Redis analytics caching with TTL invalidation |
| Circuit Breaker | BullMQ exponential backoff + dead letter queue |
| Pub/Sub | Redis adapter for Socket.IO horizontal scaling |

---

## 🔌 WebSocket Events

### Client → Server
```javascript
socket.emit('join_project', projectId)
socket.emit('join_workspace', workspaceId)
socket.emit('join_task', taskId)
socket.emit('user_online', { workspaceId, userId, name })
```

### Server → Client
```javascript
socket.on('task_created', ({ task }))
socket.on('task_status_updated', ({ taskId, newStatus, task }))
socket.on('task_updated', ({ task }))
socket.on('task_deleted', ({ taskId }))
socket.on('comment_added', ({ comment }))
socket.on('member_joined', ({ workspaceId, userId }))
```

---

## 🧠 LangGraph Agent Flow

```javascript
// 4 agents, conditional edges, human checkpoint
velocityAnalyser → taskEstimator → sprintBuilder → conflictChecker
                                          ↑                │
                                          │ (if conflicts) │ (if valid)
                                          └────────────────┘
                                                    │
                                          humanCheckpoint → END
```

**Agent responsibilities:**
1. `velocityAnalyser` — queries last 5 sprints, calculates avg velocity
2. `taskEstimator` — Claude API estimates story points for unestimated tasks
3. `sprintBuilder` — Claude API builds balanced plan within velocity budget
4. `conflictChecker` — validates no developer exceeds capacity, loops if needed

---

## 📊 Database Schema

```sql
users          (id, name, email, password, role, avatar_url)
workspaces     (id, name, description, owner_id, invite_token)
workspace_members (id, workspace_id, user_id, role)
projects       (id, workspace_id, name, description, status)
tasks          (id, project_id, sprint_id, title, description,
                status, priority, assignee_id, story_points)
sprints        (id, project_id, name, goal, status,
                start_date, end_date)
comments       (id, task_id, user_id, content, edited)
notifications  (id, user_id, type, title, message, data, read)
```

---

## 👨‍💻 Built By

**Bhavishya Gulati**
B.Tech Electronics & Communication Engineering
NIT Allahabad — Class of 2027

---

## 📄 License

MIT — feel free to use for learning and reference.