package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.util.UUID;

/** Composite PK for Specialization. */
@Embeddable
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
@EqualsAndHashCode
public class SpecializationId implements Serializable {
    @Column(name = "subject_id")
    private UUID subjectId;
    @Column(name = "educator_id")
    private UUID educatorId;
}
