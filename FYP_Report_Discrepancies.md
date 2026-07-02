# IntellBank FYP Report — Report vs. Implementation Discrepancies (Chapters 1–4)

**Purpose:** The report was written *before* the system was built, so several documented designs no longer match the code. This document lists every mismatch I found by comparing the report against the actual codebase, so you can fix the **report** manually. No code is to be changed.

**Reconciliation policy (agreed):**
1. **Correct the facts** in text/tables so they describe what was actually built.
2. **Add a short "Implementation note:"** line where the design genuinely evolved.
3. **Leave all figures (diagrams, ERD, UI mockups) and their captions untouched** — they represent the original design intent. Where a table edit would diverge from a figure, the blanket notes below cover it.
4. Antigravity (IDE) and Postman (API testing) are **confirmed correct** — no change.

**Severity legend:**
- 🔴 **Contradiction / factual error** — a moderator will likely catch this. Fix.
- 🟠 **Design → build deviation** — correct the fact + add an implementation note.
- 🟡 **Minor / cosmetic** — optional, low effort.

---

## Summary table

| # | Location | Issue | Severity |
|---|----------|-------|----------|
| C1-1 | Footers (all pages) | Course code mixes BMCS3413 / BMCS3403 / BACS3413; Abstract/Ack say "Project II" | 🔴 |
| C1-2 | Table 1.7 (Laptop) | OS "Windows 10" contradicts Table 3.6 "Windows 11" (actual = Win 11) | 🔴 |
| C1-3 | §1.5.2 User Scope | Admin scope overstated (real admin = educator specialization only) | 🟠 |
| C2-1 | §2.2.4 | "side-by-side" workspace claim = split-screen (not built) | 🟠 |
| C3-1 | §3.2.2 Phase 1 | Date typo "13/3/**2025**" → 2026 | 🔴 |
| C3-2 | §3.2.3 Phase 3 | Date "31/3/2026 to 17/**3**/2026" → 17/**4**/2026 (end before start) | 🔴 |
| C3-3 | §3.5.1 FR 1.3 | Split-screen mode not implemented (tabbed editor instead) | 🟠 |
| C3-4 | §3.5.2 NFR Security | "90-min inactivity timeout" → actual 24-hour JWT, no inactivity logic | 🔴 |
| C3-5 | §3.5.2 vs §4.2.1 | Performance numbers contradict (2s/50 users vs 200ms/500 users) | 🔴 |
| C4-1 | §4.6 prose | "19 entities" → code has 20 (adds PasswordResetToken) | 🟠 |
| C4-2 | Table 4.14 | Document.Type "ENUM" → VARCHAR | 🔴 |
| C4-3 | Table 4.22 | MasteryLevel "ENUM/High" → VARCHAR/"Beginner"; missing `comment` column | 🔴 |
| C4-4 | Table 4.23 | Solutions.VerifiedBy "VARCHAR/name" → FK → User | 🔴 |
| C4-5 | Table 4.25 | Submission.Status "ENUM/Marked" → VARCHAR/"GRADED" | 🔴 |
| C4-6 | Table 4.26 | PastYearPapers.Status "ENUM/Processing" → VARCHAR/"UPLOADED"; missing subject/courseCode/examSession | 🔴 |
| C4-7 | Table 4.27 | ExtractedTextBlocks.PypID "Reference To: Document" → PastYearPaper | 🟡 |
| C4-8 | §4.7 / §4.8 | Extra screens (Register, Forgot/Reset PW, Admin, analysis pages) + sidebar nav not documented | 🟠 |
| C4-9 | §4.3.2 UC_002 | "session expired due to inactivity" message ties to non-existent inactivity timeout | 🟠 |
| C4-10 | §4.2.1 (figure) | Controller/model names in architecture diagram don't match code | ⚪ Left (figure) |

---

## Actual implementation reference (ground truth)

**Backend controllers** (`backend/.../controller/`): AuthController, ProjectController, DocumentController, ExamController, SubmissionController, QuestionController, VerificationController, AnalyticsController, PastYearPaperController, MetadataController, SpecializationController, AiGatewayController.

