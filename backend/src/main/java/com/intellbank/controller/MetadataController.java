package com.intellbank.controller;

import com.intellbank.entity.Subject;
import com.intellbank.entity.Topic;
import com.intellbank.service.MetadataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/metadata")
@RequiredArgsConstructor
public class MetadataController {

    private final MetadataService metadataService;

    @GetMapping("/subject-topics")
    public ResponseEntity<Map<String, List<String>>> getSubjectTopics() {
        return ResponseEntity.ok(metadataService.getSubjectTopicsMap());
    }

    @GetMapping("/subjects")
    public ResponseEntity<List<Subject>> getSubjects() {
        return ResponseEntity.ok(metadataService.getAllSubjects());
    }

    @PostMapping("/subjects")
    public ResponseEntity<Subject> createSubject(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(metadataService.createSubject(body.get("name")));
    }

    @GetMapping("/topics")
    public ResponseEntity<List<Topic>> getTopics(@RequestParam UUID subjectId) {
        return ResponseEntity.ok(metadataService.getTopicsBySubject(subjectId));
    }

    @PostMapping("/topics")
    public ResponseEntity<Topic> createTopic(@RequestBody Map<String, String> body) {
        UUID subjectId = UUID.fromString(body.get("subjectId"));
        return ResponseEntity.ok(metadataService.createTopic(subjectId, body.get("name")));
    }

    @DeleteMapping("/topics/{topicId}")
    public ResponseEntity<Void> deleteTopic(@PathVariable UUID topicId) {
        metadataService.deleteTopic(topicId);
        return ResponseEntity.noContent().build();
    }
}
