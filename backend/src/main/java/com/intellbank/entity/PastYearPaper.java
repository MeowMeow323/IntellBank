package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * PastYearPapers – the raw uploaded academic source.
 * Questions are linked to this via pyp_id.
 */
@Entity
@Table(name = "past_year_papers")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PastYearPaper {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "pyp_id")
    private UUID pypId;

    @Column(nullable = false, length = 500)
    private String title;

    @CreationTimestamp
    @Column(name = "upload_date", updatable = false)
    private OffsetDateTime uploadDate;

    @Column(name = "storage_url")
    private String storageUrl;

    /**
     * Plain text status: UPLOADED | PROCESSING | PROCESSED | FAILED
     */
    @Builder.Default
    @Column(nullable = false, length = 100)
    private String status = "UPLOADED";
}
