package com.intellbank.repository;

import com.intellbank.entity.StudentPerformance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * StudentPerformanceRepository – per-topic mastery, the data source for the
 * Predictive Analytics weakness heatmap and the "Target My Weaknesses" generator.
 */
public interface StudentPerformanceRepository extends JpaRepository<StudentPerformance, UUID> {

    /** All mastery rows for the logged-in student (resolved by their account email). */
    List<StudentPerformance> findByStudentUserEmailIgnoreCase(String email);

    /** All mastery rows for a student by id. */
    List<StudentPerformance> findByStudentStudentId(UUID studentId);

    /** Existing mastery row for a (student, topic) pair so grading can upsert instead of duplicate. */
    Optional<StudentPerformance> findByStudentStudentIdAndTopicTopicId(UUID studentId, UUID topicId);

    /** Every (student, topic) mastery row for a subject — the source for the class matrix heat map. */
    @Query("SELECT sp FROM StudentPerformance sp " +
           "JOIN FETCH sp.topic t JOIN FETCH t.subject s " +
           "JOIN FETCH sp.student st JOIN FETCH st.user u " +
           "WHERE LOWER(s.name) = LOWER(:subject)")
    List<StudentPerformance> findBySubjectName(@Param("subject") String subject);
}