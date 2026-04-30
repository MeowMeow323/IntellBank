package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * ExamService – generates an AI exam by creating a Document (type="AI Generated Exam")
 * and linking questions via DocumentQuestion.
 *
 * NO GeneratedExam table is used.
 */
@SuppressWarnings("null")
@Slf4j
@Service
@RequiredArgsConstructor
public class ExamService {

    private final DocumentRepository documentRepository;
    private final DocumentQuestionRepository documentQuestionRepository;
    private final QuestionRepository questionRepository;
    private final ProjectRepository projectRepository;
    private final AiClientService aiClientService;

    /**
     * Generate an AI exam:
     * 1. Create a Document with type = "AI Generated Exam"
     * 2. Select existing questions from the bank OR call AI service
     * 3. Link them via DocumentQuestion
     */
    @Transactional
    public Map<String, Object> generate(UUID projectId, String title, String subject,
                                         String topic, String difficulty, int questionCount) {

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new AppException("Project not found", HttpStatus.NOT_FOUND));

        // 1 – Create the Document
        Document document = Document.builder()
                .project(project)
                .title(title != null ? title : subject + " – AI Exam")
                .type("AI Generated Exam")
                .totalScore(questionCount * 2) // default 2 marks per question; adjust as needed
                .build();
        document = documentRepository.save(document);

        // 2 – Try to pull questions from the question bank
        List<Question> selectedQuestions = new ArrayList<>();
        List<Question> allQuestions = questionRepository.findAll();

        // TODO: Implement proper question selection by topic/subject/difficulty
        //       For now, take a random sample from the bank
        Collections.shuffle(allQuestions);
        selectedQuestions = allQuestions.stream().limit(questionCount).toList();

        // 3 – If bank doesn't have enough, call AI service to generate the rest
        int needed = questionCount - selectedQuestions.size();
        if (needed > 0) {
            try {
                List<String> aiTexts = aiClientService.generateQuestions(subject, topic, difficulty, needed);
                for (String text : aiTexts) {
                    Question aiQ = Question.builder()
                            .content(text)
                            .marks(2)
                            .build();
                    selectedQuestions = new ArrayList<>(selectedQuestions);
                    selectedQuestions.add(questionRepository.save(aiQ));
                }
            } catch (Exception e) {
                log.warn("AI service unavailable, using bank only: {}", e.getMessage());
            }
        }

        // 4 – Link questions to the document via DocumentQuestion
        for (Question q : selectedQuestions) {
            DocumentQuestionId dqId = new DocumentQuestionId(q.getQuestionId(), document.getDocumentId());
            DocumentQuestion dq = DocumentQuestion.builder()
                    .id(dqId)
                    .document(document)
                    .question(q)
                    .build();
            documentQuestionRepository.save(dq);
        }

        // 5 – Build and return response
        List<Map<String, Object>> questionsData = selectedQuestions.stream().map(q -> Map.<String, Object>of(
                "questionId", q.getQuestionId(),
                "content", q.getContent(),
                "marks", q.getMarks()
        )).toList();

        return Map.of(
            "documentId", document.getDocumentId(),
            "title", document.getTitle(),
            "type", document.getType(),
            "totalScore", document.getTotalScore(),
            "questions", questionsData
        );
    }

    public Map<String, Object> getExam(UUID documentId) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));

        if (!"AI Generated Exam".equals(document.getType())) {
            throw new AppException("Document is not an AI Generated Exam", HttpStatus.BAD_REQUEST);
        }

        List<DocumentQuestion> dqs = documentQuestionRepository.findByDocumentDocumentId(documentId);
        List<Map<String, Object>> questionsData = dqs.stream().map(dq -> Map.<String, Object>of(
                "questionId", dq.getQuestion().getQuestionId(),
                "content", dq.getQuestion().getContent(),
                "marks", dq.getQuestion().getMarks()
        )).toList();

        return Map.of(
            "documentId", document.getDocumentId(),
            "title", document.getTitle(),
            "type", document.getType(),
            "totalScore", document.getTotalScore(),
            "questions", questionsData
        );
    }
}
