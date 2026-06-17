package com.intellbank.service;

import com.intellbank.entity.Subject;
import com.intellbank.entity.Topic;
import com.intellbank.repository.SubjectRepository;
import com.intellbank.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
}
