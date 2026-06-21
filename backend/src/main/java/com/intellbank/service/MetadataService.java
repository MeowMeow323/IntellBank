package com.intellbank.service;

import com.intellbank.entity.Subject;
import com.intellbank.entity.Topic;
import com.intellbank.exception.AppException;
import com.intellbank.repository.SubjectRepository;
import com.intellbank.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MetadataService {

    private final SubjectRepository subjectRepository;
    private final TopicRepository topicRepository;

    public Map<String, List<String>> getSubjectTopicsMap() {
        List<Subject> subjects = subjectRepository.findAll();
        List<Topic> topics = topicRepository.findAll();

        Map<String, List<String>> map = new HashMap<>();

        for (Subject subject : subjects) {
            List<String> subjectTopics = topics.stream()
                    .filter(t -> t.getSubject().getSubjectId().equals(subject.getSubjectId()))
                    .map(Topic::getName)
                    .collect(Collectors.toList());
            map.put(subject.getName(), subjectTopics);
        }

        return map;
    }

    public List<Subject> getAllSubjects() {
        return subjectRepository.findAll();
    }

    public List<Topic> getTopicsBySubject(UUID subjectId) {
        return topicRepository.findBySubjectSubjectId(subjectId);
    }

    /**
     * Case-insensitive find-or-create — without this, typing "Mathematics"
     * when "mathematics" already exists (or double-clicking Add) silently
     * creates a duplicate subject with its own empty topic list, which is
     * exactly what happened with an auto-detected "SOFTWARE MAINTENANCE"
     * header colliding with an existing "Software Maintenance".
     */
    public Subject createSubject(String name) {
        if (name == null || name.isBlank()) {
            throw new AppException("Subject name is required", HttpStatus.BAD_REQUEST);
        }
        String trimmed = name.trim();
        return subjectRepository.findByNameIgnoreCase(trimmed)
                .orElseGet(() -> subjectRepository.save(Subject.builder().name(trimmed).build()));
    }

    /** Case-insensitive find-or-create within the subject — same reasoning as createSubject above. */
    public Topic createTopic(UUID subjectId, String name) {
        if (name == null || name.isBlank()) {
            throw new AppException("Topic name is required", HttpStatus.BAD_REQUEST);
        }
        Subject subject = subjectRepository.findById(subjectId)
                .orElseThrow(() -> new AppException("Subject not found", HttpStatus.NOT_FOUND));
        String trimmed = name.trim();
        return topicRepository.findBySubjectSubjectIdAndNameIgnoreCase(subjectId, trimmed)
                .orElseGet(() -> topicRepository.save(Topic.builder().subject(subject).name(trimmed).build()));
    }

    public void deleteTopic(UUID topicId) {
        if (!topicRepository.existsById(topicId)) {
            throw new AppException("Topic not found", HttpStatus.NOT_FOUND);
        }
        topicRepository.deleteById(topicId);
    }
}
