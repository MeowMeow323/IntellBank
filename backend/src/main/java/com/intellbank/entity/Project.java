package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.fasterxml.jackson.annotation.JsonIgnore;

/** Project belongs to a Student (not directly to User). */
@Entity
@Table(name = "projects")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "project_id")
    private UUID projectId;

    // @JsonIgnore — the owning Student is a lazy Hibernate proxy. Once it's been
    // initialized (e.g. an ownership check walking student → user), Jackson would
    // try to serialize the proxy's internal "hibernateLazyInitializer" and throw,
    // turning PUT/GET responses into 500s. Consumers never read project.student,
    // and serializing it also leaked the owner's password hash, so drop it entirely.
    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @Column(name = "project_name", nullable = false, length = 255)
    private String projectName;

    @Builder.Default
    @JsonManagedReference
    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Document> documents = new ArrayList<>();
}
