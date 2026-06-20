package com.intellbank.controller;

import com.intellbank.dto.PastYearPaperResponse;
import com.intellbank.service.PastYearPaperService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
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
}
