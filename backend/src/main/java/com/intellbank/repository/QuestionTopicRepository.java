package com.intellbank.repository;

import com.intellbank.entity.QuestionTopic;
import com.intellbank.entity.QuestionTopicId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface QuestionTopicRepository extends JpaRepository<QuestionTopic, QuestionTopicId> {

    @Query("SELECT qt FROM QuestionTopic qt " +
           "JOIN FETCH qt.topic t " +
           "JOIN FETCH t.subject " +
           "LEFT JOIN FETCH qt.difficulty " +
           "WHERE qt.question.questionId IN :questionIds")
    List<QuestionTopic> findByQuestionIds(@Param("questionIds") List<UUID> questionIds);

    void deleteByQuestionQuestionIdIn(List<UUID> questionIds);

    /** All topic links for a single question — used by the submission-grading flow
     *  to spread that question's awarded marks across its topics. */
    List<QuestionTopic> findByQuestionQuestionId(UUID questionId);
}
