package com.intellbank.controller;

import com.intellbank.entity.PastYearPaper;
import com.intellbank.repository.PastYearPaperRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/past-year-papers")
@RequiredArgsConstructor
public class PastYearPaperController {

    private final PastYearPaperRepository pastYearPaperRepository;

    @GetMapping
    public ResponseEntity<List<PastYearPaper>> getAll() {
        return ResponseEntity.ok(pastYearPaperRepository.findAll());
    }
}
