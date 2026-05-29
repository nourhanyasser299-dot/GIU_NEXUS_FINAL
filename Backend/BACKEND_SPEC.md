# GIU Nexus — Milestone 2: Backend Technical Specification

**Version:** 1.0  
**Project:** GIU Nexus — AI Career Intelligence Platform  
**Scope:** Node.js/Express REST API serving the GIU Nexus frontend  
**Audience:** Backend developers, project managers, QA testers

---

## 1. Introduction

This document defines the complete backend implementation for GIU Nexus Milestone 2. The backend is a RESTful API built with Node.js and Express, backed by MongoDB. It serves four user roles: **Job Seeker**, **Recruiter**, **Admin**, and **Guest**. The API handles authentication, job management, application tracking, AI-powered matching, and recruiter approval workflows.

All endpoints return JSON. All protected routes require a valid JWT in the `Authorization: Bearer <token>` header.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥ 18.x |
| Framework | Express | ^4.18 |
| Database | MongoDB | ≥ 6.x |
| ODM | Mongoose | ^8.x |
| Auth | jsonwebtoken | ^9.x |
| Password hashing | bcryptjs | ^2.4 |
| Validation | express-validator | ^7.x |
| Environment | dotenv | ^16.x |
| CORS | cors | ^2.8 |
| Rate limiting | express-rate-limit | ^7.x |
| File uploads | multer | ^1.4 |
| AI integration | openai | ^4.x |
| Logging | morgan | ^1.10 |
| Dev server | nodemon | ^3.x |

---

## 3. Environment Variables

Create a `.env` file in `/Backend/`. **Never commit this file.**

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/giu_nexus

# Authentication
JWT_SECRET=your_jwt_secret_minimum_32_chars
JWT_EXPIRES_IN=7d

# AI Service
OPENAI_API_KEY=sk-...

# File Upload
MAX_FILE_SIZE_MB=5
UPLOAD_DIR=uploads/

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## 4. Folder Structure

```
Backend/
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── env.js             # Validated env variable exports
│   │
│   ├── models/
│   │   ├── User.js            # Base user schema (all roles)
│   │   ├── Job.js             # Job listing schema
│   │   ├── Application.js     # Job application schema
│   │   └── RecruiterProfile.js # Recruiter company details + approval status
│   │
│   ├── routes/
│   │   ├── auth.routes.js     # /api/auth/*
│   │   ├── jobs.routes.js     # /api/jobs/*
│   │   ├── applications.routes.js  # /api/applications/*
│   │   ├── seeker.routes.js   # /api/seeker/*
│   │   ├── recruiter.routes.js # /api/recruiter/*
│   │   └── admin.routes.js    # /api/admin/*
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── jobs.controller.js
│   │   ├── applications.controller.js
│   │   ├── seeker.controller.js
│   │   ├── recruiter.controller.js
│   │   └── admin.controller.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js  # JWT verification
│   │   ├── role.middleware.js  # Role-based access control
│   │   ├── validate.middleware.js # express-validator error handler
│   │   └── upload.middleware.js   # multer config
│   │
│   ├── services/
│   │   ├── ai.service.js      # OpenAI skill extraction + match scoring
│   │   └── match.service.js   # Match score calculation logic
│   │
│   ├── utils/
│   │   ├── apiResponse.js     # Standardized response helpers
│   │   └── errors.js          # Custom error classes
│   │
│   └── app.js                 # Express app setup (no listen)
│
├── uploads/                   # CV/resume file storage (gitignored)
├── .env                       # Environment variables (gitignored)
├── .env.example               # Template for .env
├── .gitignore
├── package.json
├── server.js                  # Entry point — calls app.listen
└── BACKEND_SPEC.md            # This document
```

---

## 5. Data Models

### 5.1 User

```js
{
  _id: ObjectId,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },        // bcrypt hash
  role: { type: String, enum: ['seeker', 'recruiter', 'admin'], required: true },
  name: { type: String, required: true },
  createdAt: Date,
  updatedAt: Date
}
```

### 5.2 Job

