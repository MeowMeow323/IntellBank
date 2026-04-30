# IntellBank – Setup Guide

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| Java JDK | >= 17 |
| Maven | >= 3.9 |
| Python | >= 3.10 |
| Docker (optional) | >= 24 |

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd intellbank
```

---

## 2. Supabase Setup

1. Create a project at [https://supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `database/schema.sql`
3. Under **Project Settings → Database**, copy the connection string
4. Under **Storage**, create a bucket named `documents` (set to private)

---

## 3. Backend Setup

### application.properties
Edit `backend/src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:postgresql://<host>:5432/postgres
spring.datasource.username=postgres
spring.datasource.password=<password>
spring.jpa.hibernate.ddl-auto=validate
jwt.secret=<random-256-bit-string>
jwt.expiration=86400000
ai.service.base-url=http://localhost:8000
```

### Run the Backend
```bash
cd backend
mvn clean install
mvn spring-boot:run
```

---

## 4. Frontend Setup

### .env
Create `frontend/.env`:
```
VITE_API_BASE_URL=http://localhost:8080
```

### Run the Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 5. AI Service Setup

### .env
Copy and edit the example:
```bash
cd ai-service
cp .env.example .env
```

Edit `.env`:
```
HUGGINGFACE_MODEL_PATH=./app/models/question_generator
```

### Create Virtual Environment and Run
```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 6. Docker (Optional)

```bash
# From project root
cp .env.example .env   # fill in env vars
docker-compose up --build
```

---

## 7. Default Ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8080 |
| AI Service | http://localhost:8000 |
