package com.intellbank.service;

import com.intellbank.dto.QuestionResponse;
import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class QuestionService {

    private final QuestionRepository questionRepository;
    private final PastYearPaperRepository pypRepository;
    private final DocumentQuestionRepository documentQuestionRepository;
    private final QuestionTopicRepository questionTopicRepository;

    public List<QuestionResponse> getAll() {
        return toResponses(questionRepository.findAll());
    }

    public Question getById(UUID questionId) {
        return questionRepository.findById(questionId)
                .orElseThrow(() -> new AppException("Question not found", HttpStatus.NOT_FOUND));
    }

    public List<QuestionResponse> getByPyp(UUID pypId) {
        return toResponses(questionRepository.findByPastYearPaperPypId(pypId));
    }

    public List<Question> getByDocument(UUID documentId) {
        return documentQuestionRepository.findByDocumentDocumentId(documentId)
                .stream().map(DocumentQuestion::getQuestion).toList();
    }

    /**
     * Flattens each Question's question_topics join rows (topic/subject/
     * difficulty) and which past year paper it came from into a single DTO —
     * one batch query for all topics instead of N+1 per question.
     */
    private List<QuestionResponse> toResponses(List<Question> questions) {
        if (questions.isEmpty()) {
            return List.of();
        }

        List<UUID> questionIds = questions.stream().map(Question::getQuestionId).toList();
        Map<UUID, List<QuestionResponse.TopicTag>> topicsByQuestion = questionTopicRepository
                .findByQuestionIds(questionIds).stream()
                .collect(Collectors.groupingBy(
                        qt -> qt.getQuestion().getQuestionId(),
                        Collectors.mapping(qt -> new QuestionResponse.TopicTag(
                                qt.getTopic().getSubject().getName(),
                                qt.getTopic().getName(),
                                qt.getDifficulty() != null ? qt.getDifficulty().getName() : null
                        ), Collectors.toList())
                ));

        return questions.stream().map(q -> new QuestionResponse(
                q.getQuestionId(),
                q.getContent(),
                q.getMarks(),
                q.getPastYearPaper() != null ? q.getPastYearPaper().getPypId() : null,
                q.getPastYearPaper() != null ? q.getPastYearPaper().getTitle() : null,
                topicsByQuestion.getOrDefault(q.getQuestionId(), List.of())
        )).toList();
    }

    @Transactional
    public Question create(String content, Integer marks, UUID pypId) {
        PastYearPaper pyp = null;
        if (pypId != null) {
            pyp = pypRepository.findById(pypId)
                    .orElseThrow(() -> new AppException("PastYearPaper not found", HttpStatus.NOT_FOUND));
        }

        Question question = Question.builder()
                .content(content)
                .marks(marks != null ? marks : 1)
                .pastYearPaper(pyp)
                .build();
        return questionRepository.save(question);
    }

    @Transactional
    public Question update(UUID questionId, String content, Integer marks) {
        Question question = getById(questionId);
        if (content != null) question.setContent(content);
        if (marks != null) question.setMarks(marks);
        return questionRepository.save(question);
    }

    @Transactional
    public void delete(UUID questionId) {
        questionRepository.delete(getById(questionId));
    }
}
