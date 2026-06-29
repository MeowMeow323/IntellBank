package com.intellbank.service;

import com.intellbank.dto.GradeResult;
import com.intellbank.dto.SubmissionReview;
import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * VerificationService – the educator-facing service. Two responsibilities:
 *
 * 1. AI-solution verification (HITL): approve / reject / edit a
 * {@link Solution#getIsVerified()}.
 * 2. Student submission grading: the educator enters per-question marks; the
 * service
 * auto-computes the total and spreads each question's marks across its topics
 * to
 * produce a per-topic mastery score, which is persisted as
 * {@link StudentPerformance}
 * (the student's weakness profile). Per-question marks themselves are transient
 * (ERD-strict) — only the submission total and topic mastery are stored.
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class VerificationService {
    private static final String STATUS_GRADED = "GRADED";
    private static final String STATUS_RETURNED = "RETURNED";

    private final SolutionRepository solutionRepository;
    private final SolutionHistoryRepository historyRepository;
    private final UserRepository userRepository;

    // Submission-grading collaborators
    private final SubmissionRepository submissionRepository;
    private final DocumentQuestionRepository documentQuestionRepository;
    private final QuestionTopicRepository questionTopicRepository;
    private final StudentPerformanceRepository performanceRepository;
    private final EducatorRepository educatorRepository;
    private final SpecializationService specializationService;
    // ── AI-solution verification (unchanged behaviour) ────────────────────────

    /** Get all solutions pending verification (isVerified = false). */
    public List<Solution> getPendingSolutions() {
        return solutionRepository.findByIsVerifiedFalse();
    }

    public Solution getById(UUID solutionId) {
        return solutionRepository.findById(solutionId)
                .orElseThrow(() -> new AppException("Solution not found", HttpStatus.NOT_FOUND));
    }

    /** Approve: set isVerified = true, record who/when. */
    @Transactional
    public Solution approve(UUID solutionId, String reviewerEmail) {
        Solution solution = getById(solutionId);
        solution.setIsVerified(true);
        solution.setVerifiedBy(getUser(reviewerEmail));
        solution.setVerifiedAt(OffsetDateTime.now());
        return solutionRepository.save(solution);
    }

    /** Reject (revert): set isVerified = false, clear verifier. */
    @Transactional
    public Solution reject(UUID solutionId, String reviewerEmail) {
        Solution solution = getById(solutionId);
        solution.setIsVerified(false);
        solution.setVerifiedBy(null);
        solution.setVerifiedAt(null);
        return solutionRepository.save(solution);
    }

    /** Edit content/explanation; writes a SolutionHistory row first and resets verification. */
    @Transactional
    public Solution edit(UUID solutionId, String newContent, String newExplanation, String editorEmail) {
        Solution solution = getById(solutionId);
        User editor = getUser(editorEmail);

        boolean contentChanging = newContent != null && !newContent.equals(solution.getContent());
        boolean explanationChanging = newExplanation != null && !newExplanation.equals(solution.getExplanation());

        if (contentChanging || explanationChanging) {
            historyRepository.save(SolutionHistory.builder()
                    .solution(solution)
                    .oldContent(solution.getContent())
                    .oldExplanation(solution.getExplanation())
                    .changedBy(editor)
                    .build());

            if (contentChanging)
                solution.setContent(newContent);
            if (explanationChanging)
                solution.setExplanation(newExplanation);

            solution.setIsVerified(false);
            solution.setVerifiedBy(null);
            solution.setVerifiedAt(null);
        }
        return solutionRepository.save(solution);
    }

    // ── Student-submission grading ────────────────────────────────────────────

    /** Educator queue: every submission currently PENDING review. */
    public List<Submission> getPendingSubmissions() {
        return submissionRepository.findByStatus("PENDING");
    }

    /**
     * Enriched educator queue for the Verification list: PENDING, GRADED and
     * RETURNED submissions, each carrying student name, derived subject and a
     * submitted-date proxy so the frontend can search / filter / sort. Sorted
     * most-recent first.
     */
    public List<com.intellbank.dto.SubmissionQueueItem> getSubmissionQueue(String email, String role) {
        List<Submission> subs = submissionRepository.findByStatusIn(
                List.of("PENDING", STATUS_GRADED, STATUS_RETURNED));

        List<com.intellbank.dto.SubmissionQueueItem> out = new ArrayList<>();
        for (Submission s : subs) {
            Document doc = s.getDocument();
            String title = "", type = "", studentName = "", subject = "";
            UUID documentId = null;
            OffsetDateTime submittedAt = null;
            if (doc != null) {
                documentId = doc.getDocumentId();
                title = doc.getTitle() != null ? doc.getTitle() : "";
                type = doc.getType() != null ? doc.getType() : "";
                submittedAt = doc.getCreatedAt();
                subject = deriveSubject(doc);
                try {
                    studentName = doc.getProject().getStudent().getUser().getFullName();
                } catch (Exception ignored) {
                    /* lazy chain may be absent */ }
            }
            // Specialization gate: educators only see submissions in their subjects
            // (admins see all; strict — no specialization means no rows).
            if (!specializationService.canHandleSubjectName(email, role, subject)) continue;
            out.add(new com.intellbank.dto.SubmissionQueueItem(
                    s.getSubmissionId(), s.getStatus(), s.getMarks(),
                    documentId, title, type, studentName, subject, submittedAt));
        }

        // Most-recent first; null dates sink to the bottom.
        out.sort((a, b) -> {
            if (a.submittedAt() == null) return 1;
            if (b.submittedAt() == null) return -1;
            return b.submittedAt().compareTo(a.submittedAt());
        });
        return out;
    }

    /** A paper's subject = the subject of any one of its questions' topics (papers are single-subject). */
    private String deriveSubject(Document doc) {
        for (DocumentQuestion dq : documentQuestionRepository.findByDocumentDocumentId(doc.getDocumentId())) {
            for (QuestionTopic qt : questionTopicRepository.findByQuestionQuestionId(dq.getQuestion().getQuestionId())) {
                try {
                    return qt.getTopic().getSubject().getName();
                } catch (Exception ignored) {
                    /* lazy proxy may be absent */ }
            }
        }
        return "";
    }

    /**
     * Build the full review payload for one submission — the answered document plus
     * every
     * question with its marks and topics. Drives both the grading screen and the
     * student's "view reviewed answers" screen.
     */
    public SubmissionReview getSubmissionReview(UUID submissionId, String email, String role) {
        // Educator path: enforce the specialization gate, then build the review.
        Submission gated = getSubmission(submissionId);
        specializationService.assertCanHandleSubjectName(email, role, deriveSubject(gated.getDocument()));
        return getSubmissionReview(submissionId);
    }

    /** Ungated builder — used by the student's own (owner-checked) review path. */
    public SubmissionReview getSubmissionReview(UUID submissionId) {
        Submission submission = getSubmission(submissionId);
        Document document = submission.getDocument();

        List<SubmissionReview.QuestionView> questionViews = new ArrayList<>();
        Map<UUID, Topic> uniqueTopics = new LinkedHashMap<>();
        for (DocumentQuestion dq : documentQuestionRepository.findByDocumentDocumentId(document.getDocumentId())) {
            Question q = dq.getQuestion();
            List<String> topicNames = new ArrayList<>();
            for (QuestionTopic qt : questionTopicRepository.findByQuestionQuestionId(q.getQuestionId())) {
                Topic t = qt.getTopic();
                topicNames.add(t.getName());
                uniqueTopics.putIfAbsent(t.getTopicId(), t);
            }
            questionViews.add(new SubmissionReview.QuestionView(
                    q.getQuestionId(),
                    q.getContent(),
                    q.getMarks() != null ? q.getMarks() : 0,
                    topicNames));
        }

        Student student = null;
        String studentName = "";
        try {
            student = document.getProject().getStudent();
            studentName = student.getUser().getFullName();
        } catch (Exception ignored) {
            /* defensive: lazy chain may be absent */ }

        // Per-topic mastery + educator comment, pulled from the student's saved
        // profile.
        List<SubmissionReview.TopicFeedback> topicFeedback = new ArrayList<>();
        if (student != null) {
            UUID studentId = student.getStudentId();
            for (Topic t : uniqueTopics.values()) {
                performanceRepository.findByStudentStudentIdAndTopicTopicId(studentId, t.getTopicId())
                        .ifPresent(p -> topicFeedback.add(new SubmissionReview.TopicFeedback(
                                t.getTopicId(), t.getName(), p.getMasteryLevel(), p.getComment())));
            }
        }

        return new SubmissionReview(
                submission.getSubmissionId(),
                document.getDocumentId(),
                document.getTitle(),
                document.getStorageUrl(),
                studentName,
                submission.getStatus(),
                submission.getMarks(),
                questionViews,
                topicFeedback);
    }

    /**
     * Grade a submission from a per-question marks map
     * ({@code questionId -> awardedMarks}).
     *
     * <p>
     * Computes the total, marks the submission GRADED, links the grading educator,
     * and
     * updates the student's per-topic {@link StudentPerformance} (weakness
     * profile).
     */
    @Transactional
    public GradeResult gradeSubmission(UUID submissionId, Map<UUID, Integer> questionMarks,
            Map<String, String> topicComments, String educatorEmail, String role) {
        Submission submission = getSubmission(submissionId);
        specializationService.assertCanHandleSubjectName(educatorEmail, role, deriveSubject(submission.getDocument()));
        // Once a submission has been returned to the student it is final — no re-grading.
        if (STATUS_RETURNED.equals(submission.getStatus())) {
            throw new AppException(
                    "This submission has been returned to the student and can no longer be graded.",
                    HttpStatus.CONFLICT);
        }
        Educator educator = resolveEducator(educatorEmail);
        Student student = submission.getDocument().getProject().getStudent();
        if (topicComments == null)
            topicComments = Map.of();

        int total = 0;
        int maxTotal = 0;
        // topicId -> [earned, possible]; a question's marks are split EVENLY across its
        // topics, so the running totals are fractional. LinkedHashMap keeps display
        // order.
        Map<UUID, double[]> topicTotals = new LinkedHashMap<>();
        Map<UUID, Topic> topicRefs = new HashMap<>();

        for (DocumentQuestion dq : documentQuestionRepository.findByDocumentDocumentId(
                submission.getDocument().getDocumentId())) {
            Question q = dq.getQuestion();
            int max = q.getMarks() != null ? q.getMarks() : 0;
            int awarded = clampAwarded(questionMarks.get(q.getQuestionId()), max);
            total += awarded;
            maxTotal += max;

            List<QuestionTopic> qts = questionTopicRepository.findByQuestionQuestionId(q.getQuestionId());
            if (qts.isEmpty())
                continue;
            double earnedShare = (double) awarded / qts.size();
            double possibleShare = (double) max / qts.size();
            for (QuestionTopic qt : qts) {
                Topic topic = qt.getTopic();
                topicRefs.putIfAbsent(topic.getTopicId(), topic);
                double[] acc = topicTotals.computeIfAbsent(topic.getTopicId(), k -> new double[2]);
                acc[0] += earnedShare; // earned
                acc[1] += possibleShare; // possible
            }
        }

        // Persist the submission outcome.
        submission.setMarks(total);
        submission.setStatus(STATUS_GRADED);
        submission.setEducator(educator);
        submissionRepository.save(submission);

        // Persist per-topic mastery + comment (weakness profile) and build the response
        // breakdown.
        List<GradeResult.TopicScore> topicScores = new ArrayList<>();
        for (Map.Entry<UUID, double[]> e : topicTotals.entrySet()) {
            double earned = e.getValue()[0];
            double possible = e.getValue()[1];
            int pct = possible > 0 ? (int) Math.round((earned * 100.0) / possible) : 0;
            String mastery = masteryBand(pct);

            Topic topic = topicRefs.get(e.getKey());
            String comment = topicComments.get(topic.getName());
            upsertPerformance(student, topic, mastery, comment);

            topicScores.add(new GradeResult.TopicScore(
                    topic.getTopicId(), topic.getName(),
                    round1(earned), round1(possible), pct, mastery, comment));
        }

        return new GradeResult(submission.getSubmissionId(), total, maxTotal, STATUS_GRADED, topicScores);
    }

    /**
     * Round to one decimal place for display (even-split marks can be fractional).
     */
    private double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    /**
     * Educator returns a graded submission to the student, freeing the student's
     * submission slot.
     */
    @Transactional
    public Submission returnSubmission(UUID submissionId, String email, String role) {
        Submission submission = getSubmission(submissionId);
        specializationService.assertCanHandleSubjectName(email, role, deriveSubject(submission.getDocument()));
        submission.setStatus(STATUS_RETURNED);
        return submissionRepository.save(submission);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Bands: <50 Beginner (weak) · 50–69 Intermediate · 70–89 Advanced · ≥90
     * Mastered.
     */
    private String masteryBand(int pct) {
        if (pct >= 90)
            return "Mastered";
        if (pct >= 70)
            return "Advanced";
        if (pct >= 50)
            return "Intermediate";
        return "Beginner";
    }

    private int clampAwarded(Integer awarded, int max) {
        if (awarded == null || awarded < 0)
            return 0;
        return Math.min(awarded, max);
    }

    private void upsertPerformance(Student student, Topic topic, String mastery, String comment) {
        StudentPerformance perf = performanceRepository
                .findByStudentStudentIdAndTopicTopicId(student.getStudentId(), topic.getTopicId())
                .orElseGet(() -> StudentPerformance.builder().student(student).topic(topic).build());
        perf.setMasteryLevel(mastery);
        // Only touch the comment when the educator supplied one for this topic (key
        // present);
        // a blank value clears it, an absent key keeps the previous comment.
        if (comment != null) {
            String c = comment.trim();
            perf.setComment(c.isEmpty() ? null : c);
        }
        performanceRepository.save(perf);
    }

    private Submission getSubmission(UUID submissionId) {
        return submissionRepository.findById(submissionId)
                .orElseThrow(() -> new AppException("Submission not found", HttpStatus.NOT_FOUND));
    }

    private Educator resolveEducator(String email) {
        User user = getUser(email);
        return educatorRepository.findByUserUserId(user.getUserId())
                .orElseThrow(() -> new AppException("Only educators can grade submissions.", HttpStatus.FORBIDDEN));
    }

    private User getUser(String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
    }
}