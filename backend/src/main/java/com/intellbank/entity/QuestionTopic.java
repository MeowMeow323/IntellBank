package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * QuestionTopic – maps a Question to a Topic with an optional Difficulty.
 * Composite PK: (question_id, topic_id).
 */
@Entity
@Table(name = "question_topics")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class QuestionTopic {

    @EmbeddedId
    private QuestionTopicId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("questionId")
    @JoinColumn(name = "question_id")
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("topicId")
    @JoinColumn(name = "topic_id")
    private Topic topic;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "difficulty_id")
    private Difficulty difficulty;
}
