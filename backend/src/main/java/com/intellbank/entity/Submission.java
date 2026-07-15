package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

/**
 * Submission – student submits an answered paper.
 * Only Documents with type = "AI Generated Exam" are accepted.
 */
@Entity
@Table(name = "submissions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Submission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "submission_id")
    private UUID submissionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private Document document;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "educator_id")
    private Educator educator;

    @Column
    private Integer marks;

    /**
     * Per-question educator feedback captured at grading, as a JSON array string:
     * [{"question":"Question 1","feedback":"…"}, …]. Shown to the student on their
     * reviewed paper. Nullable for ungraded/legacy submissions.
     */
    @Column(name = "question_feedback", columnDefinition = "TEXT")
    private String questionFeedback;

    /** PENDING | GRADED | RETURNED */
    @Builder.Default
    @Column(nullable = false, length = 100)
    private String status = "PENDING";
}