**Entities (20)**: User, Student, Educator, Administrator, Project, Document, DocumentQuestion, Question, QuestionTopic, Subject, Topic, Difficulty, Solution, SolutionHistory, Submission, StudentPerformance, PastYearPaper, ExtractedTextBlock, Specialization, **PasswordResetToken**.

**Roles**: STUDENT, EDUCATOR, ADMIN.

**Frontend pages** (`frontend/src/pages/`): Login, Register, ForgotPassword, ResetPassword, Dashboard, Workspace, DocumentUpload, ExamSimulator, PredictiveAnalytics, SubjectAnalysis, EducatorAnalysis (class analysis), QuestionBank, Verification, Submissions, PastYearPaperLibrary, PastYearPaperQuestions, SubjectTopicManagement, AdminSpecializations.

**Navigation**: left **sidebar** (`components/layout/Sidebar.jsx`), role-based sections MAIN / EDUCATOR / ADMIN — *not* the top nav bar shown in the mockups.

---

# CHAPTER 1 — Introduction

### C1-1 🔴 Footer / course-code inconsistency (all pages)
- **Report:** footers mix `BMCS3413 Project I`, `BMCS3403 Project I` (p.2), `BACS3413 Project I` (p.1); the Abstract and Acknowledgement footers say `BMCS3413 Project II`.
- **Fix:** standardize every footer to **`BMCS3413 Project I`**.

### C1-2 🔴 OS inconsistency — Table 1.7 (Laptop Specification)
- **Report:** Table 1.7 = "Microsoft Windows 10 Home Single Language"; Table 3.6 = "Windows 11".
- **Actual:** Windows 11.
- **Fix:** change Table 1.7 to **"Microsoft Windows 11 Home Single Language"**.

### C1-3 🟠 Admin scope overstated — §1.5.2 User Scope
- **Report:** Educators/Administrators can "manage the publication status and availability of the centralised question bank" and "monitor system-wide data."
- **Actual:** the Admin role only manages **educator subject specializations** (`AdminSpecializationsPage.jsx` / `SpecializationController`). No system-wide CRUD dashboard.
- **Fix:** add implementation note (see Note N4 below), or soften the admin bullets.

### 🟡 Note — §1.6 Table 1.1
Antigravity + Postman confirmed accurate. No change.

---

# CHAPTER 2 — Literature Review

### C2-1 🟠 "Side-by-side" workspace claim — §2.2.4 (and Objective 2, §1.4)
- **Report:** "By displaying the original legacy document, its digital transcription, and the editing tools **side-by-side** within a single, cohesive view…" — i.e. split-screen.
- **Actual:** the workspace is a **tabbed** single-document editor (`WorkspaceContent.jsx`); you switch between documents via tabs, there is no side-by-side split view.
- **Fix:** reword "side-by-side" to "within a unified, tabbed workspace," or add implementation note N1. (Ties to C3-3.)

*Rest of Chapter 2 (case studies, comparison table §2.4) matches the build — no changes.*

---

# CHAPTER 3 — Methodology & Requirements Analysis

### C3-1 🔴 Date typo — §3.2.2 Sprint 2, Phase 1
- **Report:** "Requirement Analysis and Planning (77 days, 27/12/2025 to **13/3/2025**)".
- **Fix:** → **13/3/2026**.

### C3-2 🔴 Date typo — §3.2.3 Sprint 3… (Sprint 2 Phase 3 text)
- **Report:** "Phase 3: Development (18 days, 31/3/2026 to **17/3/2026**)" — end date precedes start date.
- **Fix:** → **17/4/2026** (matches the sprint table).

### C3-3 🟠 FR 1.3 split-screen not implemented — §3.5.1
- **Report:** "FR 1.3 The system shall allow users to toggle **split-screen mode** to view an uploaded document and an AI generated solution side-by-side."
- **Actual:** no split-screen; documents open one-at-a-time in tabs. AI solutions are viewed within the document/verification flow, not in a side-by-side split.
- **Fix:** either reword FR 1.3 to describe tabbed viewing, or keep it and add implementation note N1 (deferred feature).

### C3-4 🔴 Session timeout not implemented — §3.5.2 NFR Security
- **Report:** "the system must automatically **terminate active sessions after 90 minutes of inactivity**."
- **Actual:** JWT expiry is **24 hours** (`jwt.expiration=86400000` in `application.properties`); `JwtAuthFilter` only checks token validity, with no inactivity tracking.
- **Fix:** change to "authentication tokens expire after 24 hours" + implementation note N2.

