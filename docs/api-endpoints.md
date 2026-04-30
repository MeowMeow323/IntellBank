# IntellBank – API Endpoints Reference

Base URL: `http://localhost:8080`

All endpoints (except `/api/auth/**`) require JWT in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Authentication

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login and get JWT token | Public |
| GET | `/api/auth/me` | Get current user info | ALL |

### POST /api/auth/register
**Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secret123",
  "fullName": "John Doe",
  "role": "STUDENT"
}
```

### POST /api/auth/login
**Body:**
```json
{ "username": "john_doe", "password": "secret123" }
```
**Response:**
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

---

## Projects

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/projects` | Get all projects for current user | ALL |
| POST | `/api/projects` | Create a project | ALL |
| GET | `/api/projects/{projectId}` | Get project by ID | ALL |
| PUT | `/api/projects/{projectId}` | Update project | OWNER |
| DELETE | `/api/projects/{projectId}` | Delete project | OWNER, ADMIN |

---

## Workspace Tabs

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/workspace/{projectId}/tabs` | Get all tabs for a project | ALL |
| POST | `/api/workspace/tabs` | Create a new tab | ALL |
| PUT | `/api/workspace/tabs/{tabId}` | Update tab content | ALL |
| DELETE | `/api/workspace/tabs/{tabId}` | Delete a tab | ALL |
| PUT | `/api/workspace/tabs/{tabId}/active` | Set tab as active | ALL |

---

## Documents

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/documents/upload` | Upload a document (multipart/form-data) | ALL |
| GET | `/api/documents/{documentId}` | Get document metadata | ALL |
| GET | `/api/documents/project/{projectId}` | Get all docs for a project | ALL |
| POST | `/api/documents/{documentId}/process` | Trigger AI processing | ALL |

---

## Questions

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/questions` | Get all questions | ALL |
| GET | `/api/questions/{questionId}` | Get question by ID | ALL |
| POST | `/api/questions` | Create a question | EDUCATOR, ADMIN |
| PUT | `/api/questions/{questionId}` | Update a question | EDUCATOR, ADMIN |
| DELETE | `/api/questions/{questionId}` | Delete a question | ADMIN |
| GET | `/api/questions/by-topic?topic=X` | Filter by topic | ALL |
| GET | `/api/questions/by-subject?subject=X` | Filter by subject | ALL |

---

## Verification

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/verification/pending` | Get all pending questions | EDUCATOR, ADMIN |
| GET | `/api/verification/{questionId}` | Get question for review | EDUCATOR, ADMIN |
| PUT | `/api/verification/{questionId}/approve` | Approve a question | EDUCATOR, ADMIN |
| PUT | `/api/verification/{questionId}/reject` | Reject a question | EDUCATOR, ADMIN |
| PUT | `/api/verification/{questionId}/edit` | Edit and approve question | EDUCATOR, ADMIN |

---

## Analytics

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/analytics/topic-frequency` | Topic frequency data | ALL |
| GET | `/api/analytics/yearly-trends` | Year-by-year trends | ALL |
| GET | `/api/analytics/high-priority-topics` | High priority topics | ALL |
| GET | `/api/analytics/predicted-topics` | AI-predicted upcoming topics | ALL |

---

## Exam Simulator

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/exams/generate` | Generate a new exam | ALL |
| GET | `/api/exams/{examId}` | Get exam by ID | ALL |
| GET | `/api/exams/user/{userId}` | Get all exams for a user | ALL |
| POST | `/api/exams/{examId}/submit` | Submit exam attempt | STUDENT |

---

## AI Gateway (proxied to Python FastAPI)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/extract-text` | Extract text from document |
| POST | `/api/ai/classify-question` | Classify a question topic |
| POST | `/api/ai/predict-topics` | Predict upcoming exam topics |
| POST | `/api/ai/generate-question` | Generate questions using fine-tuned model |
| POST | `/api/ai/generate-solution` | Generate solutions |
