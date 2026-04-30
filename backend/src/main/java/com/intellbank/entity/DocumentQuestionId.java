package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.util.UUID;

/** Composite PK for DocumentQuestion. */
@Embeddable
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
@EqualsAndHashCode
public class DocumentQuestionId implements Serializable {
    @Column(name = "question_id")
    private UUID questionId;
    @Column(name = "document_id")
    private UUID documentId;
}
