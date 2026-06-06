package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentService {

    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;

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

    @Transactional
    public void delete(UUID documentId, String email) {
        log.info("Deleting document with ID: {} for user: {}", documentId, email);
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));
        if (!document.getProject().getStudent().getUser().getEmail().equals(email)) {
            throw new AppException("Unauthorized to delete this document", HttpStatus.FORBIDDEN);
        }
        documentRepository.delete(document);
        log.info("Document deleted: {}", documentId);
    }
}