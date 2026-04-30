package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

/** Project belongs to a Student (not directly to User). */
@Entity
@Table(name = "projects")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "project_id")
    private UUID projectId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @Column(name = "project_name", nullable = false, length = 255)
    private String projectName;
}
