package com.intellbank.dto;

import java.util.List;
import java.util.UUID;

/**
 * Topics × Students mastery matrix for the educator Class Analysis heat map.
 * Each row is a topic; each cell is a student's score on that topic (null when that
 * student hasn't been assessed on it).
 */
public record ClassMatrix(
        String subject,
        List<Col> students,   // columns
        List<Row> rows        // one per topic
) {
    /** A student column header. */
    public record Col(UUID id, String name) {}

    /** One topic row with a cell per student (aligned to {@code students} order). */
    public record Row(UUID topicId, String topicName, List<Cell> cells) {}

    /** A single matrix cell. {@code score}/{@code band} are null when there's no data. */
    public record Cell(UUID studentId, Integer score, String band, String comment) {}
}
