package com.intellbank.controller;

import com.intellbank.entity.Submission;
import com.intellbank.service.SubmissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SubmissionController – students submit answered AI Generated Exam documents.
 */
@RestController
@RequestMapping("/api/submissions")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;

    /**
     * POST /api/submissions
     * Body: { documentId }
     * Rejects if Document.Type != "AI Generated Exam"
     */
    @PostMapping
    public ResponseEntity<Submission> submit(@RequestBody Map<String, Object> body) {
        UUID documentId = UUID.fromString((String) body.get("documentId"));
        return ResponseEntity.ok(submissionService.submit(documentId));
    }

    @GetMapping("/by-document/{documentId}")
    public ResponseEntity<List<Submission>> getByDocument(@PathVariable UUID documentId) {
        return ResponseEntity.ok(submissionService.getByDocument(documentId));
    }

    @GetMapping("/{submissionId}")
    public ResponseEntity<Submission> getById(@PathVariable UUID submissionId) {
        return ResponseEntity.ok(submissionService.getById(submissionId));
    }
}
