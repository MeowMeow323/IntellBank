package com.intellbank.controller;

import com.intellbank.service.ExamService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * ExamController – generates AI exams stored as Documents.
 * No GeneratedExam table is involved.
 */
@RestController
@RequestMapping("/api/exams")
@RequiredArgsConstructor
public class ExamController {

    private final ExamService examService;

    /**
     * POST /api/exams/generate
     * Body: { projectId, title, subject, topic, difficulty, questionCount }
     * Returns: the created Document and its questions.
     */
    @PostMapping("/generate")
    public ResponseEntity<Map<String, Object>> generate(@RequestBody Map<String, Object> body) {
        UUID projectId = UUID.fromString((String) body.get("projectId"));
        String title   = (String) body.get("title");
        String subject = (String) body.getOrDefault("subject", "General");
        String topic   = (String) body.get("topic");
        String diff    = (String) body.getOrDefault("difficulty", "Medium");
        int count      = (int) body.getOrDefault("questionCount", 5);

        return ResponseEntity.ok(examService.generate(projectId, title, subject, topic, diff, count));
    }

    /** GET /api/exams/{documentId} – retrieve an AI Generated Exam by its Document ID. */
    @GetMapping("/{documentId}")
    public ResponseEntity<Map<String, Object>> getExam(@PathVariable UUID documentId) {
        return ResponseEntity.ok(examService.getExam(documentId));
    }
}
