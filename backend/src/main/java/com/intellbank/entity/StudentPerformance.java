package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * StudentPerformance – MasteryLevel is a label string.
 * Values: "Beginner" | "Intermediate" | "Advanced" | "Mastered"
 */
@Entity
@Table(name = "student_performance")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class StudentPerformance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "performance_id")
    private UUID performanceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    /**
     * Mastery label: "Beginner" | "Intermediate" | "Advanced" | "Mastered"
     */
    @Builder.Default
    @Column(name = "mastery_level", nullable = false, length = 50)
    private String masteryLevel = "Beginner";

    @UpdateTimestamp
    @Column(name = "last_calculated")
    private OffsetDateTime lastCalculated;
}