### C3-5 🔴 Performance figures contradict §4.2.1 — §3.5.2 NFR Performance
- **Report §3.5.2:** respond "within **two seconds**"; support "at least **50 concurrent users**."
- **Report §4.2.1:** "**sub-200ms** latency"; "up to **500 simultaneous users**."
- **Fix:** pick one set and make both agree. Recommend the §3.5.2 numbers (**2s / 50 users**) — more defensible for a single-instance Spring Boot + Supabase deployment; then update §4.2.1's Performance attribute to match.

### 🟡 Note — §3.6 Table 3.6
Windows 11, Antigravity, Postman, Supabase (PostgreSQL), React.js, Spring Boot all match. No change.

---

# CHAPTER 4 — System Design

> **Figures left as-is per policy:** Fig 4.1 (architecture), Fig 4.5 (ERD), all §4.7 UI mockups. The corrections below apply to **prose and data-dictionary tables** only. The blanket notes reconcile tables vs. figures.

### C4-10 ⚪ (Left — figure) Architecture diagram controller/model names — §4.2.1 / Fig 4.1
For your awareness only (you chose to leave figures): the diagram lists `WorkspaceController`, `SimulatorController`, `SolutionController`, `UserManagementController`, `SolutionManagementController`, `DocumentManagementController`, `AdminDashboardController`, and models `UserAccount / Material / VerifiedSolution`. The real code has **ProjectController, ExamController, SpecializationController, SubmissionController, PastYearPaperController, MetadataController, AiGatewayController** and entities **User / Document / Solution**. No action taken.

### C4-a 🔴 Performance attribute — §4.2.1 "Primary Quality Attributes → Performance"
See **C3-5**. Reconcile "sub-200ms / 500 users" with §3.5.2. (This is prose, not the figure.)

### §4.3.2 Use Case Descriptions

**C4-9 🟠 UC_002 Login — inactivity message**
- **Report:** M1 = "Your session has expired **due to inactivity**." + basic flow references idle-session termination.
- **Actual:** no inactivity timeout (24h JWT). 
- **Fix:** change M1 to "Your session has expired. Please log in again," consistent with C3-4.

**🟡 UC_008 Generate Customized Exam — generation options**
- **Report (basic flow + Fig 4.6.2c mockup):** student selects **multiple topics** (checkboxes) and can toggle **"Target My Weaknesses."**
- **Actual:** `POST /api/exams/generate` accepts a **single** `topic` + **single** `difficulty` + `questionCount` (`ExamController`). No weakness-targeting flag on this endpoint.
- **Fix (optional):** note in the UC text that the implemented generator uses single-topic/difficulty selection; the multi-topic + weakness-targeting UI is a planned enhancement. (Figure left untouched.)

*UC_001 (tab preservation, auto-save), UC_004 (verify/reject-with-reason/filter), UC_005 (verified/unverified filter, unsubmit), UC_006 (upload answered paper), UC_007 (analytics) all match the build.*

### §4.6 Database Design — corrections

**C4-1 🟠 Entity count — §4.6 intro prose**
- **Report:** "The ERD consists of **19** different entities."
- **Actual:** 20 (adds **PasswordResetToken** for the forgot-password flow, not shown in Fig 4.5).
- **Fix:** keep "19" (matches figure) and add blanket note **N3** under §4.6.

**Data dictionary table edits** (all plain-text tables):

