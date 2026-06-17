package com.intellbank.controller;

import com.intellbank.service.MetadataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/metadata")
@RequiredArgsConstructor
public class MetadataController {

    private final MetadataService metadataService;

    @GetMapping("/subject-topics")
    public ResponseEntity<Map<String, List<String>>> getSubjectTopics() {
        return ResponseEntity.ok(metadataService.getSubjectTopicsMap());
    }
}
