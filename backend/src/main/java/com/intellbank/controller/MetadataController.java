package com.intellbank.controller;

import com.intellbank.entity.Subject;
import com.intellbank.entity.Topic;
import com.intellbank.entity.User;
import com.intellbank.service.MetadataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/metadata")
@RequiredArgsConstructor
public class MetadataController {

    private final MetadataService metadataService;

    private static String emailOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getEmail();
    }

    private static String roleOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getRole();
    }

    @GetMapping("/subject-topics")
    public ResponseEntity<Map<String, List<String>>> getSubjectTopics() {
        return ResponseEntity.ok(metadataService.getSubjectTopicsMap());
    }

    @GetMapping("/subjects")
    public ResponseEntity<List<Subject>> getSubjects(Authentication auth) {
        return ResponseEntity.ok(metadataService.getAllSubjects(emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/subjects")
    public ResponseEntity<Subject> createSubject(@RequestBody Map<String, String> body, Authentication auth) {
        return ResponseEntity.ok(metadataService.createSubject(body.get("name"), roleOf(auth)));
    }

    @GetMapping("/topics")
    public ResponseEntity<List<Topic>> getTopics(@RequestParam UUID subjectId, Authentication auth) {
        return ResponseEntity.ok(metadataService.getTopicsBySubject(subjectId, emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/topics")
    public ResponseEntity<Topic> createTopic(@RequestBody Map<String, String> body, Authentication auth) {
        UUID subjectId = UUID.fromString(body.get("subjectId"));
        return ResponseEntity.ok(metadataService.createTopic(subjectId, body.get("name"), emailOf(auth), roleOf(auth)));
    }

    @DeleteMapping("/topics/{topicId}")
    public ResponseEntity<Void> deleteTopic(@PathVariable UUID topicId, Authentication auth) {
        metadataService.deleteTopic(topicId, emailOf(auth), roleOf(auth));
        return ResponseEntity.noContent().build();
    }
}
