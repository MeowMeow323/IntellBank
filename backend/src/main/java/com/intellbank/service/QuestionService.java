package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class QuestionService {

    private final QuestionRepository questionRepository;
    private final PastYearPaperRepository pypRepository;
    private final DocumentQuestionRepository documentQuestionRepository;

    public List<Question> getAll() {
        return questionRepository.findAll();
    }

    public Question getById(UUID questionId) {
        return questionRepository.findById(questionId)
                .orElseThrow(() -> new AppException("Question not found", HttpStatus.NOT_FOUND));
    }

    public List<Question> getByPyp(UUID pypId) {
        return questionRepository.findByPastYearPaperPypId(pypId);
    }

    public List<Question> getByDocument(UUID documentId) {
        return documentQuestionRepository.findByDocumentDocumentId(documentId)
                .stream().map(DocumentQuestion::getQuestion).toList();
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
