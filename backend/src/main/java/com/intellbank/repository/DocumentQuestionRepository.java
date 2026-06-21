package com.intellbank.repository;

import com.intellbank.entity.DocumentQuestion;
import com.intellbank.entity.DocumentQuestionId;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface DocumentQuestionRepository extends JpaRepository<DocumentQuestion, DocumentQuestionId> {
    List<DocumentQuestion> findByDocumentDocumentId(UUID documentId);
    void deleteByDocumentDocumentId(UUID documentId);
    void deleteByQuestionQuestionIdIn(List<UUID> questionIds);
}
