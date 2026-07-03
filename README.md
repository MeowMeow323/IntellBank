# IntellBank — Intelligent Educational Question Bank

IntellBank is a full‑stack platform for exam practice and educator analytics. Students
practise on AI‑generated exam papers; educators grade them and the system turns every
graded paper into a per‑topic **weakness profile** for each student and for the whole
class; admins control which subjects each educator handles.

---

## Architecture

Three runnable services plus a cloud database. **The frontend only ever talks to the
Spring Boot backend** — Spring Boot is the single gateway that owns the database and is
the only caller of the Python AI service. The browser never calls Supabase or the AI
service directly.

```
React (Vite) SPA  ──Axios──►  Spring Boot API (gateway)  ──►  Supabase PostgreSQL + Storage
   :5173                            :8080                  └─►  Python FastAPI AI service  :8000
```

| Layer | Tech | Port |
|---|---|---|
| Frontend | React 18 + Vite, React Router, Zustand, Recharts | 5173 |
| Backend (API gateway) | Java 17 + Spring Boot, Spring Security (JWT), Spring Data JPA | 8080 |
| AI service | Python + FastAPI (psycopg2) | 8000 |
| Database & files | Supabase (PostgreSQL + Storage) | cloud |

---

## Features

**Students**
- **Dashboard** — create and manage projects.
- **Workspace** — a Google‑Docs‑style multi‑page document editor with autosave, undo/redo,
  find & replace, an insert‑table grid picker, and **AI exam‑paper generation**.
- **Submit for review** — submit an AI‑generated paper to an educator (one active
  submission at a time).
- **Analytics** — your topic‑mastery heatmap, your weakness list, and a **you‑vs‑class**
  topic‑weakness bar chart.
- **Submissions** — track submitted papers and view reviewed answers with per‑topic feedback.
- **Subject Analysis** — topic trends per subject.

**Educators**
- **Verification** — a searchable/filterable submission queue → grade per question; marks
  are split across topics to build each student's `student_performance` (weakness) profile.
  Also human‑in‑the‑loop verification of AI‑generated solutions.
- **Class Analysis** — the cohort **Class‑Weakness** model, a Topics × Students mastery
  matrix, and a class‑average topic chart. Same analytics layout as the student page.
- **Past Year Papers** — upload PDFs → OCR → extracted questions → AI model solutions.
- **Subjects & Topics** — manage the topic taxonomy for their subjects.
- Educators only see data for the subjects they are **assigned** to (see Specializations).

**Admins**
- Everything educators can do, plus **Specializations** — assign which subjects each
  educator may handle. Enforced in the backend (not just hidden in the UI).

---

## Repository structure

```
IntellBank/
├── frontend/      React + Vite SPA
├── backend/       Spring Boot API gateway
├── ai-service/    Python FastAPI AI microservice
├── database/      schema.sql (run in Supabase)
├── docs/          setup, API, testing, AI notes
├── presentation/  demo testing steps + script (HTML)
└── start-all.ps1  launches all three services (Windows)
```

---

## Prerequisites

- **Node.js** 18+ and npm
- **Java** 17+ (the backend ships the Maven wrapper `mvnw`, so a separate Maven install
  is optional)
- **Python** 3.11+
- A **Supabase** project (PostgreSQL + a Storage bucket)
- A **Google Gemini API key** (used only for past‑year‑paper model‑answer generation)

---

## Setup

### 1. Database
In the Supabase SQL editor, run [`database/schema.sql`](database/schema.sql) to create all
tables. (Existing databases are migrated in‑place by the `ALTER TABLE … ADD COLUMN IF NOT
EXISTS …` statements at the top of the relevant sections.)

### 2. Frontend env — `frontend/.env`
```
VITE_API_BASE_URL=http://localhost:8080
VITE_IDLE_TIMEOUT_MINUTES=90
```

### 3. Backend config — `backend/src/main/resources/application.properties`
Copy the template and fill in your values (this file is git‑ignored):
```powershell
Copy-Item backend/src/main/resources/application.properties.example backend/src/main/resources/application.properties
```
Key settings (see the template for the full list):
```
server.port=8080
spring.datasource.url=jdbc:postgresql://<supabase-host>:5432/postgres?sslmode=require
spring.datasource.username=<supabase-username>
spring.datasource.password=<supabase-password>

jwt.secret=<a strong random string, 32+ chars>
jwt.expiration=86400000

ai.service.base-url=http://localhost:8000

# Supabase Storage (past year paper PDFs) — Dashboard → Settings → API
supabase.url=<your-supabase-project-url>
supabase.service-key=<your-service-role-key>
supabase.storage-bucket=documents
```

### 4. AI service env — `ai-service/.env`
```
SUPABASE_DB_HOST=<supabase-host>
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=<supabase-username>
SUPABASE_DB_PASSWORD=<supabase-password>
SUPABASE_SERVICE_KEY=<your-service-role-key>
GEMINI_API_KEY=<your-gemini-api-key>
HUGGINGFACE_MODEL_PATH=./app/models/question_generator/flan-t5-intellbank
```

