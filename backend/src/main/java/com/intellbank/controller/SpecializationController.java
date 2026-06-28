package com.intellbank.controller;

import com.intellbank.entity.Educator;
import com.intellbank.entity.Subject;
import com.intellbank.entity.User;
import com.intellbank.exception.AppException;
import com.intellbank.repository.EducatorRepository;
import com.intellbank.repository.SubjectRepository;
import com.intellbank.service.SpecializationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Admin-only management of educator ↔ subject specializations.
 * Every endpoint rejects non-ADMIN callers with 403.
 */
@RestController
@RequestMapping("/api/admin/specializations")
@RequiredArgsConstructor
public class SpecializationController {

    private final SpecializationService specializationService;
    private final EducatorRepository educatorRepository;
    private final SubjectRepository subjectRepository;

    private void assertAdmin(Authentication auth) {
        User user = (User) auth.getPrincipal();
        if (!SpecializationService.ROLE_ADMIN.equals(user.getRole())) {
            throw new AppException("Administrators only.", HttpStatus.FORBIDDEN);
        }
    }

    /** Every educator with the subject ids they're currently assigned to. */
    @GetMapping("/educators")
    public ResponseEntity<List<Map<String, Object>>> educators(Authentication auth) {
        assertAdmin(auth);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Educator e : educatorRepository.findAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("educatorId", e.getEducatorId());
            try {
                m.put("fullName", e.getUser().getFullName());
                m.put("email", e.getUser().getEmail());
            } catch (Exception ignored) {
                m.put("fullName", "");
                m.put("email", "");
            }
            m.put("subjectIds", specializationService.getForEducator(e.getEducatorId())
                    .stream().map(s -> s.getSubject().getSubjectId()).collect(Collectors.toList()));
            out.add(m);
        }
        return ResponseEntity.ok(out);
    }

    /** All subjects — the checkbox options in the admin UI. */
    @GetMapping("/subjects")
    public ResponseEntity<List<Subject>> subjects(Authentication auth) {
        assertAdmin(auth);
        return ResponseEntity.ok(subjectRepository.findAll());
    }

    /** Replace an educator's specialization set. Body: { "subjectIds": ["<uuid>", ...] }. */
    @PutMapping("/educators/{educatorId}")
    public ResponseEntity<Void> setForEducator(@PathVariable UUID educatorId,
                                               @RequestBody Map<String, Object> body,
                                               Authentication auth) {
        assertAdmin(auth);
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.getOrDefault("subjectIds", List.of());
        specializationService.setForEducator(educatorId,
                ids.stream().map(UUID::fromString).collect(Collectors.toList()));
        return ResponseEntity.noContent().build();
    }
}
