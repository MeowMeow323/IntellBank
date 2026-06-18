package com.intellbank.controller;

import com.intellbank.service.AiClientService;
import com.intellbank.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiGatewayController {

    private final AiClientService aiClientService;
    private final DocumentService documentService;

    /** POST /api/ai/ocr/extract */
    @PostMapping("/ocr/extract")
    public ResponseEntity<Map<String, String>> extractText(@RequestBody Map<String, String> body) {
        String text = aiClientService.extractText(
                body.get("storage_path"),
                body.getOrDefault("file_type", "application/pdf")
        );
        return ResponseEntity.ok(Map.of("text", text));
    }

    /** POST /api/ai/classify/question */
    @PostMapping("/classify/question")
    public ResponseEntity<Map<String, Object>> classifyQuestion(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiClientService.classifyQuestion(body.get("question_text")));
    }

    /** POST /api/ai/predict/topics */
    @PostMapping("/predict/topics")
    public ResponseEntity<Map<String, Object>> predictTopics(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(aiClientService.predictTopics(body.get("subject")));
    }

    /** POST /api/ai/generate/question */
    @PostMapping("/generate/question")
    public ResponseEntity<Map<String, Object>> generateQuestion(@RequestBody Map<String, Object> body) {
        List<String> questions = aiClientService.generateQuestions(
                (String) body.get("subject"),
                (String) body.get("topic"),
                (String) body.getOrDefault("difficulty", "MEDIUM"),
                body.get("count") != null ? (Integer) body.get("count") : 1
        );
        return ResponseEntity.ok(Map.of("questions", questions));
    }

    /** POST /api/ai/generate/solution */
    @PostMapping("/generate/solution")
    public ResponseEntity<Map<String, String>> generateSolution(@RequestBody Map<String, String> body) {
        String solution = aiClientService.generateSolution(body.get("question_text"));
        return ResponseEntity.ok(Map.of("solution", solution));
    }

    /** POST /api/ai/generate/paper */
    @PostMapping("/generate/paper")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> generatePaper(@RequestBody Map<String, Object> body) {
        String subject      = (String) body.get("subject");
        int totalMarks      = body.get("total_marks") != null ? (Integer) body.get("total_marks") : 100;
        List<String> topics = body.get("topics") != null
                ? (List<String>) body.get("topics")
                : List.of("General");
        String documentIdStr = (String) body.get("document_id");

        Map<String, Object> result = aiClientService.generatePaper(subject, totalMarks, topics);

        // Save generated questions + document_questions if document_id was provided
        if (documentIdStr != null && !documentIdStr.isBlank() && result.containsKey("questions")) {
            try {
                UUID documentId = UUID.fromString(documentIdStr);
                List<Map<String, Object>> questions = (List<Map<String, Object>>) result.get("questions");
                documentService.saveAiGeneratedQuestions(documentId, questions);
            } catch (Exception e) {
                // Non-fatal — paper still renders even if DB save fails
            }
        }

        return ResponseEntity.ok(result);
    }
}