package com.intellbank.controller;

import com.intellbank.dto.SubmissionReview;
import com.intellbank.entity.Document;
import com.intellbank.entity.Submission;
import com.intellbank.entity.User;
import com.intellbank.service.SubmissionService;
import com.intellbank.service.VerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SubmissionController – students submit / withdraw answered "AI Generated
 * Exam" documents
 * and view their own submission history.
 * SubmissionController – students submit / withdraw answered "AI Generated
 * Exam" documents
 * and view their own submission history.
 */
@RestController
@RequestMapping("/api/submissions")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;
    private final VerificationService verificationService;

    /**
     * Resolve the logged-in user's email from the JWT principal (a {@link User}
     * entity).
     */
    private static String emailOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getEmail();
    }

    /**
     * POST /api/submissions Body: { documentId }
     * Enforces type = "AI Generated Exam" and the one-active-submission rule.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> submit(@RequestBody Map<String, Object> body, Authentication auth) {
        UUID documentId = UUID.fromString((String) body.get("documentId"));
        Submission sub = submissionService.submit(documentId, emailOf(auth));
        return ResponseEntity.ok(Map.of(
                "submissionId", sub.getSubmissionId(),
                "status", sub.getStatus()));
    }

    /**
     * POST /api/submissions/{id}/unsubmit – student withdraws (deletes) their own
     * PENDING submission.
     */
    @PostMapping("/{submissionId}/unsubmit")
    public ResponseEntity<Map<String, Object>> unsubmit(@PathVariable UUID submissionId, Authentication auth) {
        submissionService.unsubmit(submissionId, emailOf(auth));
        return ResponseEntity.ok(Map.of(
                "submissionId", submissionId,
                "status", "WITHDRAWN"));
    }

    /**
     * GET /api/submissions/{id}/review – the student's own reviewed answers.
     * Mirrors the educator review payload but is accessible to the submission owner
     * (the /api/verification/** endpoints are restricted to educators).
     */
    @GetMapping("/{submissionId}/review")
    public ResponseEntity<SubmissionReview> reviewMine(@PathVariable UUID submissionId, Authentication auth) {
        submissionService.assertOwner(submissionId, emailOf(auth));
        return ResponseEntity.ok(verificationService.getSubmissionReview(submissionId));
    }

    /** GET /api/submissions/mine – the logged-in student's submission history. */
    @GetMapping("/mine")
    public ResponseEntity<List<Map<String, Object>>> getMine(Authentication auth) {
        return ResponseEntity.ok(submissionService.getMySubmissions(emailOf(auth))
                .stream()
                .map(SubmissionController::toDto)
                .collect(Collectors.toList()));
    }

    @GetMapping("/by-document/{documentId}")
    public ResponseEntity<List<Map<String, Object>>> getByDocument(@PathVariable UUID documentId) {
        return ResponseEntity.ok(submissionService.getByDocument(documentId)
                .stream()
                .map(SubmissionController::toDto)
                .collect(Collectors.toList()));
    }

    @GetMapping("/{submissionId}")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable UUID submissionId) {
        return ResponseEntity.ok(toDto(submissionService.getById(submissionId)));
    }

    private static Map<String, Object> toDto(Submission s) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("submissionId", s.getSubmissionId());
        map.put("status", s.getStatus());
        map.put("marks", s.getMarks());
        Document doc = s.getDocument();
        if (doc != null) {
            Map<String, Object> docMap = new LinkedHashMap<>();
            docMap.put("documentId", doc.getDocumentId());
            docMap.put("title", doc.getTitle() != null ? doc.getTitle() : "");
            docMap.put("type", doc.getType() != null ? doc.getType() : "");
            docMap.put("createdAt", doc.getCreatedAt() != null ? doc.getCreatedAt().toString() : "");
            map.put("document", docMap);
        }
        return map;
    }
}