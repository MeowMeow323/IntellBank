package com.intellbank.controller;

import com.intellbank.dto.PastYearPaperResponse;
import com.intellbank.service.PastYearPaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;


@RestController
@RequestMapping("/api/past-year-papers")
@RequiredArgsConstructor
public class PastYearPaperController {

    private final PastYearPaperService pastYearPaperService;

    @GetMapping
    public ResponseEntity<List<PastYearPaperResponse>> getAll() {
        return ResponseEntity.ok(pastYearPaperService.getAll());
    }

    @PostMapping("/upload")
    public ResponseEntity<PastYearPaperResponse> upload(
            @RequestParam String title,
            @RequestParam MultipartFile file) {
        return ResponseEntity.ok(pastYearPaperService.uploadPaper(title, file));
    }

    @PostMapping("/{pypId}/process")
    public ResponseEntity<PastYearPaperResponse> process(@PathVariable UUID pypId) {
        return ResponseEntity.ok(pastYearPaperService.triggerProcessing(pypId));
    }

    @GetMapping("/{pypId}/progress")
    public ResponseEntity<Map<String, Object>> progress(@PathVariable UUID pypId) {
        return ResponseEntity.ok(pastYearPaperService.getProgress(pypId));
    }

    @PostMapping("/{pypId}/generate-solutions")
    public ResponseEntity<Map<String, Object>> generateSolutions(@PathVariable UUID pypId) {
        return ResponseEntity.ok(pastYearPaperService.generateSolutions(pypId));
    }

    @PostMapping("/questions/{questionId}/generate-solution")
    public ResponseEntity<Map<String, Object>> generateSingleSolution(@PathVariable UUID questionId) {
        return ResponseEntity.ok(pastYearPaperService.generateSingleSolution(questionId));
    }

    @GetMapping("/{pypId}/solutions")
    public ResponseEntity<List<Map<String, Object>>> getSolutions(@PathVariable UUID pypId) {
        return ResponseEntity.ok(pastYearPaperService.getSolutions(pypId));
    }

    @DeleteMapping("/{pypId}")
    public ResponseEntity<Void> delete(@PathVariable UUID pypId) {
        pastYearPaperService.deletePaper(pypId);
        return ResponseEntity.noContent().build();
    }
}
