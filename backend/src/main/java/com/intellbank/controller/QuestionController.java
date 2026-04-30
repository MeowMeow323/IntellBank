package com.intellbank.controller;

import com.intellbank.entity.Question;
import com.intellbank.service.QuestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/questions")
@RequiredArgsConstructor
public class QuestionController {

    private final QuestionService questionService;

    @GetMapping
    public ResponseEntity<List<Question>> getAll() {
        return ResponseEntity.ok(questionService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Question> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(questionService.getById(id));
    }

    @GetMapping("/by-pyp/{pypId}")
    public ResponseEntity<List<Question>> getByPyp(@PathVariable UUID pypId) {
        return ResponseEntity.ok(questionService.getByPyp(pypId));
    }

    @GetMapping("/by-document/{documentId}")
    public ResponseEntity<List<Question>> getByDocument(@PathVariable UUID documentId) {
        return ResponseEntity.ok(questionService.getByDocument(documentId));
    }

    @PostMapping
    public ResponseEntity<Question> create(@RequestBody Map<String, Object> body) {
        String content = (String) body.get("content");
        Integer marks  = (Integer) body.get("marks");
        UUID pypId     = body.containsKey("pypId") ? UUID.fromString((String) body.get("pypId")) : null;
        return ResponseEntity.ok(questionService.create(content, marks, pypId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Question> update(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        String content = (String) body.get("content");
        Integer marks  = (Integer) body.get("marks");
        return ResponseEntity.ok(questionService.update(id, content, marks));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        questionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
