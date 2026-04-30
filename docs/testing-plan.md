# IntellBank – Testing Plan

## Overview

This document outlines the testing strategy for the IntellBank full-stack application.

---

## 1. Backend Unit Tests (JUnit 5 + Mockito)

### Service Layer Tests
| Class | Test Cases |
|-------|-----------|
| `AuthServiceTest` | Register with duplicate email, login with wrong password, valid login returns JWT |
| `ProjectServiceTest` | Create project, get projects by user, delete project |
| `QuestionServiceTest` | Create question, filter by subject, filter by topic |
| `VerificationServiceTest` | Approve question, reject question, edit question |
| `ExamServiceTest` | Generate exam from bank, generate exam from AI model |

### Run Backend Tests
```bash
cd backend
mvn test
```

---

## 2. Backend Integration Tests

| Scenario | Endpoint | Expected |
|----------|----------|----------|
| Register user | POST /api/auth/register | 201 Created |
| Login | POST /api/auth/login | 200 + JWT token |
| Access protected without JWT | GET /api/projects | 401 Unauthorized |
| Student access verification | GET /api/verification/pending | 403 Forbidden |
| Educator access verification | GET /api/verification/pending | 200 OK |

### Run with Testcontainers (PostgreSQL)
```bash
mvn verify -P integration-test
```

---

## 3. Frontend Component Tests (Vitest + React Testing Library)

| Component | Test Cases |
|-----------|-----------|
| `LoginPage` | Submit with empty fields shows error, valid credentials calls authService |
| `RegisterPage` | Password mismatch shows error |
| `DashboardPage` | Renders project cards, create project button exists |
| `WorkspacePage` | Tab switching works, active tab highlighted |
| `VerificationPage` | Pending questions displayed, approve/reject calls correct endpoints |
| `ExamSimulatorPage` | Form fields present, submit triggers exam generation |

### Run Frontend Tests
```bash
cd frontend
npm run test
```

---

## 4. AI Service Tests (pytest)

| Test | Description |
|------|-------------|
| `test_ocr_extract` | Sends PDF file, expects text response |
| `test_classify_question` | Sends question text, expects subject/topic response |
| `test_predict_topics` | Sends subject, expects list of predicted topics |
| `test_generate_question` | Sends context, expects generated question |
| `test_generate_solution` | Sends question, expects solution text |

### Run AI Service Tests
```bash
cd ai-service
pytest tests/ -v
```

---

## 5. End-to-End Tests (Manual / Playwright - future)

### Flow 1: Student Exam Workflow
1. Register as STUDENT
2. Login → redirected to Dashboard
3. Create a project
4. Go to Workspace → open Exam Simulator tab
5. Fill exam form (subject, topic, difficulty, marks, num_questions)
6. Click Generate → exam appears
7. Submit answers → score displayed

### Flow 2: Educator Verification Workflow
1. Login as EDUCATOR
2. Navigate to Verification page
3. Review pending question list
4. Edit a question → click Approve
5. Verify question status changes to VERIFIED

### Flow 3: Admin Full Access
1. Login as ADMIN
2. Access all pages (Dashboard, Workspace, Verification, Analytics, Exam Simulator)
3. Delete a user (admin panel - future feature)

---

## 6. Security Testing

| Test | Expected Result |
|------|----------------|
| Access /api/verification as STUDENT | 403 Forbidden |
| Access /api/admin as EDUCATOR | 403 Forbidden |
| Expired JWT token | 401 Unauthorized |
| SQL Injection in username field | 400 Bad Request (validation) |
| XSS attempt in question text | Sanitized output |

---

## 7. AI Model Evaluation

```bash
cd ai-service
python app/training/evaluate_model.py
```

Expected outputs:
```
ROUGE-1: 0.45
ROUGE-2: 0.30
ROUGE-L: 0.42
```

---

## 8. Performance Testing (Future – k6 / JMeter)

- Load test: 100 concurrent users accessing GET /api/questions
- Stress test: 50 concurrent exam generation requests
- Latency target: < 500ms for non-AI endpoints, < 3s for AI endpoints