```js
{
  _id: ObjectId,
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: { type: String, required: true },
  type: { type: String, enum: ['full-time', 'part-time', 'remote', 'hybrid', 'on-site'] },
  category: String,
  description: String,
  requirements: [String],
  salary: { min: Number, max: Number, currency: String },
  postedBy: { type: ObjectId, ref: 'User', required: true },  // recruiter
  status: { type: String, enum: ['active', 'closed', 'draft'], default: 'active' },
  applicantCount: { type: Number, default: 0 },
  createdAt: Date,
  updatedAt: Date
}
```

### 5.3 Application

```js
{
  _id: ObjectId,
  job: { type: ObjectId, ref: 'Job', required: true },
  applicant: { type: ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['applied', 'screening', 'interview', 'offer', 'rejected'],
    default: 'applied'
  },
  cvUrl: String,                    // path to uploaded file
  coverLetter: String,
  matchScore: { type: Number, min: 0, max: 100 },
  extractedSkills: [String],        // AI-extracted from CV
  missingKeywords: [String],        // AI-identified gaps
  createdAt: Date,
  updatedAt: Date
}
```

### 5.4 RecruiterProfile

```js
{
  _id: ObjectId,
  user: { type: ObjectId, ref: 'User', unique: true, required: true },
  company: { type: String, required: true },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: { type: ObjectId, ref: 'User' },   // admin who approved
  approvedAt: Date,
  createdAt: Date
}
```

---

## 6. API Endpoints

Base URL: `/api`

### 6.1 Authentication — `/api/auth`

#### POST `/api/auth/register`
Register a new user.

**Request body:**
```json
{
  "name": "string (required)",
  "email": "string (required, valid email)",
  "password": "string (required, min 8 chars)",
  "role": "seeker | recruiter (required)"
}
```

**Business rules:**
- Email must be unique across all users.
- Password is hashed with bcrypt (salt rounds: 12) before storage.
- Recruiter accounts are created with `approvalStatus: 'pending'` — they cannot post jobs until approved.
- Admin accounts cannot be self-registered; they are seeded or created by existing admins.

**Success response `201`:**
```json
{
  "success": true,
  "token": "JWT string",
  "user": { "id": "...", "name": "...", "email": "...", "role": "..." }
}
```

**Error responses:** `400` validation error, `409` email already exists.

---

#### POST `/api/auth/login`
Authenticate an existing user.

**Request body:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Business rules:**
- Compare submitted password against bcrypt hash.
- Return the same token shape as register.
- Do not reveal whether the email exists or the password is wrong — return a generic `401` for both.

**Success response `200`:**
```json
{
  "success": true,
  "token": "JWT string",
  "user": { "id": "...", "name": "...", "email": "...", "role": "..." }
}
```

**Error responses:** `400` validation error, `401` invalid credentials.

---

#### GET `/api/auth/me`
Return the authenticated user's profile.

**Auth required:** Yes (any role)

**Success response `200`:**
```json
{
  "success": true,
  "user": { "id": "...", "name": "...", "email": "...", "role": "..." }
}
```

---

### 6.2 Jobs — `/api/jobs`

#### GET `/api/jobs`
List all active jobs. Supports filtering and search.

**Auth required:** No (public)

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Full-text search on title, company, description |
| `category` | string | Filter by category |
| `type` | string | Filter by job type |
| `location` | string | Filter by location |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |

**Success response `200`:**
```json
{
  "success": true,
  "data": [ /* array of job objects */ ],
  "pagination": { "page": 1, "limit": 10, "total": 47, "pages": 5 }
}
```

---

#### GET `/api/jobs/:id`
Get a single job by ID.

**Auth required:** No (public)

**Success response `200`:**
```json
{ "success": true, "data": { /* job object */ } }
```

**Error responses:** `404` job not found.

---

#### POST `/api/jobs`
Create a new job listing.

**Auth required:** Yes — role: `recruiter` with `approvalStatus: 'approved'`

