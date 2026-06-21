package com.intellbank.dto;

import java.util.List;
import java.util.UUID;

/**
 * Result of grading a student submission.
 * Returned to the Verification UI so the educator immediately sees the auto-computed
 * total and the per-topic breakdown that drove the student's weakness profile.
 */
public record GradeResult(
        UUID submissionId,
        int total,
        int maxTotal,
        String status,
        List<TopicScore> topics
) {
    /**
     * Per-topic score derived by spreading each question's awarded marks across its topics.
     * {@code mastery} follows the bands: <50 Beginner · 50–69 Intermediate · 70–89 Advanced · ≥90 Mastered.
     */
    public record TopicScore(
            UUID topicId,
            String topicName,
            int earned,
            int possible,
            int percentage,
            String mastery
    ) {}
}