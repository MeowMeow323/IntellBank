package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * SubmissionService – only allows submission for Documents with type = "AI Generated Exam".
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final DocumentRepository documentRepository;

    @Transactional
    public Submission submit(UUID documentId) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));

        if (!"AI Generated Exam".equals(document.getType())) {
            throw new AppException(
                "Only 'AI Generated Exam' documents can be submitted. " +
                "This document type is: " + document.getType(),
                HttpStatus.BAD_REQUEST
            );
        }

        Submission submission = Submission.builder()
                .document(document)
                .build();
        return submissionRepository.save(submission);
    }

    public List<Submission> getByDocument(UUID documentId) {
        return submissionRepository.findByDocumentDocumentId(documentId);
    }

    public Submission getById(UUID submissionId) {
        return submissionRepository.findById(submissionId)
                .orElseThrow(() -> new AppException("Submission not found", HttpStatus.NOT_FOUND));
    }
}
