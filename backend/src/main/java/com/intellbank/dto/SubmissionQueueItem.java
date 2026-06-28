package com.intellbank.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row in the educator's submission queue (the redesigned Verification list).
 * Enriched beyond the raw Submission so the list can search/filter/sort without
 * extra round-trips: student name, derived subject, and a submitted-date proxy.
 *
 * <p>Note: the {@code submissions} table has no timestamp column, so
 * {@code submittedAt} is the answered document's creation time — a faithful proxy
 * for when the paper was produced/submitted.
 */
public record SubmissionQueueItem(
        UUID submissionId,
        String status,
        Integer marks,
        UUID documentId,
        String title,
        String type,
        String studentName,
        String subject,
        OffsetDateTime submittedAt
) {}
