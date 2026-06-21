package com.intellbank.dto;

import java.util.UUID;

/**
 * A student's mastery of one topic, for the Predictive Analytics heatmap and weakness list.
 * Mastery is stored as a label (ERD-strict); {@code score} is a representative percentage
 * derived from that label purely for heatmap colouring / sorting.
 */
public record TopicMastery(
        UUID topicId,
        String topicName,
        String subjectName,
        String masteryLevel,
        int score
) {}