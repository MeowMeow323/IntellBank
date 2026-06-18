package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import com.intellbank.util.QuestionHtmlFormatter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;
    private final PastYearPaperRepository pastYearPaperRepository;
    private final QuestionRepository questionRepository;
    private final DocumentQuestionRepository documentQuestionRepository;

    public List<Document> getByProject(UUID projectId) {
        return documentRepository.findByProjectProjectId(projectId);
    }

    public Document getById(UUID documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));
    }

    @Transactional
    public Document upload(UUID projectId, String title, String type, MultipartFile file) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new AppException("Project not found", HttpStatus.NOT_FOUND));

        // 1. EXTRACT THE ACTUAL TEXT CONTENT OUT OF THE MULTIPART FILE
        String documentTextContent = "";
        if (file != null && !file.isEmpty()) {
            try {
                // Reads the raw file bytes sent from your frontend editor text area
                documentTextContent = new String(file.getBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                System.err.println("Failed to read text payload bytes: " + e.getMessage());
            }
        }

        // Check if a document with this exact title already exists in this project
        List<Document> existingDocs = documentRepository.findByProjectProjectId(projectId);
        Optional<Document> existingDocumentOpt = existingDocs.stream()
                .filter(doc -> doc.getTitle() != null && doc.getTitle().equals(title))
                .findFirst();

        if (existingDocumentOpt.isPresent()) {
            Document existingDocument = existingDocumentOpt.get();
            existingDocument.setStorageUrl(documentTextContent); 
            if (type != null) {
                existingDocument.setType(type);
            }
            return documentRepository.save(existingDocument);
        } else {
            // 👉 CREATE new entity row
            Document document = Document.builder()
                    .project(project)
                    .title(title)
                    .type(type != null ? type : "Raw Document")
                    .storageUrl(documentTextContent) 
                    .build();
            return documentRepository.save(document);
        }
    }

    /**
     * Opens a past year paper as a practisable Document.
     * Creates Document + DocumentQuestion rows linking all OCR-extracted questions.
     */
    @Transactional
    public Document openPastYearPaper(UUID pypId, UUID projectId) {
        PastYearPaper pyp = pastYearPaperRepository.findById(pypId)
                .orElseThrow(() -> new AppException("Past year paper not found", HttpStatus.NOT_FOUND));
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new AppException("Project not found", HttpStatus.NOT_FOUND));

        // Reuse existing document if already opened for this project
        List<Document> existing = documentRepository.findByProjectProjectId(projectId);
        Optional<Document> reuse = existing.stream()
                .filter(d -> "Past Year Paper".equals(d.getType()) && pyp.getTitle().equals(d.getTitle()))
                .findFirst();
        if (reuse.isPresent()) return reuse.get();

        List<Question> questions = questionRepository.findByPastYearPaperPypId(pypId);

        // PAGE_BREAK_MARKER matches WorkspaceContent.jsx constant so each question lands on its own page
        final String PAGE_BREAK = "<!--PAGE-->";

        StringBuilder html = new StringBuilder();

        if (questions.isEmpty()) {
            html.append("<h1 style=\"text-align:center; font-family: serif; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;\">")
                .append(pyp.getTitle()).append("</h1>");
            html.append("<p style=\"color:#94a3b8; font-style:italic; margin-top:2rem;\">")
                .append("No questions extracted for this paper yet. Run the OCR pipeline to populate questions.")
                .append("</p>");
        } else {
            // Page 1: cover / header
            html.append("<h1 style=\"text-align:center; font-family: serif; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;\">")
                .append(pyp.getTitle()).append("</h1>");
            html.append("<h3 style=\"text-align:center; font-weight: normal; margin: 0 0 2rem 0; font-size: 1.1rem;\">")
                .append("Total Marks: ").append(questions.size() * 25).append(" Marks")
                .append("</h3>");
            html.append("<p style=\"color:#64748b; font-size:0.9rem; margin-top:1rem;\">")
                .append("Answer ALL questions. Each question carries 25 marks.")
                .append("</p>");

            // One question per page
            for (int i = 0; i < questions.size(); i++) {
                Question q = questions.get(i);
                html.append(PAGE_BREAK);
                html.append("<h2 style=\"font-size: 1.25rem; font-weight: bold; margin-bottom: 1.5rem;\">")
                    .append("Question ").append(i + 1).append(" &nbsp;&nbsp; [25 Marks]")
                    .append("</h2>");
                html.append(QuestionHtmlFormatter.format(q.getContent()));
                html.append("<p style=\"margin-top: 3rem; color: #94a3b8; font-size: 0.85rem; font-style: italic;\">")
                    .append("— End of Question ").append(i + 1).append(" —")
                    .append("</p>");
            }
        }

        Document doc = documentRepository.save(Document.builder()
                .project(project)
                .title(pyp.getTitle())
                .type("Past Year Paper")
                .storageUrl(html.toString())
                .build());

        for (Question q : questions) {
            documentQuestionRepository.save(DocumentQuestion.builder()
                    .id(new DocumentQuestionId(q.getQuestionId(), doc.getDocumentId()))
                    .question(q)
                    .document(doc)
                    .build());
        }

        log.info("Opened PYP '{}' as document {} with {} questions", pyp.getTitle(), doc.getDocumentId(), questions.size());
        return doc;
    }

    /**
     * Saves AI-generated questions to the questions table and links them to a document.
     */
    @Transactional
    public void saveAiGeneratedQuestions(UUID documentId, List<Map<String, Object>> questionData) {
        Document doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));

        for (Map<String, Object> qMap : questionData) {
            String text  = (String) qMap.getOrDefault("text", "");
            int marks    = qMap.get("marks") instanceof Number ? ((Number) qMap.get("marks")).intValue() : 25;
            if (text.isBlank()) continue;

            Question q = questionRepository.save(Question.builder()
                    .content(text)
                    .marks(marks)
                    .build());

            documentQuestionRepository.save(DocumentQuestion.builder()
                    .id(new DocumentQuestionId(q.getQuestionId(), doc.getDocumentId()))
                    .question(q)
                    .document(doc)
                    .build());
        }
        log.info("Saved {} AI-generated questions for document {}", questionData.size(), documentId);
    }

    @Transactional
    public void delete(UUID documentId, String email) {
        log.info("Deleting document {} for user {}", documentId, email);
        documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));
        documentQuestionRepository.deleteByDocumentDocumentId(documentId);
        documentRepository.deleteById(documentId);
        log.info("Document deleted: {}", documentId);
    }
}