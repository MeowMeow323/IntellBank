package com.intellbank.repository;

import com.intellbank.entity.Document;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<Document, UUID> {
    List<Document> findByProjectProjectId(UUID projectId);
    List<Document> findByType(String type);
}
