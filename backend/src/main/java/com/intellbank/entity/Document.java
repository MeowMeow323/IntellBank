package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import com.fasterxml.jackson.annotation.JsonBackReference;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Document – represents uploaded or AI-generated content.
 *
 * Type values (plain text):
 *   "AI Generated Exam"  – created by exam simulator
 *   "Past Year Paper"    – sourced from PastYearPapers
 *   "Raw Document"       – generic upload
 *
 * Only Documents with type = "AI Generated Exam" can be submitted.
 */
@Entity
@Table(name = "documents")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "document_id")
    private UUID documentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    @JsonBackReference
    private Project project;

    @Column(length = 500)
    private String title;

    /**
     * Plain text type:
     *   "AI Generated Exam" | "Past Year Paper" | "Raw Document"
     */
    @Builder.Default
    @Column(nullable = false, length = 100)
    private String type = "Raw Document";

    @Builder.Default
    @Column(name = "total_score")
    private Integer totalScore = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @Column(name = "storage_url", columnDefinition = "TEXT")
    private String storageUrl;
}
