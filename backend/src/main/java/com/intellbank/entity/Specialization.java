package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;

/** Specialization – Educator ↔ Subject many-to-many. */
@Entity
@Table(name = "specializations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Specialization {

    @EmbeddedId
    private SpecializationId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("subjectId")
    @JoinColumn(name = "subject_id")
    private Subject subject;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("educatorId")
    @JoinColumn(name = "educator_id")
    private Educator educator;
}
