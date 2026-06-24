package com.intellbank.service;

import com.intellbank.dto.ClassMatrix;
import com.intellbank.dto.TopicMastery;
import com.intellbank.entity.Student;
import com.intellbank.entity.StudentPerformance;
import com.intellbank.repository.StudentPerformanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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

    /** Subjects that have trained topic-prediction data (used to flag them in the UI). */
    public List<String> getPredictionSubjects() {
        return aiClientService.predictionSubjects();
    }

    /**
     * Cohort "Class Weakness" analysis for a subject — proxies the project's own trained
     * weakness-clustering model in the AI service. Visible to students and educators.
     */
    public Map<String, Object> getClassWeaknesses(String subject) {
        return aiClientService.classWeaknesses(subject);
    }

    /**
     * Topics × Students mastery matrix for the educator Class Analysis heat map.
     * Rows are topics, columns are students; each cell is that student's score on the topic.
     */
    public ClassMatrix getClassMatrix(String subject) {
        List<StudentPerformance> rows = performanceRepository.findBySubjectName(subject);

        // Distinct students (columns) and topics (rows), plus a (topic,student) → row lookup.
        Map<UUID, String> students = new LinkedHashMap<>();
        Map<UUID, String> topics   = new LinkedHashMap<>();
        Map<String, StudentPerformance> byKey = new HashMap<>();
        for (StudentPerformance p : rows) {
            UUID sid = p.getStudent().getStudentId();
            UUID tid = p.getTopic().getTopicId();
            students.putIfAbsent(sid, studentName(p.getStudent()));
            topics.putIfAbsent(tid, p.getTopic().getName());
            byKey.put(tid + "_" + sid, p);
        }

        List<ClassMatrix.Col> cols = students.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .map(e -> new ClassMatrix.Col(e.getKey(), e.getValue()))
                .toList();

        List<ClassMatrix.Row> matrixRows = topics.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .map(te -> {
                    List<ClassMatrix.Cell> cells = cols.stream().map(col -> {
                        StudentPerformance p = byKey.get(te.getKey() + "_" + col.id());
                        if (p == null) return new ClassMatrix.Cell(col.id(), null, null, null);
                        return new ClassMatrix.Cell(col.id(),
                                representativeScore(p.getMasteryLevel()), p.getMasteryLevel(), p.getComment());
                    }).toList();
                    return new ClassMatrix.Row(te.getKey(), te.getValue(), cells);
                })
                .toList();

        return new ClassMatrix(subject, cols, matrixRows);
    }

    private String studentName(Student student) {
        try {
            String name = student.getUser().getFullName();
            if (name != null && !name.isBlank()) return name;
            return student.getUser().getEmail();
        } catch (Exception ignored) {
            return "Student";
        }
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
                representativeScore(p.getMasteryLevel()),
                p.getComment());
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