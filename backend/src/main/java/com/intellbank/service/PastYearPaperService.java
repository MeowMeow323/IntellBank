package com.intellbank.service;

import com.intellbank.dto.PastYearPaperResponse;
import com.intellbank.entity.PastYearPaper;
import com.intellbank.entity.Question;
import com.intellbank.entity.QuestionTopic;
import com.intellbank.entity.Solution;
import com.intellbank.exception.AppException;
import com.intellbank.repository.DocumentQuestionRepository;
import com.intellbank.repository.PastYearPaperRepository;
import com.intellbank.repository.QuestionRepository;
import com.intellbank.repository.QuestionTopicRepository;
import com.intellbank.repository.SolutionHistoryRepository;
import com.intellbank.repository.SolutionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PastYearPaperService {

    private final PastYearPaperRepository pastYearPaperRepository;
    private final QuestionRepository questionRepository;
    private final QuestionTopicRepository questionTopicRepository;
    private final DocumentQuestionRepository documentQuestionRepository;
    private final SolutionRepository solutionRepository;
    private final SolutionHistoryRepository solutionHistoryRepository;
    private final SupabaseStorageService supabaseStorageService;
    private final AiClientService aiClientService;
    private final SpecializationService specializationService;

    private static final String ROLE_EDUCATOR = "EDUCATOR";

    /** Educators see only papers in their specialized subjects; admins see all. */
    public List<PastYearPaperResponse> getAll(String email, String role) {
        boolean educator = ROLE_EDUCATOR.equals(role);
        Set<String> allowed = educator ? specializationService.subjectNamesForEducator(email) : null;
        return pastYearPaperRepository.findAll().stream()
                .map(this::toEnrichedResponse)
                .filter(r -> !educator || (r.subject() != null && allowed.contains(r.subject())))
                .collect(Collectors.toList());
    }

    /** List response enriched with the paper's subject and grouped (full) question count. */
    private PastYearPaperResponse toEnrichedResponse(PastYearPaper paper) {
        List<Question> questions = questionRepository.findByPastYearPaperPypId(paper.getPypId());
        String subject = paper.getSubject();   // stored at upload (preferred)
        Integer questionCount = null;
        if (!questions.isEmpty()) {
            questionCount = com.intellbank.util.QuestionGrouper.group(questions).size();
            if (subject == null) subject = deriveSubjectFromQuestions(questions);   // legacy rows
        }
        return new PastYearPaperResponse(
                paper.getPypId(), paper.getTitle(), paper.getUploadDate(), paper.getStatus(),
                supabaseStorageService.getPublicUrl(paper.getStorageUrl()),
                null, null, subject, questionCount);
    }

    private String deriveSubjectFromQuestions(List<Question> questions) {
        for (Question q : questions) {
            List<QuestionTopic> qts = questionTopicRepository.findByQuestionQuestionId(q.getQuestionId());
            if (!qts.isEmpty()) return qts.get(0).getTopic().getSubject().getName();
        }
        return null;
    }

    /** The paper's effective subject (stored, falling back to derived) for gating. */
    private String paperSubject(PastYearPaper paper) {
        if (paper.getSubject() != null) return paper.getSubject();
        return deriveSubjectFromQuestions(questionRepository.findByPastYearPaperPypId(paper.getPypId()));
    }

    @Transactional
    public PastYearPaperResponse uploadPaper(String title, MultipartFile file, String subject,
            String email, String role) {
        if (file == null || file.isEmpty()) {
            throw new AppException("A PDF file is required", HttpStatus.BAD_REQUEST);
        }
        if (title == null || title.isBlank()) {
            throw new AppException("Title is required", HttpStatus.BAD_REQUEST);
        }
        if (subject == null || subject.isBlank()) {
            throw new AppException("Subject is required", HttpStatus.BAD_REQUEST);
        }
        // Educator may only upload papers in a subject they're assigned to (admin bypasses).
        specializationService.assertCanHandleSubjectName(email, role, subject.trim());

        String storagePath = supabaseStorageService.uploadPdf(file);

        PastYearPaper paper = PastYearPaper.builder()
                .title(title.trim())
                .subject(subject.trim())
                .storageUrl(storagePath)
                .status("UPLOADED")
                .build();

        PastYearPaper saved = pastYearPaperRepository.save(paper);
        log.info("Uploaded past year paper '{}' ({}) -> {}", title, saved.getPypId(), storagePath);
        return toResponse(saved);
    }

    @Transactional
    public PastYearPaperResponse triggerProcessing(UUID pypId, String email, String role) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        specializationService.assertCanHandleSubjectName(email, role, paperSubject(paper));

        // The AI service now queues the job and returns immediately (see
        // job_queue_service.py) — this no longer blocks for the whole OCR
        // pipeline. The real terminal status (PROCESSED/FAILED) lands later
        // via the AI service's own direct write to past_year_papers.status;
        // callers should poll getProgress(pypId) for live updates.
        try {
            Map<String, Object> result = aiClientService.processPastYearPaper(pypId);
            String status = String.valueOf(result.getOrDefault("status", "FAILED"));
            paper.setStatus(status);
            log.info("Queued past year paper {} for processing -> status={}", pypId, status);
            return toResponse(pastYearPaperRepository.save(paper), result);
        } catch (Exception e) {
            log.error("Failed to queue processing for past year paper {}: {}", pypId, e.getMessage());
            paper.setStatus("FAILED");
            PastYearPaper saved = pastYearPaperRepository.save(paper);
            return toResponse(saved, Map.of("error", e.getMessage() != null ? e.getMessage() : "Unknown error"));
        }
    }

    public Map<String, Object> getProgress(UUID pypId, String email, String role) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        specializationService.assertCanHandleSubjectName(email, role, paperSubject(paper));
        return aiClientService.getProcessingProgress(pypId);
    }

    /**
     * Generate (or regenerate) a solution for a single question.
     * Replaces any existing solution so the educator gets a fresh attempt.
     */
    @Transactional
    public Map<String, Object> generateSingleSolution(UUID questionId, String email, String role) {
        Question question = questionRepository.findById(questionId)
                .orElseThrow(() -> new AppException("Question not found", HttpStatus.NOT_FOUND));

        List<QuestionTopic> topics = questionTopicRepository.findByQuestionQuestionId(questionId);
        String subject = topics.isEmpty() ? "General" : topics.get(0).getTopic().getSubject().getName();
        String topic   = topics.isEmpty() ? "General" : topics.get(0).getTopic().getName();
        specializationService.assertCanHandleSubjectName(email, role, subject);
        String text    = question.getContent() != null
                ? question.getContent().replaceAll("(?i)^\\[QPART:[^\\]]+\\]\\n?", "").strip()
                : "";

        if (text.isBlank()) {
            throw new AppException("Question has no content to generate a solution for", HttpStatus.BAD_REQUEST);
        }

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("question_id", questionId.toString());
        entry.put("text",    text);
        entry.put("subject", subject);
        entry.put("topic",   topic);
        entry.put("marks",   question.getMarks() != null ? question.getMarks() : 5);

        Map<String, Object> aiResult = aiClientService.generatePypSolutions(List.of(entry));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sols = (List<Map<String, Object>>) aiResult.getOrDefault("solutions", List.of());

        if (sols.isEmpty() || sols.get(0).get("error") != null) {
            String err = sols.isEmpty() ? "No response from AI" : (String) sols.get(0).get("error");
            throw new AppException("Solution generation failed: " + err, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        Map<String, Object> sol = sols.get(0);
        String explanation = sol.get("explanation") instanceof String s ? s : "";

        // Replace existing solution if one already exists
        Solution solution = solutionRepository.findByQuestionQuestionId(questionId)
                .orElse(Solution.builder().question(question).build());
        solution.setContent((String) sol.get("content"));
        solution.setExplanation(explanation);
        solution.setIsVerified(false);
        Solution saved = solutionRepository.save(solution);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("questionId",  saved.getQuestion().getQuestionId());
        result.put("content",     saved.getContent());
        result.put("explanation", saved.getExplanation());
        result.put("isVerified",  saved.getIsVerified());
        return result;
    }

    /**
     * Generate model solutions for all questions in a past-year paper via Gemini 2.0 Flash.
     * Questions that already have a solution are skipped. Results are saved to the
     * solutions table with is_verified=false, ready for educator review.
     */
    @Transactional
    public Map<String, Object> generateSolutions(UUID pypId, String email, String role) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        specializationService.assertCanHandleSubjectName(email, role, paperSubject(paper));

        if (!"PROCESSED".equals(paper.getStatus())) {
            throw new AppException("Paper must be PROCESSED before generating solutions", HttpStatus.BAD_REQUEST);
        }

        List<Question> questions = questionRepository.findByPastYearPaperPypId(pypId);
        if (questions.isEmpty()) {
            return Map.of("generated", 0, "failed", 0, "skipped", 0);
        }

        List<UUID> questionIds = questions.stream().map(Question::getQuestionId).collect(Collectors.toList());

        // Skip questions that already have a solution
        Set<UUID> alreadySolved = solutionRepository.findByQuestionQuestionIdIn(questionIds)
                .stream().map(s -> s.getQuestion().getQuestionId()).collect(Collectors.toSet());

        // Load topic/subject for each question (JOIN FETCH avoids N+1)
        List<QuestionTopic> allTopics = questionTopicRepository.findByQuestionIds(questionIds);
        Map<UUID, QuestionTopic> firstTopicMap = new LinkedHashMap<>();
        for (QuestionTopic qt : allTopics) {
            firstTopicMap.putIfAbsent(qt.getQuestion().getQuestionId(), qt);
        }

        // Build payload — strip [QPART:N:label] markers so the LLM sees clean question text
        List<Map<String, Object>> payload = new ArrayList<>();
        int skipped = 0;
        for (Question q : questions) {
            if (alreadySolved.contains(q.getQuestionId())) { skipped++; continue; }
            QuestionTopic qt = firstTopicMap.get(q.getQuestionId());
            String subject = qt != null ? qt.getTopic().getSubject().getName() : "General";
            String topic   = qt != null ? qt.getTopic().getName() : "General";
            String text    = q.getContent() != null
                    ? q.getContent().replaceAll("(?i)^\\[QPART:[^\\]]+\\]\\n?", "").strip()
                    : "";

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("question_id", q.getQuestionId().toString());
            entry.put("text",    text);
            entry.put("subject", subject);
            entry.put("topic",   topic);
            entry.put("marks",   q.getMarks() != null ? q.getMarks() : 5);
            payload.add(entry);
        }

        if (payload.isEmpty()) {
            return Map.of("generated", 0, "failed", 0, "skipped", skipped);
        }

        Map<String, Object> aiResult = aiClientService.generatePypSolutions(payload);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sols = (List<Map<String, Object>>) aiResult.getOrDefault("solutions", List.of());

        Map<UUID, Question> questionMap = questions.stream()
                .collect(Collectors.toMap(Question::getQuestionId, q -> q));

        int generated = 0, failed = 0;
        for (Map<String, Object> sol : sols) {
            if (sol.get("error") != null) { failed++; continue; }
            UUID qid = UUID.fromString((String) sol.get("question_id"));
            Question q = questionMap.get(qid);
            if (q == null) continue;
            String explanation = sol.get("explanation") instanceof String s ? s : "";
            solutionRepository.save(Solution.builder()
                    .question(q)
                    .content((String) sol.get("content"))
                    .explanation(explanation)
                    .isVerified(false)
                    .build());
            generated++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("generated", generated);
        result.put("failed",    failed);
        result.put("skipped",   skipped);
        return result;
    }

    /**
     * Return all generated solutions for every question in a past-year paper,
     * keyed by question_id. Used by the frontend to display solutions inline
     * on the PastYearPaperQuestionsPage.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<Map<String, Object>> getSolutions(UUID pypId, String email, String role) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        specializationService.assertCanHandleSubjectName(email, role, paperSubject(paper));
        List<Question> questions = questionRepository.findByPastYearPaperPypId(pypId);
        if (questions.isEmpty()) return List.of();

        List<UUID> questionIds = questions.stream().map(Question::getQuestionId).collect(Collectors.toList());
        return solutionRepository.findByQuestionQuestionIdIn(questionIds).stream()
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("questionId",  s.getQuestion().getQuestionId());
                    m.put("content",     s.getContent());
                    m.put("explanation", s.getExplanation());
                    m.put("isVerified",  s.getIsVerified());
                    return m;
                })
                .collect(Collectors.toList());
    }

    /**
     * Permanently deletes a past year paper: its extracted questions (and
     * everything hanging off them — solutions, solution history,
     * question_topics, document_questions), the original PDF in Storage,
     * and the past_year_papers row itself. Deletes child rows explicitly in
     * dependency order rather than relying on DB cascade — the live FK
     * constraints are NO ACTION, not CASCADE, despite what schema.sql
     * declares (same drift already handled on the AI-service side in
     * paper_processing_service.delete_existing_questions()).
     */
    @Transactional
    public void deletePaper(UUID pypId, String email, String role) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        specializationService.assertCanHandleSubjectName(email, role, paperSubject(paper));

        List<Question> questions = questionRepository.findByPastYearPaperPypId(pypId);
        List<UUID> questionIds = questions.stream().map(Question::getQuestionId).collect(Collectors.toList());

        if (!questionIds.isEmpty()) {
            List<UUID> solutionIds = solutionRepository.findByQuestionQuestionIdIn(questionIds).stream()
                    .map(Solution::getSolutionId)
                    .collect(Collectors.toList());
            if (!solutionIds.isEmpty()) {
                solutionHistoryRepository.deleteBySolutionSolutionIdIn(solutionIds);
            }
            solutionRepository.deleteByQuestionQuestionIdIn(questionIds);
            documentQuestionRepository.deleteByQuestionQuestionIdIn(questionIds);
            questionTopicRepository.deleteByQuestionQuestionIdIn(questionIds);
        }
        questionRepository.deleteByPastYearPaperPypId(pypId);

        supabaseStorageService.deletePdf(paper.getStorageUrl());

        pastYearPaperRepository.delete(paper);
        log.info("Deleted past year paper {} ('{}') — {} question(s) removed", pypId, paper.getTitle(), questionIds.size());
    }

    private PastYearPaperResponse toResponse(PastYearPaper paper) {
        return toResponse(paper, Map.of());
    }

    private PastYearPaperResponse toResponse(PastYearPaper paper, Map<String, Object> aiResult) {
        Integer questionsInserted = aiResult.get("questions_inserted") instanceof Number n ? n.intValue() : null;
        String error = aiResult.get("error") != null ? String.valueOf(aiResult.get("error")) : null;
        return new PastYearPaperResponse(
                paper.getPypId(),
                paper.getTitle(),
                paper.getUploadDate(),
                paper.getStatus(),
                supabaseStorageService.getPublicUrl(paper.getStorageUrl()),
                questionsInserted,
                error,
                null,
                null
        );
    }
}