**Request body:**
```json
{
  "title": "string (required)",
  "company": "string (required)",
  "location": "string (required)",
  "type": "full-time | part-time | remote | hybrid | on-site (required)",
  "category": "string",
  "description": "string (required)",
  "requirements": ["string"],
  "salary": { "min": 0, "max": 0, "currency": "USD" }
}
```

**Business rules:**
- `postedBy` is set automatically from the authenticated user's ID.
- Unapproved recruiters receive `403`.

**Success response `201`:**
```json
{ "success": true, "data": { /* created job object */ } }
```

---

#### PUT `/api/jobs/:id`
Update a job listing.

**Auth required:** Yes — role: `recruiter`, must own the job

**Business rules:**
- Only the recruiter who created the job can update it.
- Cannot change `postedBy`.

**Success response `200`:**
```json
{ "success": true, "data": { /* updated job object */ } }
```

**Error responses:** `403` not the owner, `404` job not found.

---

#### DELETE `/api/jobs/:id`
Delete a job listing.

**Auth required:** Yes — role: `recruiter` (owner) or `admin`

**Success response `200`:**
```json
{ "success": true, "message": "Job deleted" }
```

---

### 6.3 Applications — `/api/applications`

#### POST `/api/applications`
Submit a job application.

**Auth required:** Yes — role: `seeker`

**Request body (multipart/form-data):**
| Field | Type | Required |
|-------|------|----------|
| `jobId` | string | Yes |
| `coverLetter` | string | No |
| `cv` | file (PDF/DOCX, max 5MB) | Yes |

**Business rules:**
- A seeker cannot apply to the same job twice. Return `409` if duplicate.
- On submission, trigger `ai.service.js` to extract skills from the CV and compute a match score against the job's requirements. Store results in `extractedSkills` and `matchScore`.
- Increment `job.applicantCount` by 1.

**Success response `201`:**
```json
{
  "success": true,
  "data": {
    "applicationId": "...",
    "matchScore": 87,
    "extractedSkills": ["React", "TypeScript"],
    "missingKeywords": ["WebGL"]
  }
}
```

**Error responses:** `400` validation, `404` job not found, `409` already applied.

---

#### GET `/api/applications/my`
Get all applications submitted by the authenticated seeker.

**Auth required:** Yes — role: `seeker`

**Success response `200`:**
```json
{
  "success": true,
  "data": [ /* array of application objects with populated job */ ]
}
```

---

#### GET `/api/applications/job/:jobId`
Get all applications for a specific job.

**Auth required:** Yes — role: `recruiter` (must own the job) or `admin`

**Success response `200`:**
```json
{
  "success": true,
  "data": [ /* array of application objects with populated applicant */ ]
}
```

---

#### PATCH `/api/applications/:id/status`
Update the status of an application (move through pipeline).

**Auth required:** Yes — role: `recruiter` (must own the job) or `admin`

**Request body:**
```json
{ "status": "screening | interview | offer | rejected" }
```

**Business rules:**
- Status transitions must follow the pipeline order: `applied → screening → interview → offer | rejected`.
- Skipping stages is not allowed (e.g., cannot go from `applied` directly to `offer`).

**Success response `200`:**
```json
{ "success": true, "data": { /* updated application */ } }
```

**Error responses:** `400` invalid status transition, `403` not authorized.

---

### 6.4 Seeker Dashboard — `/api/seeker`

#### GET `/api/seeker/recommendations`
Get AI-ranked job recommendations for the authenticated seeker.

**Auth required:** Yes — role: `seeker`

**Business rules:**
- Fetch the seeker's most recent CV skills from their latest application.
- Score all active jobs against those skills using `match.service.js`.
- Return top 10 sorted by match score descending.
- If no applications exist yet, return the 10 most recently posted active jobs.

**Success response `200`:**
```json
{
  "success": true,
  "data": [
    { "job": { /* job object */ }, "matchScore": 94 },
    { "job": { /* job object */ }, "matchScore": 88 }
  ]
}
```

---

#### GET `/api/seeker/stats`
Get application statistics for the authenticated seeker.

**Auth required:** Yes — role: `seeker`

