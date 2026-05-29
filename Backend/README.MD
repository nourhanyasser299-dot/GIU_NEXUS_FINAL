# GIU Nexus — Backend API

Node.js/Express REST API for the GIU Nexus AI Career Intelligence Platform.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Start development server (requires MongoDB running)
npm run dev
```

## Structure

```
src/
├── config/       # DB connection
├── models/       # Mongoose schemas (User, Job, Application, RecruiterProfile)
├── routes/       # Express routers
├── controllers/  # Request handlers
├── middleware/   # auth, role, validate, upload
├── services/     # AI skill extraction + match scoring
└── utils/        # apiResponse helpers, custom errors
```

## API Base URL

`http://localhost:5000/api`

## Key Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /auth/register | No | Register seeker or recruiter |
| POST | /auth/login | No | Login, receive JWT |
| GET | /auth/me | Any | Get current user |
| GET | /jobs | No | List active jobs (search + filter) |
| POST | /jobs | Recruiter (approved) | Create job listing |
| POST | /applications | Seeker | Apply with CV upload |
| GET | /applications/my | Seeker | View own applications |
| PATCH | /applications/:id/status | Recruiter/Admin | Move pipeline stage |
| GET | /seeker/recommendations | Seeker | AI-ranked job matches |
| GET | /seeker/stats | Seeker | Application status counts |
| GET | /recruiter/pipeline | Recruiter | Full hiring pipeline |
| GET | /admin/stats | Admin | Platform statistics |
| PATCH | /admin/recruiters/:id/approve | Admin | Approve recruiter |
| DELETE | /admin/users/:id | Admin | Delete user (cascades) |

## Full Specification

See [BACKEND_SPEC.md](./BACKEND_SPEC.md) for complete endpoint definitions, business rules, error codes, and submission guidelines.
