package com.intellbank.service;

import com.intellbank.dto.TopicMastery;
import com.intellbank.entity.StudentPerformance;
import com.intellbank.repository.StudentPerformanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * AnalyticsService – powers the Predictive Analytics page.
 *
 *  - Personal mastery heatmap + weakness list ← {@link StudentPerformance} (this service).
 *  - "Topics likely to appear next" probabilities ← proxied to the Python K-Means
 *    predictor via {@link AiClientService} (the only class allowed to call the AI service).
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    /** A topic is a weakness when its mastery is below 50% (the "Beginner" band). */
    private static final int WEAKNESS_THRESHOLD = 50;

    private final StudentPerformanceRepository performanceRepository;
    private final AiClientService aiClientService;
    private final com.intellbank.repository.SubjectRepository subjectRepository;

    /** Full per-topic mastery for the logged-in student (heatmap source). */
    public List<TopicMastery> getMyMastery(String email) {
        return performanceRepository.findByStudentUserEmailIgnoreCase(email).stream()
                .map(this::toMastery)
                .toList();
    }

    /** Only the weak topics (mastery below 50%) — the "Identified Weaknesses" panel. */
    public List<TopicMastery> getMyWeaknesses(String email) {
        return getMyMastery(email).stream()
                .filter(m -> m.score() < WEAKNESS_THRESHOLD)
                .toList();
    }

    /** All subject names in the DB — used to populate the subject selector on the analytics page. */
    public List<String> getSubjects() {
        return subjectRepository.findAll().stream()
                .map(s -> s.getName())
                .sorted()
                .toList();
    }

    /**
     * Predicted high-probability topics for a subject, from the K-Means model in the AI service.
     * Returns the raw AI payload ({ subject, predictions: [{ topic, confidence, predicted_next_year }] }).
     */
    public Map<String, Object> getPredictedTopics(String subject) {
        return aiClientService.predictTopics(subject);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private TopicMastery toMastery(StudentPerformance p) {
        String subjectName = "";
        try {
            subjectName = p.getTopic().getSubject().getName();
        } catch (Exception ignored) { /* lazy chain may be absent */ }

        return new TopicMastery(
                p.getTopic().getTopicId(),
                p.getTopic().getName(),
                subjectName,
                p.getMasteryLevel(),
                representativeScore(p.getMasteryLevel()));
    }

    /** Map a stored mastery label to a representative % for heatmap colouring. */
    private int representativeScore(String mastery) {
        if (mastery == null) return 40;
        return switch (mastery) {
            case "Mastered"     -> 95;
            case "Advanced"     -> 80;
            case "Intermediate" -> 60;
            default             -> 40; // Beginner
        };
    }
}