**Success response `200`:**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "byStatus": {
      "applied": 6,
      "screening": 3,
      "interview": 2,
      "offer": 1,
      "rejected": 0
    }
  }
}
```

---

### 6.5 Recruiter Dashboard — `/api/recruiter`

#### GET `/api/recruiter/jobs`
Get all jobs posted by the authenticated recruiter.

**Auth required:** Yes — role: `recruiter`

**Success response `200`:**
```json
{ "success": true, "data": [ /* array of job objects */ ] }
```

---

#### GET `/api/recruiter/pipeline`
Get the full application pipeline for all of the recruiter's jobs.

**Auth required:** Yes — role: `recruiter`

**Success response `200`:**
```json
{
  "success": true,
  "data": {
    "applied": [ /* applications */ ],
    "screening": [ /* applications */ ],
    "interview": [ /* applications */ ],
    "offer": [ /* applications */ ]
  }
}
```

---

### 6.6 Admin — `/api/admin`

#### GET `/api/admin/stats`
Get platform-wide statistics.

**Auth required:** Yes — role: `admin`

**Success response `200`:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 12450,
    "activeJobs": 843,
    "totalApplications": 5621,
    "pendingRecruiters": 3
  }
}
```

---

#### GET `/api/admin/recruiters/pending`
Get all recruiter accounts awaiting approval.

**Auth required:** Yes — role: `admin`

**Success response `200`:**
```json
{
  "success": true,
  "data": [ /* array of RecruiterProfile objects with populated user */ ]
}
```

---

#### PATCH `/api/admin/recruiters/:userId/approve`
Approve a recruiter account.

**Auth required:** Yes — role: `admin`

**Business rules:**
- Sets `approvalStatus: 'approved'`, records `approvedBy` and `approvedAt`.
- After approval, the recruiter can post jobs.

**Success response `200`:**
```json
{ "success": true, "message": "Recruiter approved" }
```

---

#### PATCH `/api/admin/recruiters/:userId/reject`
Reject a recruiter account.

**Auth required:** Yes — role: `admin`

**Request body:**
```json
{ "reason": "string (optional)" }
```

**Success response `200`:**
```json
{ "success": true, "message": "Recruiter rejected" }
```

---

#### DELETE `/api/admin/users/:userId`
Delete any user account.

**Auth required:** Yes — role: `admin`

**Business rules:**
- Deleting a recruiter also deletes all their job listings and associated applications.
- Deleting a seeker also deletes all their applications.
- Use Mongoose middleware (`pre('deleteOne')`) to cascade deletes.

**Success response `200`:**
```json
{ "success": true, "message": "User deleted" }
```

---

## 7. Middleware

### 7.1 `auth.middleware.js` — JWT Verification

```js
// Attach req.user = { id, role } on every protected route
// Return 401 if token missing or invalid
// Return 401 if token expired
```

### 7.2 `role.middleware.js` — Role-Based Access Control

```js
// Usage: router.get('/admin/stats', auth, role('admin'), controller)
// Returns 403 if req.user.role is not in the allowed list
```

### 7.3 `validate.middleware.js` — Input Validation

```js
// Runs express-validator's validationResult
// Returns 400 with array of field errors if validation fails
// Format: { success: false, errors: [{ field: "email", message: "..." }] }
```

### 7.4 `upload.middleware.js` — File Uploads

```js
// multer config: disk storage, destination: uploads/cvs/
// Allowed MIME types: application/pdf, application/msword,
//   application/vnd.openxmlformats-officedocument.wordprocessingml.document
// Max file size: process.env.MAX_FILE_SIZE_MB * 1024 * 1024
// Field name: 'cv'
```

---

## 8. AI Service

### `ai.service.js`

Two functions called during application submission:

**`extractSkills(cvFilePath)`**
- Read the CV file text (use `pdf-parse` for PDFs).
- Send to OpenAI with a prompt: "Extract a list of technical and professional skills from this CV. Return as a JSON array of strings."
- Return `string[]`.

**`computeMatchScore(extractedSkills, jobRequirements)`**
- Compare extracted skills against job requirements array.
- Score = (matched skills / total job requirements) × 100, rounded to nearest integer.
- Also return `missingKeywords` = job requirements not found in extracted skills.
- Return `{ score: number, missingKeywords: string[] }`.

