package com.intellbank.repository;

import com.intellbank.entity.Submission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SubmissionRepository extends JpaRepository<Submission, UUID> {

    List<Submission> findByDocumentDocumentId(UUID documentId);

    void deleteByDocumentDocumentId(UUID documentId);

    /** Educator queue: submissions in any of the given statuses. */
    List<Submission> findByStatusIn(java.util.Collection<String> statuses);

    /**
     * Every submission belonging to one student (resolved via Document → Project →
     * Student → User.email).
     */
    List<Submission> findByDocumentProjectStudentUserEmailIgnoreCase(String email);

    /**
     * A student's "active" submissions — anything not yet RETURNED.
     * Used to enforce the one-active-submission rule (must be returned before
     * resubmitting).
     */
    List<Submission> findByDocumentProjectStudentUserEmailIgnoreCaseAndStatusNot(String email, String status);

    /**
     * Educator queue: every submission currently in a given status (e.g. PENDING).
     */
    List<Submission> findByStatus(String status);
}