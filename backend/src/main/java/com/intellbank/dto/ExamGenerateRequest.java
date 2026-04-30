package com.intellbank.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Request DTO for exam generation.
 * generationMode is a plain String: "FROM_BANK" | "FROM_AI" | "MIXED"
 * (ExamGenerationType enum has been removed from the ERD-aligned project)
 */
@Data
public class ExamGenerateRequest {

    @NotBlank(message = "Project ID is required")
    private String projectId;

    private String title;

    @NotBlank(message = "Subject is required")
    private String subject;

    private String topic;

    private String difficulty = "Medium";

    @Min(1)
    private Integer questionCount = 5;

    /**
     * "FROM_BANK" – use existing question bank
     * "FROM_AI"   – call AI service to generate
     * "MIXED"     – mix bank + AI (default)
     */
    private String generationMode = "MIXED";
}
