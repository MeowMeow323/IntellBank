package com.intellbank.repository;

import com.intellbank.entity.Submission;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SubmissionRepository extends JpaRepository<Submission, UUID> {
    List<Submission> findByDocumentDocumentId(UUID documentId);
}
