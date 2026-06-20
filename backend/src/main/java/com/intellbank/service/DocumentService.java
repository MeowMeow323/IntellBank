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

        List<Question> questions = questionRepository.findByPastYearPaperPypId(pypId);

        // Always rebuild HTML so formatting changes in QuestionHtmlFormatter take effect immediately.
        final String PAGE_BREAK = "<!--PAGE-->";
        StringBuilder html = new StringBuilder();

        if (questions.isEmpty()) {
            html.append("<div style=\"text-align:center;\">")
                .append("<h1 style=\"font-family:Georgia,serif;\">").append(pyp.getTitle()).append("</h1>")
                .append("</div>")
                .append("<p style=\"color:#94a3b8;font-style:italic;margin-top:2rem;\">No questions extracted for this paper yet.</p>");
        } else {
            // ── Extract scenario from Q1 content (stored as [SCENARIO]...[/SCENARIO]) ────
            String scenarioHtml = "";
            String q1Raw = questions.get(0).getContent();
            if (q1Raw != null && q1Raw.contains("[SCENARIO]")) {
                int sStart = q1Raw.indexOf("[SCENARIO]") + 10;
                int sEnd   = q1Raw.indexOf("[/SCENARIO]");
                if (sEnd > sStart) {
                    String scenarioText = q1Raw.substring(sStart, sEnd).trim();
                    scenarioHtml =
                        "<div style=\"margin-top:1.5rem;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:1rem 1.25rem;\">"
                      + "<p style=\"font-weight:700;margin:0 0 0.6rem;font-size:0.95rem;\">Context / Scenario</p>"
                      + "<p style=\"margin:0;line-height:1.75;\">"
                      + scenarioText.replace("\n\n", "</p><p style=\"margin:0.5rem 0 0 0;line-height:1.75;\">")
                                   .replace("\n", " ")
                      + "</p></div>";
                }
            }

            // ── Cover page: title + instructions + scenario ───────────────────────────────
            html.append("<div style=\"text-align:center;padding-bottom:1rem;\">")
                .append("<h1 style=\"font-family:Georgia,serif;font-size:1.4rem;font-weight:bold;margin-bottom:0.25rem;\">")
                .append(pyp.getTitle()).append("</h1>")
                .append("<hr style=\"border:none;border-top:2px solid #334155;width:60%;margin:0.75rem auto;\">")
                .append("<p style=\"margin:0.5rem 0;\"><strong>Total Marks: ").append(questions.size() * 25)
                .append(" &nbsp;|&nbsp; Answer ALL ").append(questions.size()).append(" questions (25 marks each)</strong></p>")
                .append("</div>")
                .append(scenarioHtml);

            // ── Questions — one per page ─────────────────────────────────────────────────
            for (int i = 0; i < questions.size(); i++) {
                Question q = questions.get(i);
                html.append(PAGE_BREAK);

                html.append("<h2 style=\"font-size:1.2rem;font-weight:bold;border-bottom:2px solid #334155;padding-bottom:0.4rem;margin-bottom:1.25rem;\">")
                    .append("Question ").append(i + 1).append(" &nbsp; [25 Marks]</h2>");

                String content = q.getContent();

                // Strip [SCENARIO] from Q1 — it's now on the cover page
                if (content != null && content.contains("[SCENARIO]")) {
                    int endIdx = content.indexOf("[/SCENARIO]");
                    if (endIdx >= 0) content = content.substring(endIdx + 11).trim();
                }

                html.append(QuestionHtmlFormatter.format(content));

                html.append("<div style=\"margin-top:2rem;border-top:1px solid #cbd5e1;padding-top:0.6rem;\">")
                    .append("<p style=\"text-align:right;font-weight:600;font-size:0.9rem;margin:0;\">[Total: 25 marks]</p>")
                    .append("</div>");
                html.append("<p style=\"margin-top:1rem;color:#94a3b8;font-style:italic;font-size:0.85rem;\">")
                    .append("&mdash; End of Question ").append(i + 1).append(" &mdash;</p>");
            }
        }

        String freshHtml = html.toString();

        // Reuse existing document row but always refresh its content
        List<Document> existing = documentRepository.findByProjectProjectId(projectId);
        Optional<Document> reuse = existing.stream()
                .filter(d -> "Past Year Paper".equals(d.getType()) && pyp.getTitle().equals(d.getTitle()))
                .findFirst();

        if (reuse.isPresent()) {
            Document doc = reuse.get();
            doc.setStorageUrl(freshHtml);
            log.info("Refreshed PYP '{}' document {} with {} questions", pyp.getTitle(), doc.getDocumentId(), questions.size());
            return documentRepository.save(doc);
        }

        Document doc = documentRepository.save(Document.builder()
                .project(project)
                .title(pyp.getTitle())
                .type("Past Year Paper")
                .storageUrl(freshHtml)
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