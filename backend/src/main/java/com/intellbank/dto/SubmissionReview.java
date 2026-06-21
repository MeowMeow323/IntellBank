package com.intellbank.dto;

import java.util.List;
import java.util.UUID;

/**
 * Everything the educator (grading) or the student ("view reviewed answers") needs for one submission:
 * the answered document content plus each question with its marks and topics.
 */
public record SubmissionReview(
        UUID submissionId,
        UUID documentId,
        String documentTitle,
        String documentContent,
        String studentName,
        String status,
        Integer marks,
        List<QuestionView> questions
) {
    /** A single question in the submitted paper, with its max marks and topic tags. */
    public record QuestionView(
            UUID questionId,
            String content,
            int marks,
            List<String> topics
    ) {}
}