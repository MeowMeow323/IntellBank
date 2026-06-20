package com.intellbank.controller;

import com.intellbank.service.AiClientService;
import com.intellbank.service.DocumentService;
import com.intellbank.util.QuestionHtmlFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
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

        // Copy into a mutable map — Jackson may return an unmodifiable view
        Map<String, Object> result = new LinkedHashMap<>(aiClientService.generatePaper(subject, totalMarks, topics));

        // Replace raw markdown_content with properly formatted HTML
        System.out.println("[AiGateway] result keys: " + result.keySet());
        if (result.containsKey("questions")) {
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> questions = (List<Map<String, Object>>) result.get("questions");
                System.out.println("[AiGateway] building formatted HTML for " + questions.size() + " questions");
                String formattedHtml = buildFormattedPaperHtml(subject, questions);
                System.out.println("[AiGateway] formattedHtml length=" + formattedHtml.length()
                        + " hasPageMarkers=" + formattedHtml.contains("<!--PAGE-->"));
                result.put("markdown_content", formattedHtml);

                // Save questions to DB non-fatally
                if (documentIdStr != null && !documentIdStr.isBlank()) {
                    try {
                        documentService.saveAiGeneratedQuestions(UUID.fromString(documentIdStr), questions);
                    } catch (Exception ignored) {}
                }
            } catch (Exception e) {
                // Log but don't fail — Python markdown will be used as fallback
                System.err.println("[AiGateway] buildFormattedPaperHtml failed: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(result);
    }

    private String buildFormattedPaperHtml(String subject, List<Map<String, Object>> questions) {
        final String PB = "<!--PAGE-->";
        StringBuilder html = new StringBuilder();

        // Cover page — professional centered exam header
        html.append("<div style=\"text-align:center;padding:1rem 0 2rem;\">")
            .append("<p style=\"font-size:0.8rem;letter-spacing:0.1em;color:#475569;margin:0 0 0.25rem;\">")
            .append("FACULTY OF COMPUTING AND INFORMATION TECHNOLOGY</p>")
            .append("<h1 style=\"font-family:Georgia,serif;font-size:1.5rem;font-weight:bold;margin:0.5rem 0;\">")
            .append(subject.toUpperCase()).append("</h1>")
            .append("<p style=\"font-size:0.95rem;color:#475569;margin:0 0 1rem;\">EXAMINATION PAPER</p>")
            .append("<hr style=\"border:none;border-top:2px solid #334155;margin:0.75rem auto;width:60%;\">")
            .append("<table style=\"width:100%;margin:0.75rem 0;font-size:0.9rem;\"><tr>")
            .append("<td style=\"text-align:left;\"><strong>Total Marks:</strong> 100</td>")
            .append("<td style=\"text-align:center;\"><strong>Questions:</strong> 4</td>")
            .append("<td style=\"text-align:right;\"><strong>Duration:</strong> 2½ Hours</td>")
            .append("</tr></table>")
            .append("<hr style=\"border:none;border-top:1px solid #cbd5e1;margin:0.5rem 0;\">")
            .append("<p style=\"font-size:0.85rem;color:#64748b;margin:0.5rem 0 0;\">")
            .append("Answer <strong>ALL</strong> 4 questions. Each question carries <strong>25 marks</strong>.</p>")
            .append("</div>");

        // Questions — one per page, topic hidden as data attribute (not visible)
        for (int i = 0; i < questions.size(); i++) {
            String rawText = String.valueOf(questions.get(i).getOrDefault("text", ""));
            String topic   = String.valueOf(questions.get(i).getOrDefault("topic", ""));

            html.append(PB);
            // topic stored as data-topic attribute for JS to read if needed, NOT rendered as text
            html.append("<h2 style=\"font-size:1.2rem;font-weight:bold;border-bottom:2px solid #334155;padding-bottom:0.4rem;margin-bottom:1.25rem;\" data-topic=\"")
                .append(topic).append("\">Question ").append(i + 1).append(" &nbsp;&nbsp; [25 Marks]</h2>");

            html.append(QuestionHtmlFormatter.format(rawText));

            html.append("<div style=\"margin-top:2rem;border-top:1px solid #cbd5e1;padding-top:0.6rem;\">")
                .append("<p style=\"text-align:right;font-weight:600;font-size:0.9rem;margin:0;\">[Total: 25 marks]</p>")
                .append("</div>");
            html.append("<p style=\"margin-top:1rem;color:#94a3b8;font-size:0.85rem;font-style:italic;\">")
                .append("&mdash; End of Question ").append(i + 1).append(" &mdash;</p>");
        }

        return html.toString();
    }
}