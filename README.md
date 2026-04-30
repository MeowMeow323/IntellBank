# IntellBank – Intelligent Educational Question Bank

## Project Overview

IntellBank is a full-stack intelligent educational question bank system that supports students, educators, and admins. It enables AI-assisted question generation, document extraction, predictive topic analytics, and exam simulation.

---

## Architecture

```
React Frontend (Vite + React Router + Zustand + Recharts)
       │
       ▼  (All API calls via Axios to Spring Boot only)
Java Spring Boot (Centralized API Gateway)
       │                   │
       ▼                   ▼
Supabase PostgreSQL    Python FastAPI (AI Service)
Supabase Storage       - OCR / Text Extraction
                       - Question Generation (FLAN-T5-small)
                       - Topic Classification
                       - Topic Prediction
```

- **Frontend** → communicates ONLY with Spring Boot API (`/api/**`)
- **Spring Boot** → communicates with Supabase (PostgreSQL, Storage) and the Python AI Service
- **Frontend NEVER calls Supabase or FastAPI directly**

---

## Startup Commands

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on: http://localhost:5173

### Backend (Spring Boot)
```bash
cd backend
mvn spring-boot:run
```
Runs on: http://localhost:8080

### AI Service (Python FastAPI)
```bash
cd ai-service
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Runs on: http://localhost:8000

---

## Environment Variable Setup

### Frontend (`frontend/.env`)
```
VITE_API_BASE_URL=http://localhost:8080
```

### Backend (`backend/src/main/resources/application.properties`)
```
spring.datasource.url=jdbc:postgresql://<SUPABASE_HOST>:5432/postgres
spring.datasource.username=postgres
spring.datasource.password=<SUPABASE_PASSWORD>
jwt.secret=<YOUR_JWT_SECRET>
jwt.expiration=86400000
ai.service.base-url=http://localhost:8000
```

### AI Service (`ai-service/.env`)
```
# Copy from ai-service/.env.example
HUGGINGFACE_MODEL_PATH=./app/models/question_generator
```

---

## Git Workflow

```bash
git checkout -b feature/<feature-name>
# Make changes
git add .
git commit -m "feat: describe your change"
git push origin feature/<feature-name>
# Open Pull Request to main
```

Branches:
- `main` – stable production
- `develop` – integration
- `feature/*` – individual features

---

## Project Modules

| Module | Description |
|---|---|
| Auth | JWT-based login/register with role-based access |
| Dashboard | Project management for students |
| Workspace | Multi-tab persistent workspace per project |
| Documents | Upload and AI-process PDF/images |
| Question Bank | CRUD question management |
| Verification | Educator/admin review of AI-generated questions |
| Analytics | Predictive topic analytics using Recharts |
| Exam Simulator | AI-powered exam generation and attempt |

---

## Roles

- **STUDENT** – Dashboard, Workspace, Analytics, Exam Simulator
- **EDUCATOR** – All student features + Verification
- **ADMIN** – Full access to everything
