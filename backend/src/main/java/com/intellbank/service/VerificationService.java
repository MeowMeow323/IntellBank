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
 *  1. AI-solution verification (HITL): approve / reject / edit a {@link Solution#getIsVerified()}.
 *  2. Student submission grading: the educator enters per-question marks; the service
 *     auto-computes the total and spreads each question's marks across its topics to
 *     produce a per-topic mastery score, which is persisted as {@link StudentPerformance}
 *     (the student's weakness profile). Per-question marks themselves are transient
 *     (ERD-strict) — only the submission total and topic mastery are stored.
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class VerificationService {

    private static final String STATUS_GRADED   = "GRADED";
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

        boolean contentChanging     = newContent != null && !newContent.equals(solution.getContent());
        boolean explanationChanging = newExplanation != null && !newExplanation.equals(solution.getExplanation());

        if (contentChanging || explanationChanging) {
            historyRepository.save(SolutionHistory.builder()
                    .solution(solution)
                    .oldContent(solution.getContent())
                    .oldExplanation(solution.getExplanation())
                    .changedBy(editor)
                    .build());

            if (contentChanging) solution.setContent(newContent);
            if (explanationChanging) solution.setExplanation(newExplanation);

            solution.setIsVerified(false);
            solution.setVerifiedBy(null);
            solution.setVerifiedAt(null);
        }
        return solutionRepository.save(solution);
    }

    // ── Student-submission grading (adjustment #4) ────────────────────────────

    /** Educator queue: every submission currently PENDING review. */
    public List<Submission> getPendingSubmissions() {
        return submissionRepository.findByStatus("PENDING");
    }

    /**
     * Build the full review payload for one submission — the answered document plus every
     * question with its marks and topics. Drives both the grading screen and the
     * student's "view reviewed answers" screen.
     */
    public SubmissionReview getSubmissionReview(UUID submissionId) {
        Submission submission = getSubmission(submissionId);
        Document document = submission.getDocument();

        List<SubmissionReview.QuestionView> questionViews = new ArrayList<>();
        for (DocumentQuestion dq : documentQuestionRepository.findByDocumentDocumentId(document.getDocumentId())) {
            Question q = dq.getQuestion();
            List<String> topicNames = questionTopicRepository.findByQuestionQuestionId(q.getQuestionId()).stream()
                    .map(qt -> qt.getTopic().getName())
                    .toList();
            questionViews.add(new SubmissionReview.QuestionView(
                    q.getQuestionId(),
                    q.getContent(),
                    q.getMarks() != null ? q.getMarks() : 0,
                    topicNames));
        }

        String studentName = "";
        try {
            studentName = document.getProject().getStudent().getUser().getFullName();
        } catch (Exception ignored) { /* defensive: lazy chain may be absent */ }

        return new SubmissionReview(
                submission.getSubmissionId(),
                document.getDocumentId(),
                document.getTitle(),
                document.getStorageUrl(),
                studentName,
                submission.getStatus(),
                submission.getMarks(),
                questionViews);
    }

    /**
     * Grade a submission from a per-question marks map ({@code questionId -> awardedMarks}).
     *
     * <p>Computes the total, marks the submission GRADED, links the grading educator, and
     * updates the student's per-topic {@link StudentPerformance} (weakness profile).
     */
    @Transactional
    public GradeResult gradeSubmission(UUID submissionId, Map<UUID, Integer> questionMarks, String educatorEmail) {
        Submission submission = getSubmission(submissionId);
        Educator educator = resolveEducator(educatorEmail);
        Student student = submission.getDocument().getProject().getStudent();

        int total = 0;
        // topicId -> [earned, possible]; LinkedHashMap keeps a stable display order.
        Map<UUID, int[]> topicTotals = new LinkedHashMap<>();
        Map<UUID, Topic> topicRefs = new HashMap<>();

        for (DocumentQuestion dq : documentQuestionRepository.findByDocumentDocumentId(
                submission.getDocument().getDocumentId())) {
            Question q = dq.getQuestion();
            int max = q.getMarks() != null ? q.getMarks() : 0;
            int awarded = clampAwarded(questionMarks.get(q.getQuestionId()), max);
            total += awarded;

            for (QuestionTopic qt : questionTopicRepository.findByQuestionQuestionId(q.getQuestionId())) {
                Topic topic = qt.getTopic();
                topicRefs.putIfAbsent(topic.getTopicId(), topic);
                int[] acc = topicTotals.computeIfAbsent(topic.getTopicId(), k -> new int[2]);
                acc[0] += awarded; // earned
                acc[1] += max;     // possible
            }
        }

        // Persist the submission outcome.
        submission.setMarks(total);
        submission.setStatus(STATUS_GRADED);
        submission.setEducator(educator);
        submissionRepository.save(submission);

        // Persist per-topic mastery (weakness profile) and build the response breakdown.
        List<GradeResult.TopicScore> topicScores = new ArrayList<>();
        int maxTotal = 0;
        for (Map.Entry<UUID, int[]> e : topicTotals.entrySet()) {
            int earned = e.getValue()[0];
            int possible = e.getValue()[1];
            maxTotal += possible;
            int pct = possible > 0 ? Math.round((earned * 100f) / possible) : 0;
            String mastery = masteryBand(pct);

            Topic topic = topicRefs.get(e.getKey());
            upsertPerformance(student, topic, mastery);

            topicScores.add(new GradeResult.TopicScore(
                    topic.getTopicId(), topic.getName(), earned, possible, pct, mastery));
        }

        return new GradeResult(submission.getSubmissionId(), total, maxTotal, STATUS_GRADED, topicScores);
    }

    /** Educator returns a graded submission to the student, freeing the student's submission slot. */
    @Transactional
    public Submission returnSubmission(UUID submissionId) {
        Submission submission = getSubmission(submissionId);
        submission.setStatus(STATUS_RETURNED);
        return submissionRepository.save(submission);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Bands: <50 Beginner (weak) · 50–69 Intermediate · 70–89 Advanced · ≥90 Mastered. */
    private String masteryBand(int pct) {
        if (pct >= 90) return "Mastered";
        if (pct >= 70) return "Advanced";
        if (pct >= 50) return "Intermediate";
        return "Beginner";
    }

    private int clampAwarded(Integer awarded, int max) {
        if (awarded == null || awarded < 0) return 0;
        return Math.min(awarded, max);
    }

    private void upsertPerformance(Student student, Topic topic, String mastery) {
        StudentPerformance perf = performanceRepository
                .findByStudentStudentIdAndTopicTopicId(student.getStudentId(), topic.getTopicId())
                .orElseGet(() -> StudentPerformance.builder().student(student).topic(topic).build());
        perf.setMasteryLevel(mastery);
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