### 5. Install dependencies
```
# Frontend
cd frontend && npm install

# AI service (its own virtualenv)
cd ../ai-service
python -m venv venv
venv\Scripts\activate            # Windows   (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
```
> **OCR note:** past‑year‑paper OCR runs through **MinerU** in a *separate* isolated
> virtualenv (`ai-service/mineru_venv/`) because its dependency chain conflicts with the
> main service's PyTorch. See [`docs/setup-guide.md`](docs/setup-guide.md). OCR is only
> needed for the Past Year Papers feature; the rest of the app runs without it.

The backend downloads its own dependencies on first build via the Maven wrapper — no
separate install step.

---

## Running

### Everything at once (Windows)
From the project root:
```
.\start-all.ps1
```
This opens three PowerShell windows — AI service, backend, frontend.

### Or start each service individually
```
# AI service   →  http://localhost:8000   (Swagger at /docs)
cd ai-service ; .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Backend      →  http://localhost:8080
cd backend ; .\mvnw spring-boot:run

# Frontend     →  http://localhost:5173
cd frontend ; npm run dev
```

Open **http://localhost:5173**. Confirm the AI service is up at
**http://localhost:8000/docs**.

---

## First‑time / demo setup

Self‑registration always creates a **STUDENT**. To get an educator or admin account, set
the role in Supabase.

**Create an admin** (passwords are bcrypt‑hashed in‑DB via `pgcrypto`, so no tooling is
needed):
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
WITH new_user AS (
  INSERT INTO users (user_id, full_name, email, password_hash, role, is_active, created_at)
  VALUES (gen_random_uuid(), 'System Admin', 'admin@intellbank.com',
          crypt('Admin@12345', gen_salt('bf', 10)), 'ADMIN', true, now())
  RETURNING user_id)
INSERT INTO administrators (administrator_id, user_id)
SELECT gen_random_uuid(), user_id FROM new_user;
```
Login: **admin@intellbank.com / Admin@12345**

**Promote an existing account to educator:**
```sql
UPDATE users SET role='EDUCATOR' WHERE email='educator@example.com';
INSERT INTO educators (educator_id, user_id)
SELECT gen_random_uuid(), user_id FROM users WHERE email='educator@example.com'
ON CONFLICT DO NOTHING;
```

**Then, as admin → Specializations**, assign subjects to each educator. Enforcement is
**strict**: an educator with no specializations sees nothing until assigned.

> The full step‑by‑step demo walkthrough is in
> [`presentation/testing-steps.html`](presentation/testing-steps.html) (open in a browser).

---

## Roles & access

| Role | Access |
|---|---|
| **STUDENT** | Dashboard, Workspace, Question Bank, Analytics, Submissions, Subject Analysis, Past Year Papers |
| **EDUCATOR** | Verification, Class Analysis, Subjects & Topics, Past Year Papers — **limited to assigned subjects** |
| **ADMIN** | Everything, plus Specializations (assign educator↔subject) |

---

## AI components

| Component | What it does | Tech |
|---|---|---|
| **Class‑Weakness model** | Learns, per subject, which topics the cohort is consistently weak at. Unsupervised **agglomerative clustering implemented from scratch in pure Python** over live `student_performance` data; gated on ≥5 graded submissions from ≥2 students; retrains on demand. No external API. | pure Python |
| **Topic prediction** | Predicts likely‑to‑appear topics for a subject. | K‑Means |
| **Question generation** | Generates exam questions. | fine‑tuned FLAN‑T5 (HuggingFace `transformers`, local) |
| **Topic classification** | Tags OCR'd questions with topics. | zero‑shot `facebook/bart-large-mnli` |
| **Model solutions** | Generates model answers for past‑year‑paper questions. | Google Gemini (the only external cloud AI) |
| **OCR** | Extracts questions/tables/figures from uploaded PDFs. | MinerU (separate venv) |

---

## Troubleshooting

- **UI changes not showing / old popups appear** — the Vite dev server is serving a stale
  bundle. Stop `npm run dev`, run `Get-Process node | Stop-Process -Force` if needed, then
  `npm run dev` again and hard‑refresh (`Ctrl+Shift+R`).
- **AI service won't start — `Form data requires "python-multipart"`** — run
  `pip install -r requirements.txt` inside `ai-service/venv` (it's listed there).
- **Too many DB connections** — Supabase's session pooler caps connections; the backend
  and AI service are configured to stay within it. Don't run extra copies of a service.
- **Class analytics look empty** — the Class‑Weakness model needs ≥5 graded submissions
  from ≥2 different students in that subject before it produces output.

---

## Docs

- [`docs/setup-guide.md`](docs/setup-guide.md) — environment + MinerU setup
- [`docs/api-endpoints.md`](docs/api-endpoints.md) — API reference
- [`docs/testing-plan.md`](docs/testing-plan.md) — testing strategy
- [`docs/ai-training-plan.md`](docs/ai-training-plan.md) — AI/model training notes
