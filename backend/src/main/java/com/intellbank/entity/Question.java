package com.intellbank.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

/**
 * Question – no VerificationStatus, no SourceType.
 * Linked to PastYearPapers via pypId (nullable for manually created questions).
 */
@Entity
@Table(name = "questions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "question_id")
    private UUID questionId;

    /**
     * @JsonIgnore — without it, Jackson tries to serialize this lazy Hibernate
     * proxy directly (no jackson-datatype-hibernate module is registered),
     * which 500s as soon as a Question actually has a non-null pastYearPaper.
     * That never happened before this OCR pipeline existed (every Question
     * had pyp_id = NULL), which is why this was latent until now.
     */
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pyp_id")
    private PastYearPaper pastYearPaper;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Builder.Default
    @Column
    private Integer marks = 1;
}
