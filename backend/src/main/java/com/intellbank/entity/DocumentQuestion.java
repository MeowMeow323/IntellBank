package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * DocumentQuestion – links Questions to a Document.
 * Used by both "AI Generated Exam" documents and "Past Year Paper" documents.
 */
@Entity
@Table(name = "document_questions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DocumentQuestion {

    @EmbeddedId
    private DocumentQuestionId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("questionId")
    @JoinColumn(name = "question_id")
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("documentId")
    @JoinColumn(name = "document_id")
    private Document document;
}
