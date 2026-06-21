package com.intellbank.dto;

import java.util.List;
import java.util.UUID;

/**
 * API-facing shape for Question — flattens the question_topics join
 * (topic/subject/difficulty) instead of returning raw lazy entities, and
 * surfaces which past year paper it came from for traceability.
 */
public record QuestionResponse(
        UUID questionId,
        String content,
        Integer marks,
        UUID pypId,
        String pypTitle,
        List<TopicTag> topics
) {
    public record TopicTag(String subject, String topic, String difficulty) {}
}
