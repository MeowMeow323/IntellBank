package com.intellbank.controller;

import com.intellbank.dto.PastYearPaperResponse;
import com.intellbank.entity.User;
import com.intellbank.service.PastYearPaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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

    private static String emailOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getEmail();
    }

    private static String roleOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getRole();
    }

    @GetMapping
    public ResponseEntity<List<PastYearPaperResponse>> getAll(Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.getAll(emailOf(auth), roleOf(auth)));
    }

    @GetMapping("/{pypId}")
    public ResponseEntity<PastYearPaperResponse> getById(@PathVariable UUID pypId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.getById(pypId, emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/preview")
    public ResponseEntity<Map<String, Object>> preview(
            @RequestParam MultipartFile file,
            Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.previewPaper(file));
    }

    @PostMapping("/upload")
    public ResponseEntity<PastYearPaperResponse> upload(
            @RequestParam String title,
            @RequestParam String subject,
            @RequestParam(required = false) String courseCode,
            @RequestParam(required = false) String examSession,
            @RequestParam MultipartFile file,
            Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.uploadPaper(
                title, file, subject, courseCode, examSession, emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/{pypId}/process")
    public ResponseEntity<PastYearPaperResponse> process(@PathVariable UUID pypId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.triggerProcessing(pypId, emailOf(auth), roleOf(auth)));
    }

    @GetMapping("/{pypId}/progress")
    public ResponseEntity<Map<String, Object>> progress(@PathVariable UUID pypId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.getProgress(pypId, emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/{pypId}/generate-solutions")
    public ResponseEntity<Map<String, Object>> generateSolutions(@PathVariable UUID pypId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.generateSolutions(pypId, emailOf(auth), roleOf(auth)));
    }

    @PostMapping("/questions/{questionId}/generate-solution")
    public ResponseEntity<Map<String, Object>> generateSingleSolution(@PathVariable UUID questionId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.generateSingleSolution(questionId, emailOf(auth), roleOf(auth)));
    }

    @GetMapping("/{pypId}/solutions")
    public ResponseEntity<List<Map<String, Object>>> getSolutions(@PathVariable UUID pypId, Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.getSolutions(pypId, emailOf(auth), roleOf(auth)));
    }

    @PatchMapping("/{pypId}")
    public ResponseEntity<PastYearPaperResponse> update(
            @PathVariable UUID pypId,
            @RequestBody Map<String, String> updates,
            Authentication auth) {
        return ResponseEntity.ok(pastYearPaperService.updatePaper(pypId, updates, emailOf(auth), roleOf(auth)));
    }

    @DeleteMapping("/{pypId}")
    public ResponseEntity<Void> delete(@PathVariable UUID pypId, Authentication auth) {
        pastYearPaperService.deletePaper(pypId, emailOf(auth), roleOf(auth));
        return ResponseEntity.noContent().build();
    }
}
