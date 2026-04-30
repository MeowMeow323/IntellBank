package com.intellbank.controller;

import com.intellbank.entity.Project;
import com.intellbank.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public ResponseEntity<List<Project>> getAll(Authentication auth) {
        return ResponseEntity.ok(projectService.getProjectsForStudent(auth.getName()));
    }

    @PostMapping
    public ResponseEntity<Project> create(@RequestBody Map<String, Object> body, Authentication auth) {
        String name = (String) body.get("projectName");
        return ResponseEntity.ok(projectService.create(name, auth.getName()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Project> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(projectService.getById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Project> update(@PathVariable UUID id,
                                          @RequestBody Map<String, Object> body,
                                          Authentication auth) {
        String name = (String) body.get("projectName");
        return ResponseEntity.ok(projectService.update(id, name, auth.getName()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
        projectService.delete(id, auth.getName());
        return ResponseEntity.noContent().build();
    }
}