| Ref | Table | Cell | Change |
|-----|-------|------|--------|
| **C4-2** 🔴 | 4.14 Document | `Type` data type | `ENUM` → **`VARCHAR`** (values: "Raw Document" \| "AI Generated Exam" \| "Past Year Paper") |
| **C4-3** 🔴 | 4.22 StudentPerformance | `MasteryLevel` | `ENUM`/"High" → **`VARCHAR`**/"**Beginner**" |
| **C4-3** 🔴 | 4.22 StudentPerformance | *(new row)* | Add **`Comment` — TEXT — Nullable** — educator per-topic feedback |
| **C4-4** 🔴 | 4.23 Solutions | `VerifiedBy` | `VARCHAR(255)`/"Tan Whey Long" → **`UUID` / FK / Reference To: User** (it's a foreign key, not a name) |
| **C4-5** 🔴 | 4.25 Submission | `Status` | `ENUM`/"Marked" → **`VARCHAR`**/"**GRADED**" (values: PENDING \| GRADED \| RETURNED) |
| **C4-6** 🔴 | 4.26 PastYearPapers | `Status` | `ENUM`/"Processing" → **`VARCHAR`**/"**UPLOADED**" |
| **C4-6** 🔴 | 4.26 PastYearPapers | *(new rows)* | Add **`Subject` (VARCHAR 255)**, **`CourseCode` (VARCHAR 50)**, **`ExamSession` (VARCHAR 100)** |
| **C4-7** 🟡 | 4.27 ExtractedTextBlocks | `PypID` "Reference To" | `Document` → **`PastYearPaper`** |

### §4.7 System Design (UI) & §4.8 Summary

**C4-8 🟠 Undocumented screens + navigation**
- **Report §4.7:** documents 6 screens (Workspace, Document, Login, Predictive Analytics, Submissions, Verification). Login mockup (Fig 4.6.4) shows only email/password.
- **Actual:** app also has **Register, Forgot Password, Reset Password**, **Admin Specializations**, **Subject Analysis**, **Class/Educator Analysis**, **Past Year Paper Library/Questions**, **Question Bank**, **Subject & Topic Management**, **Document Upload** — and uses a **left sidebar**, not a top nav bar.
- **Fix:** figures/captions left as-is; add implementation note **N5** in the §4.8 summary (standalone prose).

---

# Copy-paste implementation notes

Paste these where indicated; they satisfy the "correct + note deviation" policy without touching figures.

**N1 — split-screen / workspace (add near §2.2.4, §3.5.1 FR 1.3, or §4.8):**
> *Implementation note: the workspace was realised as a tabbed single-document editor rather than a side-by-side split view. Multiple documents are managed via tabs with state preserved on switch; the split-screen document/solution comparison (FR 1.3) is deferred to a future iteration.*

**N2 — session model (add to §3.5.2 NFR Security and/or §4.3.2 UC_002):**
> *Implementation note: session management was implemented using a 24-hour JWT expiry rather than a 90-minute inactivity timeout; inactivity-based termination is planned for a later iteration.*

**N3 — schema additions (add under §4.6 intro):**
> *Implementation note: during development the schema gained a `PasswordResetToken` table (supporting the password-reset flow) and a small number of additional columns (PastYearPaper's subject/courseCode/examSession, StudentPerformance's comment). These are reflected in the data dictionary; the ERD in Figure 4.5 depicts the original 19-entity design.*

**N4 — admin scope (add to §1.5.2 or §4.8):**
> *Implementation note: in FYP1 the Administrator role was scoped to managing educator subject specializations; broader system-wide management is planned for FYP2.*

**N5 — additional screens & navigation (add to §4.8 Chapter Summary):**
> *Implementation note: beyond the six screens illustrated, the built system also includes Registration, Forgot-Password, Reset-Password, Admin Specializations, Subject-Analysis and Class-Analysis pages. Navigation was implemented as a role-based left sidebar rather than the top navigation bar shown in the mockups.*

**N6 — analytics split (optional, add near §2.2.3 / §4.7.4 / §4.8):**
> *Implementation note: predictive analytics were delivered as three views — personal topic-mastery, subject-level topic-frequency/trend, and an educator class-analysis (class matrix plus a K-Means predicted-topics model).*

---

# Please confirm (a few I couldn't decide for you)

1. **C3-5 / C4-a:** which performance numbers do you want to keep — **2s / 50 users** (Ch3) or **200ms / 500 users** (Ch4)? (Recommend 2s / 50.)
2. **C3-3 / FR 1.3:** do you want split-screen framed as "deferred to FYP2" (note N1), or fully reworded to describe the tabbed editor?
3. **UC_008 / Fig 4.6.2c:** is multi-topic selection + "Target My Weaknesses" a planned FYP2 feature (note only), or should the UC text be corrected to single-topic/difficulty now?
4. **C1-3 admin scope:** soften the §1.5.2 admin bullets, or just add note N4?
