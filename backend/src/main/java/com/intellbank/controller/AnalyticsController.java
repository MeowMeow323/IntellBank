package com.intellbank.controller;

import com.intellbank.dto.ClassMatrix;
import com.intellbank.dto.TopicMastery;
import com.intellbank.entity.Subject;
import com.intellbank.entity.User;
import com.intellbank.service.AnalyticsService;
import com.intellbank.service.SpecializationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * AnalyticsController – backs the Predictive Analytics page.
 * (Previously missing entirely; api.js already expected these routes.)
 */
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final SpecializationService specializationService;

    private static final String ROLE_EDUCATOR = "EDUCATOR";

    /** Resolve the logged-in user's email from the JWT principal (a {@link User} entity). */
    private static String emailOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getEmail();
    }

    private static String roleOf(Authentication auth) {
        return ((User) auth.getPrincipal()).getRole();
    }

    /** GET /api/analytics/my-mastery – per-topic mastery heatmap for the logged-in student. */
    @GetMapping("/my-mastery")
    public ResponseEntity<List<TopicMastery>> myMastery(Authentication auth) {
        return ResponseEntity.ok(analyticsService.getMyMastery(emailOf(auth)));
    }

    /** GET /api/analytics/my-weaknesses – topics below 50% mastery. */
    @GetMapping("/my-weaknesses")
    public ResponseEntity<List<TopicMastery>> myWeaknesses(Authentication auth) {
        return ResponseEntity.ok(analyticsService.getMyWeaknesses(emailOf(auth)));
    }

    /**
     * GET /api/analytics/subjects – subject names for the selector. Educators get only
     * the subjects they specialize in; students and admins get all.
     */
    @GetMapping("/subjects")
    public ResponseEntity<List<String>> subjects(Authentication auth) {
        if (ROLE_EDUCATOR.equals(roleOf(auth))) {
            return ResponseEntity.ok(specializationService.subjectsForEducator(emailOf(auth))
                    .stream().map(Subject::getName).sorted().toList());
        }
        return ResponseEntity.ok(analyticsService.getSubjects());
    }

    /** GET /api/analytics/prediction-subjects – subjects that have trained prediction data. */
    @GetMapping("/prediction-subjects")
    public ResponseEntity<List<String>> predictionSubjects() {
        return ResponseEntity.ok(analyticsService.getPredictionSubjects());
    }

    /** GET /api/analytics/predicted-topics?subject=... – K-Means likely-to-appear topics. */
    @GetMapping("/predicted-topics")
    public ResponseEntity<Map<String, Object>> predictedTopics(
            @RequestParam(defaultValue = "Software Project Management") String subject) {
        return ResponseEntity.ok(analyticsService.getPredictedTopics(subject));
    }

    /**
     * GET /api/analytics/class-weaknesses?subject=... – cohort weakness analysis from the
     * project's own trained model. Available to students and educators.
     */
    @GetMapping("/class-weaknesses")
    public ResponseEntity<Map<String, Object>> classWeaknesses(@RequestParam String subject, Authentication auth) {
        if (ROLE_EDUCATOR.equals(roleOf(auth)))
            specializationService.assertCanHandleSubjectName(emailOf(auth), roleOf(auth), subject);
        return ResponseEntity.ok(analyticsService.getClassWeaknesses(subject));
    }

    /** GET /api/analytics/class-matrix?subject=... – Topics × Students mastery heat-map matrix. */
    @GetMapping("/class-matrix")
    public ResponseEntity<ClassMatrix> classMatrix(@RequestParam String subject, Authentication auth) {
        if (ROLE_EDUCATOR.equals(roleOf(auth)))
            specializationService.assertCanHandleSubjectName(emailOf(auth), roleOf(auth), subject);
        return ResponseEntity.ok(analyticsService.getClassMatrix(subject));
    }
}