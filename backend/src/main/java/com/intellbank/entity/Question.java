package com.intellbank.entity;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pyp_id")
    private PastYearPaper pastYearPaper;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Builder.Default
    @Column
    private Integer marks = 1;
}