**Fallback:** If OpenAI call fails, log the error and return `{ score: 0, missingKeywords: [] }` — do not block the application submission.

---

## 9. Standardized API Response Format

All responses use this shape via `utils/apiResponse.js`:

```js
// Success
res.status(200).json({ success: true, data: payload })
res.status(201).json({ success: true, data: payload })

// Error
res.status(400).json({ success: false, message: "Validation failed", errors: [...] })
res.status(401).json({ success: false, message: "Authentication required" })
res.status(403).json({ success: false, message: "Insufficient permissions" })
res.status(404).json({ success: false, message: "Resource not found" })
res.status(409).json({ success: false, message: "Conflict: resource already exists" })
res.status(500).json({ success: false, message: "Internal server error" })
```

---

## 10. Error Handling

### HTTP Status Code Reference

| Code | Meaning | When to use |
|------|---------|-------------|
| 200 | OK | Successful GET, PUT, PATCH, DELETE |
| 201 | Created | Successful POST that creates a resource |
| 400 | Bad Request | Validation errors, malformed input |
| 401 | Unauthorized | Missing or invalid JWT |
| 403 | Forbidden | Valid JWT but insufficient role/ownership |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate email, duplicate application |
| 422 | Unprocessable | Business rule violation (e.g., invalid status transition) |
| 500 | Server Error | Unhandled exceptions |

### Global Error Handler

Add as the last middleware in `app.js`:

```js
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});
```

---

## 11. Setup Instructions

```bash
# 1. Navigate to backend directory
cd /home/husseinselim/Documents/Nourhan_Project/Backend

# 2. Initialize package.json
npm init -y

# 3. Install production dependencies
npm install express mongoose jsonwebtoken bcryptjs express-validator \
  dotenv cors express-rate-limit multer openai morgan pdf-parse

# 4. Install development dependencies
npm install --save-dev nodemon

# 5. Add scripts to package.json
# "start": "node server.js"
# "dev": "nodemon server.js"

# 6. Copy .env.example to .env and fill in values
cp .env.example .env

# 7. Start MongoDB (local)
mongod --dbpath /data/db

# 8. Start development server
npm run dev
```

---

## 12. Business Rules Summary

| Rule | Enforcement point |
|------|------------------|
| Passwords hashed with bcrypt (rounds: 12) | `auth.controller.js` register |
| JWT never reveals whether email exists | `auth.controller.js` login |
| Recruiters cannot post jobs until approved | `role.middleware.js` + `recruiter.middleware.js` |
| Seekers cannot apply to the same job twice | `applications.controller.js` duplicate check |
| Application status must follow pipeline order | `applications.controller.js` status update |
| Only job owner or admin can update/delete jobs | `jobs.controller.js` ownership check |
| Only recruiter owner or admin can view/update applications | `applications.controller.js` ownership check |
| Deleting a user cascades to their jobs and applications | Mongoose `pre` hooks on User model |
| AI failure does not block application submission | `ai.service.js` try/catch with fallback |
| File uploads limited to PDF/DOCX, max 5MB | `upload.middleware.js` |

---

## 13. Submission Guidelines

**Branch naming:** `feature/backend-milestone-2`

**Before submitting a PR:**
1. All endpoints return the standardized response format.
2. All protected routes are tested with valid and invalid tokens.
3. Role-based access is tested for each role (seeker, recruiter, admin).
4. Duplicate application returns `409`, not `500`.
5. File upload rejects non-PDF/DOCX files with `400`.
6. AI service failure does not crash the application submission flow.
7. No `.env` file committed — only `.env.example`.
8. `uploads/` directory is in `.gitignore`.

**Code review checklist:**
- No raw `console.log` in production paths (use `morgan` for request logging).
- No hardcoded secrets or connection strings.
- All async route handlers wrapped in try/catch or use an async wrapper utility.
- Mongoose queries use `.lean()` where full document methods are not needed (performance).
