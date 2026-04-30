package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

/**
 * ExtractedTextBlock – simple storage for raw OCR/extraction output from a PastYearPaper.
 * Workflows around this are not yet built.
 */
@Entity
@Table(name = "extracted_text_blocks")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ExtractedTextBlock {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "block_id")
    private UUID blockId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pyp_id")
    private PastYearPaper pastYearPaper;

    @Column(name = "raw_content", columnDefinition = "TEXT")
    private String rawContent;
}
