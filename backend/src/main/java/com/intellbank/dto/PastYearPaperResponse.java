package com.intellbank.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * API-facing shape for PastYearPaper — adds a directly viewable fileUrl
 * (computed from the stored relative path) on top of the raw entity fields.
 * questionsInserted/error are only populated by triggerProcessing() (passed
 * straight through from the AI service's response) so the frontend can show
 * the real failure reason instead of a generic message.
 */
public record PastYearPaperResponse(
        UUID pypId,
        String title,
        OffsetDateTime uploadDate,
        String status,
        String fileUrl,
        Integer questionsInserted,
        String error,
        String subject,        // derived from the paper's questions' topics (null until processed)
        Integer questionCount  // number of FULL questions after grouping fragments (e.g. 4)
) {}
