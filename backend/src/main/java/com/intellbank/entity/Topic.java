package com.intellbank.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "topics")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Topic {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "topic_id")
    private UUID topicId;

    /**
     * @JsonIgnore — same fix as Question.pastYearPaper: subject_id is
     * NOT NULL here, so every topic has a populated lazy proxy, and without
     * this Jackson 500s trying to serialize it directly (no
     * jackson-datatype-hibernate module registered). This made
     * GET /api/metadata/topics 500 on every real row.
     */
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subject_id", nullable = false)
    private Subject subject;

    @Column(nullable = false, length = 255)
    private String name;
}
