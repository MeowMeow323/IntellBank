package com.intellbank.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;

/**
 * AiClientService – the ONLY class in Spring Boot that communicates with the Python FastAPI AI service.
 * Frontend NEVER calls the AI service directly; all AI requests are proxied through this service.
 *
 * @SuppressWarnings("null") suppresses Eclipse JDT false-positive null warnings on HttpMethod
 * and ParameterizedTypeReference arguments, which are statically non-null constants.
 */
@SuppressWarnings("null")
@Slf4j
@Service
@RequiredArgsConstructor
public class AiClientService {

    @Value("${ai.service.base-url}")
    private String aiBaseUrl;

    private final RestTemplate restTemplate;

    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {};

    /**
     * OCR only the cover page of a PDF and return extracted metadata
     * (course code, course name, exam session) for pre-filling the upload dialog.
     * POST /ai/ocr/preview
     */
    public Map<String, Object> previewPaper(MultipartFile file) {
        String url = aiBaseUrl + "/ai/ocr/preview";
        try {
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            byte[] bytes = file.getBytes();
            String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload.pdf";
            body.add("file", new ByteArrayResource(bytes) {
                @Override public String getFilename() { return filename; }
            });
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(body, headers), MAP_TYPE);
            return response.getBody() != null ? response.getBody() : Map.of();
        } catch (Exception e) {
            log.warn("Preview OCR unavailable: {}", e.getMessage());
            return Map.of();
        }
    }

    /**
     * Extract text from a document via OCR.
     * POST /ai/ocr/extract
     */
    public String extractText(String storagePath, String fileType) {
        String url = aiBaseUrl + "/ai/ocr/extract";
        Map<String, Object> body = Map.of("storage_path", storagePath, "file_type", fileType);
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("text")) {
                return (String) responseBody.get("text");
            }
            return "";
        } catch (Exception e) {
            log.error("OCR service error: {}", e.getMessage());
            throw new RuntimeException("AI OCR service unavailable: " + e.getMessage());
        }
    }

    /**
     * Classify a question's subject and topic.
     * POST /ai/classify/question
     */
    public Map<String, Object> classifyQuestion(String questionText) {
        String url = aiBaseUrl + "/ai/classify/question";
        Map<String, Object> body = Map.of("question_text", questionText);
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Classification service error: {}", e.getMessage());
            throw new RuntimeException("AI Classification service unavailable: " + e.getMessage());
        }
    }

    /**
     * Predict upcoming exam topics.
     * POST /ai/predict/topics
     */
    public Map<String, Object> predictTopics(String subject) {
        String url = aiBaseUrl + "/ai/predict/topics";
        Map<String, Object> body = Map.of("subject", subject);
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Prediction service error: {}", e.getMessage());
            throw new RuntimeException("AI Prediction service unavailable: " + e.getMessage());
        }
    }

    /**
     * Subjects that actually have trained topic-prediction data.
     * GET /ai/predict/subjects
     */
    @SuppressWarnings("unchecked")
    public List<String> predictionSubjects() {
        String url = aiBaseUrl + "/ai/predict/subjects";
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            Object subjects = responseBody != null ? responseBody.get("subjects") : null;
            return subjects instanceof List ? (List<String>) subjects : List.of();
        } catch (Exception e) {
            log.error("Prediction subjects service error: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Cohort "Class Weakness" analysis for a subject — the project's own trained model.
     * GET /ai/analyze/weaknesses?subject=...
     */
    public Map<String, Object> classWeaknesses(String subject) {
        String url = aiBaseUrl + "/ai/analyze/weaknesses?subject={subject}";
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE, subject);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Class-weakness service error: {}", e.getMessage());
            return Map.of(
                    "eligible", false,
                    "reason", "Weakness analysis service unavailable: " + e.getMessage(),
                    "topics", List.of());
        }
    }

    /**
     * Generate questions using the fine-tuned FLAN-T5-small model.
     * POST /ai/generate/question
     */
    @SuppressWarnings("unchecked")
    public List<String> generateQuestions(String subject, String topic, String difficulty, int count) {
        String url = aiBaseUrl + "/ai/generate/question";
        Map<String, Object> body = Map.of(
                "subject", subject,
                "topic", topic != null ? topic : "",
                "difficulty", difficulty,
                "count", count
        );
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("questions")) {
                return (List<String>) responseBody.get("questions");
            }
            return List.of();
        } catch (Exception e) {
            log.error("Question generation service error: {}", e.getMessage());
            throw new RuntimeException("AI Generation service unavailable: " + e.getMessage());
        }
    }

    /**
     * Generate a model solution for a given question.
     * POST /ai/generate/solution
     */
    public String generateSolution(String questionText) {
        String url = aiBaseUrl + "/ai/generate/solution";
        Map<String, Object> body = Map.of("question_text", questionText);
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("solution")) {
                return (String) responseBody.get("solution");
            }
            return "";
        } catch (Exception e) {
            log.error("Solution generation service error: {}", e.getMessage());
            throw new RuntimeException("AI Solution generation service unavailable: " + e.getMessage());
        }
    }

    /**
     * Generate a full structured exam paper.
     * POST /ai/generate/paper
     */
    public Map<String, Object> generatePaper(String subject, int totalMarks, List<String> topics) {
        String url = aiBaseUrl + "/ai/generate/paper";
        Map<String, Object> body = Map.of(
                "subject",     subject,
                "total_marks", totalMarks,
                "topics",      topics
        );
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            // The AI service returned a 4xx/5xx — surface its actual error body
            // (e.g. the Python traceback detail) instead of a generic message.
            String detail = e.getResponseBodyAsString();
            log.error("Paper generation service error {}: {}", e.getStatusCode(), detail);
            return Map.of("error", "AI service error (" + e.getStatusCode() + "): " + detail);
        } catch (Exception e) {
            log.error("Paper generation service error: {}", e.getMessage());
            return Map.of("error", "AI Paper generation service unavailable: " + e.getMessage());
        }
    }

    /**
     * Generate model answers for a batch of past-year paper questions via Gemini 2.0 Flash.
     * POST /ai/generate/pyp-solutions
     */
    public Map<String, Object> generatePypSolutions(List<Map<String, Object>> questions) {
        String url = aiBaseUrl + "/ai/generate/pyp-solutions";
        Map<String, Object> body = Map.of("questions", questions);
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("PYP solution generation service error: {}", e.getMessage());
            throw new RuntimeException("AI PYP solution generation unavailable: " + e.getMessage());
        }
    }

    /**
     * Runs the full OCR -> parse -> classify -> store pipeline for a past
     * year paper that's already been uploaded to Storage + recorded in
     * past_year_papers (see PastYearPaperService.uploadPaper).
     * POST /ai/ocr/process-paper
     */
    public Map<String, Object> processPastYearPaper(UUID pypId) {
        String url = aiBaseUrl + "/ai/ocr/process-paper";
        Map<String, Object> body = Map.of("pyp_id", pypId.toString());
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.POST, buildRequest(body), MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Process-paper service error: {}", e.getMessage());
            throw new RuntimeException("AI OCR processing service unavailable: " + e.getMessage());
        }
    }

    /**
     * Live status/step for a queued or running process-paper job.
     * GET /ai/ocr/process-paper/{pypId}/progress
     */
    public Map<String, Object> getProcessingProgress(UUID pypId) {
        String url = aiBaseUrl + "/ai/ocr/process-paper/" + pypId + "/progress";
        try {
            ResponseEntity<Map<String, Object>> response =
                    restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Process-paper progress service error: {}", e.getMessage());
            throw new RuntimeException("AI OCR progress service unavailable: " + e.getMessage());
        }
    }

    /**
     * Per-topic question count and difficulty distribution for a subject.
     * GET /ai/analytics/topic-frequency?subject=...&limit=N
     * limit=null → all questions; limit=N → restrict to N most recently uploaded papers.
     */
    public Map<String, Object> topicFrequency(String subject, Integer limit) {
        String url = limit != null
                ? aiBaseUrl + "/ai/analytics/topic-frequency?subject={subject}&limit={limit}"
                : aiBaseUrl + "/ai/analytics/topic-frequency?subject={subject}";
        try {
            ResponseEntity<Map<String, Object>> response = limit != null
                    ? restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE, subject, limit)
                    : restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE, subject);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Topic frequency service error: {}", e.getMessage());
            return Map.of("error", "Analytics service unavailable: " + e.getMessage(), "topics", List.of());
        }
    }

    /**
     * Year-by-year topic coverage for a subject from past-year-paper upload dates.
     * GET /ai/analytics/subject-trend?subject=...&limit=N
     */
    public Map<String, Object> subjectTrend(String subject, Integer limit) {
        String url = limit != null
                ? aiBaseUrl + "/ai/analytics/subject-trend?subject={subject}&limit={limit}"
                : aiBaseUrl + "/ai/analytics/subject-trend?subject={subject}";
        try {
            ResponseEntity<Map<String, Object>> response = limit != null
                    ? restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE, subject, limit)
                    : restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, MAP_TYPE, subject);
            Map<String, Object> responseBody = response.getBody();
            return responseBody != null ? responseBody : Map.of();
        } catch (Exception e) {
            log.error("Subject trend service error: {}", e.getMessage());
            return Map.of("error", "Analytics service unavailable: " + e.getMessage(), "years", List.of());
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private HttpEntity<Map<String, Object>> buildRequest(Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
