package com.intellbank.service;

import com.intellbank.dto.PastYearPaperResponse;
import com.intellbank.entity.PastYearPaper;
import com.intellbank.entity.Question;
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

import java.util.List;
import java.util.Map;
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

    public List<PastYearPaperResponse> getAll() {
        return pastYearPaperRepository.findAll().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public PastYearPaperResponse uploadPaper(String title, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException("A PDF file is required", HttpStatus.BAD_REQUEST);
        }
        if (title == null || title.isBlank()) {
            throw new AppException("Title is required", HttpStatus.BAD_REQUEST);
        }

        String storagePath = supabaseStorageService.uploadPdf(file);

        PastYearPaper paper = PastYearPaper.builder()
                .title(title.trim())
                .storageUrl(storagePath)
                .status("UPLOADED")
                .build();

        PastYearPaper saved = pastYearPaperRepository.save(paper);
        log.info("Uploaded past year paper '{}' ({}) -> {}", title, saved.getPypId(), storagePath);
        return toResponse(saved);
    }

    @Transactional
    public PastYearPaperResponse triggerProcessing(UUID pypId) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));

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

    public Map<String, Object> getProgress(UUID pypId) {
        return aiClientService.getProcessingProgress(pypId);
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
    public void deletePaper(UUID pypId) {
        PastYearPaper paper = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));

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
                error
        );
    }
}
