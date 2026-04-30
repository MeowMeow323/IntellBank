package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Solution – verification is controlled ONLY via isVerified.
 * Do NOT add VerificationStatus to Question.
 */
@Entity
@Table(name = "solutions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Solution {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "solution_id")
    private UUID solutionId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(columnDefinition = "TEXT")
    private String explanation;

    @Builder.Default
    @Column(name = "is_verified")
    private Boolean isVerified = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verified_by")
    private User verifiedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;
}
