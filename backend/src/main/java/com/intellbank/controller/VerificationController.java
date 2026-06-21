package com.intellbank.controller;

import com.intellbank.dto.GradeResult;
import com.intellbank.dto.SubmissionReview;
import com.intellbank.entity.Document;
import com.intellbank.entity.Question;
import com.intellbank.entity.Solution;
import com.intellbank.entity.Submission;
import com.intellbank.entity.User;
import com.intellbank.service.VerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * VerificationController – educator interface.
 *  - /pending, /{id}/approve|reject, /{id}/edit  → AI-solution HITL verification.
 *  - /submissions/...                            → grade student submissions (weakness pipeline).
 *
 * All endpoints return plain DTO maps rather than raw JPA entities: serializing entities
 * with un-initialised lazy associations (Submission→document, Solution→question) makes
 * Jackson choke on the Hibernate proxy (hibernateLazyInitializer) and throw a 500.
 */
@RestController
@RequestMapping("/api/verification")
@RequiredArgsConstructor
public class VerificationController {

    private final VerificationService verificationService;

    /** Resolve the logged-in user's email from the JWT principal (a {@link User} entity). */
    private static String emailOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getEmail();
    }

    // ── AI-solution verification ──────────────────────────────────────────────

    @GetMapping("/pending")
    public ResponseEntity<List<Map<String, Object>>> getPending() {
        return ResponseEntity.ok(verificationService.getPendingSolutions()
                .stream().map(VerificationController::toSolutionDto).collect(Collectors.toList()));
    }

    @GetMapping("/{solutionId}")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable UUID solutionId) {
        return ResponseEntity.ok(toSolutionDto(verificationService.getById(solutionId)));
    }

    @PutMapping("/{solutionId}/approve")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable UUID solutionId, Authentication auth) {
        return ResponseEntity.ok(toSolutionDto(verificationService.approve(solutionId, emailOf(auth))));
    }

    @PutMapping("/{solutionId}/reject")
    public ResponseEntity<Map<String, Object>> reject(@PathVariable UUID solutionId, Authentication auth) {
        // Rejection reason is captured by the UI for audit; reverting clears verification.
        return ResponseEntity.ok(toSolutionDto(verificationService.reject(solutionId, emailOf(auth))));
    }

    @PutMapping("/{solutionId}/edit")
    public ResponseEntity<Map<String, Object>> edit(@PathVariable UUID solutionId,
                                                    @RequestBody Map<String, Object> body,
                                                    Authentication auth) {
        String content     = (String) body.get("content");
        String explanation = (String) body.get("explanation");
        return ResponseEntity.ok(toSolutionDto(verificationService.edit(solutionId, content, explanation, emailOf(auth))));
    }

    // ── Student-submission grading ────────────────────────────────────────────

    /** Educator queue of submissions awaiting grading. */
    @GetMapping("/submissions/pending")
    public ResponseEntity<List<Map<String, Object>>> getPendingSubmissions() {
        return ResponseEntity.ok(verificationService.getPendingSubmissions()
                .stream().map(VerificationController::toSubmissionDto).collect(Collectors.toList()));
    }

    /** Full review payload (answered doc + questions + topics) for one submission. */
    @GetMapping("/submissions/{submissionId}")
    public ResponseEntity<SubmissionReview> reviewSubmission(@PathVariable UUID submissionId) {
        return ResponseEntity.ok(verificationService.getSubmissionReview(submissionId));
    }

    /**
     * Grade a submission.
     * Body: { "marks": { "<questionId>": <awarded>, ... } }
     * Returns the auto-computed total and per-topic mastery breakdown.
     */
    @PutMapping("/submissions/{submissionId}/grade")
    @SuppressWarnings("unchecked")
    public ResponseEntity<GradeResult> gradeSubmission(@PathVariable UUID submissionId,
                                                       @RequestBody Map<String, Object> body,
                                                       Authentication auth) {
        Map<String, Object> raw = (Map<String, Object>) body.getOrDefault("marks", Map.of());
        Map<UUID, Integer> questionMarks = raw.entrySet().stream().collect(Collectors.toMap(
                e -> UUID.fromString(e.getKey()),
                e -> e.getValue() == null ? 0 : ((Number) e.getValue()).intValue()));
        return ResponseEntity.ok(verificationService.gradeSubmission(submissionId, questionMarks, emailOf(auth)));
    }

    /** Return a graded submission to the student (frees their submission slot). */
    @PutMapping("/submissions/{submissionId}/return")
    public ResponseEntity<Map<String, Object>> returnSubmission(@PathVariable UUID submissionId) {
        return ResponseEntity.ok(toSubmissionDto(verificationService.returnSubmission(submissionId)));
    }

    // ── DTO mappers (avoid serialising lazy JPA proxies) ──────────────────────

    private static Map<String, Object> toSolutionDto(Solution s) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("solutionId", s.getSolutionId());
        map.put("content", s.getContent());
        map.put("explanation", s.getExplanation());
        map.put("isVerified", s.getIsVerified());
        try {
            Question q = s.getQuestion();
            if (q != null) {
                Map<String, Object> qMap = new LinkedHashMap<>();
                qMap.put("questionId", q.getQuestionId());
                qMap.put("content", q.getContent());
                map.put("question", qMap);
            }
        } catch (Exception ignored) { /* lazy question may be absent */ }
        return map;
    }

    private static Map<String, Object> toSubmissionDto(Submission s) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("submissionId", s.getSubmissionId());
        map.put("status", s.getStatus());
        map.put("marks", s.getMarks());
        try {
            Document doc = s.getDocument();
            if (doc != null) {
                Map<String, Object> docMap = new LinkedHashMap<>();
                docMap.put("documentId", doc.getDocumentId());
                docMap.put("title", doc.getTitle() != null ? doc.getTitle() : "");
                docMap.put("type", doc.getType() != null ? doc.getType() : "");
                map.put("document", docMap);
            }
        } catch (Exception ignored) { /* lazy document may be absent */ }
        return map;
    }
}
