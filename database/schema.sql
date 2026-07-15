-- ============================================================
-- IntellBank – PostgreSQL Schema  (ERD-aligned)
-- Run this in Supabase SQL Editor to initialise the database.
-- ============================================================

-- ── Clean up any old generated tables ────────────────────────────────────────
DROP TABLE IF EXISTS generated_exam_questions  CASCADE;
DROP TABLE IF EXISTS generated_exams           CASCADE;
DROP TABLE IF EXISTS exam_attempts             CASCADE;
DROP TABLE IF EXISTS workspace_tabs            CASCADE;
DROP TABLE IF EXISTS topic_frequency           CASCADE;

-- ── Drop old PostgreSQL enum types that are no longer used ───────────────────
DROP TYPE IF EXISTS user_role              CASCADE;
DROP TYPE IF EXISTS doc_processing_status  CASCADE;
DROP TYPE IF EXISTS question_source_type   CASCADE;
DROP TYPE IF EXISTS verification_status    CASCADE;
DROP TYPE IF EXISTS generation_type        CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
--  USERS  (authentication / shared identity)
--  Note: `role` is kept as a plain VARCHAR for JWT/Spring Security routing.
--        The actual profile is stored in students / educators / administrators.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(255),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(50)  NOT NULL DEFAULT 'STUDENT',  -- STUDENT | EDUCATOR | ADMIN
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    student_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS educators (
    educator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS administrators (
    administrator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
);

-- ── Subjects & Topics ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    subject_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
    topic_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID         NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL
);

-- ── Difficulty ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS difficulties (
    difficulty_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL  -- e.g. "Easy", "Medium", "Hard"
);

-- ════════════════════════════════════════════════════════════════════════════
--  PAST YEAR PAPERS  (raw academic source uploaded by educator / admin)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS past_year_papers (
    pyp_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(500) NOT NULL,
    subject      VARCHAR(255),  -- educator-assigned subject (drives specialization gating)
    course_code  VARCHAR(50),   -- e.g. BITU3013 (auto-extracted from filename or OCR cover page)
    exam_session VARCHAR(100),  -- e.g. "May 2024/2025" (user-provided or OCR-extracted)
    upload_date  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    storage_url  TEXT,
    status       VARCHAR(100) NOT NULL DEFAULT 'UPLOADED'
        -- UPLOADED | PROCESSING | PROCESSED | FAILED
);

-- Migration: add columns to existing databases that were created before these columns existed
ALTER TABLE past_year_papers ADD COLUMN IF NOT EXISTS course_code  VARCHAR(50);
ALTER TABLE past_year_papers ADD COLUMN IF NOT EXISTS exam_session VARCHAR(100);

-- ════════════════════════════════════════════════════════════════════════════
--  QUESTIONS
--  Linked to PastYearPapers via pyp_id (may be NULL for manually created).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS questions (
    question_id UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    pyp_id      UUID    REFERENCES past_year_papers(pyp_id) ON DELETE SET NULL,
    content     TEXT    NOT NULL,
    marks       INTEGER NOT NULL DEFAULT 1
);

-- ── QuestionTopic  (question ↔ topic + difficulty) ───────────────────────────
CREATE TABLE IF NOT EXISTS question_topics (
    question_id   UUID REFERENCES questions(question_id)   ON DELETE CASCADE,
    topic_id      UUID REFERENCES topics(topic_id)         ON DELETE CASCADE,
    difficulty_id UUID REFERENCES difficulties(difficulty_id),
    PRIMARY KEY (question_id, topic_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  SOLUTIONS
--  Verification is controlled ONLY through solutions.is_verified.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS solutions (
    solution_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID        NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    explanation TEXT,
    is_verified BOOLEAN     NOT NULL DEFAULT false,
    verified_by UUID        REFERENCES users(user_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ
);

-- ── Solution History  (audit trail – written before any content change) ───────
CREATE TABLE IF NOT EXISTS solution_history (
    solution_history_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id         UUID        NOT NULL REFERENCES solutions(solution_id) ON DELETE CASCADE,
    old_content         TEXT,
    old_explanation     TEXT,
    changed_timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by          UUID        REFERENCES users(user_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  PROJECTS  (belongs to a Student)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS projects (
    project_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID         NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    project_name VARCHAR(255) NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════════
--  DOCUMENTS
--  type values (plain text):
--    "AI Generated Exam"  – exam created by the AI service
--    "Past Year Paper"    – linked from PastYearPapers
--    "Raw Document"       – generic uploaded file
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS documents (
    document_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID         NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title       VARCHAR(500),
    type        VARCHAR(100) NOT NULL DEFAULT 'Raw Document',
    total_score INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    storage_url TEXT
);

-- ── DocumentQuestion  (which questions belong to a document) ─────────────────
CREATE TABLE IF NOT EXISTS document_questions (
    question_id UUID REFERENCES questions(question_id)  ON DELETE CASCADE,
    document_id UUID REFERENCES documents(document_id)  ON DELETE CASCADE,
    PRIMARY KEY (question_id, document_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  SUBMISSIONS
--  Only Documents with type = "AI Generated Exam" may be submitted.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS submissions (
    submission_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID        NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    educator_id       UUID        REFERENCES educators(educator_id),
    marks             INTEGER,
    question_feedback TEXT,       -- per-question educator feedback (JSON array), shown to the student
    status            VARCHAR(100) NOT NULL DEFAULT 'PENDING'
        -- PENDING | GRADED | RETURNED
);

-- Migration for existing databases:
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS question_feedback TEXT;

-- ════════════════════════════════════════════════════════════════════════════
--  STUDENT PERFORMANCE
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS student_performance (
    performance_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID        NOT NULL REFERENCES students(student_id)  ON DELETE CASCADE,
    topic_id        UUID        NOT NULL REFERENCES topics(topic_id)      ON DELETE CASCADE,
    mastery_level   VARCHAR(50) NOT NULL DEFAULT 'Beginner',
        -- "Beginner" | "Intermediate" | "Advanced" | "Mastered"
    last_calculated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Specialization  (Educator ↔ Subject many-to-many) ─────────────────────────
CREATE TABLE IF NOT EXISTS specializations (
    subject_id  UUID REFERENCES subjects(subject_id)   ON DELETE CASCADE,
    educator_id UUID REFERENCES educators(educator_id) ON DELETE CASCADE,
    PRIMARY KEY (subject_id, educator_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  EXTRACTED TEXT BLOCKS
--  Simple storage only – workflows not yet built.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS extracted_text_blocks (
    block_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pyp_id      UUID REFERENCES past_year_papers(pyp_id) ON DELETE CASCADE,
    raw_content TEXT
);

-- ── Seed default difficulty values ────────────────────────────────────────────
INSERT INTO difficulties (name) VALUES ('Easy'), ('Medium'), ('Hard')
ON CONFLICT DO NOTHING;
