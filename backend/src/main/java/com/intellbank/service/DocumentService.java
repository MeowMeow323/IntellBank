package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
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

    /**
     * Upload a raw document or past year paper.
     * TODO: Integrate Supabase Storage SDK to upload the actual file bytes.
     */
    @Transactional
    public Document upload(UUID projectId, String title, String type, MultipartFile file) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new AppException("Project not found", HttpStatus.NOT_FOUND));

        // TODO: Upload file bytes to Supabase Storage and replace this placeholder URL
        String storageUrl = "documents/" + projectId + "/" + (file != null ? file.getOriginalFilename() : "unknown");

        Document document = Document.builder()
                .project(project)
                .title(title)
                .type(type != null ? type : "Raw Document")
                .storageUrl(storageUrl)
                .build();
        return documentRepository.save(document);
    }

    @Transactional
    public void delete(UUID documentId) {
        documentRepository.delete(getById(documentId));
    }
}
