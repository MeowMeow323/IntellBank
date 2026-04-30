package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * SolutionHistory – audit trail.
 * A record is written here BEFORE any solution content or explanation is changed.
 */
@Entity
@Table(name = "solution_history")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SolutionHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "solution_history_id")
    private UUID solutionHistoryId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "solution_id", nullable = false)
    private Solution solution;

    @Column(name = "old_content", columnDefinition = "TEXT")
    private String oldContent;

    @Column(name = "old_explanation", columnDefinition = "TEXT")
    private String oldExplanation;

    @CreationTimestamp
    @Column(name = "changed_timestamp", updatable = false)
    private OffsetDateTime changedTimestamp;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "changed_by")
    private User changedBy;
}
