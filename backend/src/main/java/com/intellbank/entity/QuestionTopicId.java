package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.util.UUID;

/**
 * Composite primary key for QuestionTopic.
 */
@Embeddable
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
@EqualsAndHashCode
public class QuestionTopicId implements Serializable {
    @Column(name = "question_id")
    private UUID questionId;
    @Column(name = "topic_id")
    private UUID topicId;
}
