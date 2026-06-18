package com.intellbank.controller;

import com.intellbank.entity.Document;
import com.intellbank.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;

    @GetMapping("/by-project/{projectId}")
    public ResponseEntity<List<Document>> getByProject(@PathVariable UUID projectId) {
        return ResponseEntity.ok(documentService.getByProject(projectId));
    }

    @GetMapping("/{documentId}")
    public ResponseEntity<Document> getById(@PathVariable UUID documentId) {
        return ResponseEntity.ok(documentService.getById(documentId));
    }

    @PostMapping("/upload")
    public ResponseEntity<Document> upload(
            @RequestParam UUID projectId,
            @RequestParam String title,
            @RequestParam(defaultValue = "Raw Document") String type,
            @RequestParam(required = false) MultipartFile file) {
        return ResponseEntity.ok(documentService.upload(projectId, title, type, file));
    }

    @PostMapping("/open-past-year-paper")
    public ResponseEntity<Document> openPastYearPaper(@RequestBody Map<String, String> body) {
        UUID pypId     = UUID.fromString(body.get("pypId"));
        UUID projectId = UUID.fromString(body.get("projectId"));
        return ResponseEntity.ok(documentService.openPastYearPaper(pypId, projectId));
    }

    @DeleteMapping("/{documentId}")
    public ResponseEntity<Void> delete(@PathVariable UUID documentId, @RequestParam String email) {
        documentService.delete(documentId, email);
        return ResponseEntity.noContent().build();
    }
}
