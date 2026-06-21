package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * SubmissionService – students submit answered "AI Generated Exam" documents.
 *
 * Business rules (FYP adjustments #1 & #2):
 *  - Only Documents with type = "AI Generated Exam" may be submitted.
 *  - A student may hold at most ONE active submission (status != RETURNED).
 *    The current work must be RETURNED (by the educator after grading, or by the
 *    student via unsubmit) before another paper can be submitted — this prevents
 *    a single student flooding the educator's verification queue.
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class SubmissionService {

    private static final String TYPE_GENERATED = "AI Generated Exam";
    private static final String STATUS_PENDING  = "PENDING";
    private static final String STATUS_RETURNED = "RETURNED";

    private final SubmissionRepository submissionRepository;
    private final DocumentRepository documentRepository;

    /**
     * Submit a generated exam for educator review.
     *
     * @param documentId the AI-generated exam document the student answered
     * @param email      the logged-in student's account email (from JWT)
     */
    @Transactional
    public Submission submit(UUID documentId, String email) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new AppException("Document not found", HttpStatus.NOT_FOUND));

        if (!TYPE_GENERATED.equals(document.getType())) {
            throw new AppException(
                "Only generated practice papers can be submitted (type was: " + document.getType() + ").",
                HttpStatus.BAD_REQUEST);
        }

        // One-paper-one-submission rule: this exact document was already submitted.
        // (Withdrawing deletes the submission, which frees the paper to be submitted again.)
        if (!submissionRepository.findByDocumentDocumentId(documentId).isEmpty()) {
            throw new AppException(
                "This paper has already been submitted. Generate a new paper if you want to submit again.",
                HttpStatus.CONFLICT);
        }

        // One-active-submission rule: block if any prior submission is still un-returned.
        List<Submission> active =
                submissionRepository.findByDocumentProjectStudentUserEmailIgnoreCaseAndStatusNot(email, STATUS_RETURNED);
        if (!active.isEmpty()) {
            throw new AppException(
                "You already have a submission awaiting review. It must be returned before you can submit another paper.",
                HttpStatus.CONFLICT);
        }

        Submission submission = Submission.builder()
                .document(document)
                .status(STATUS_PENDING)
                .build();
        return submissionRepository.save(submission);
    }

    /**
     * Student withdraws their own PENDING submission (UC_005 "Unsubmit").
     * Deletes the submission row, which both frees the one-active slot AND allows the
     * same paper to be submitted again (a graded+returned paper keeps its row, so it
     * can't be resubmitted).
     */
    @Transactional
    public void unsubmit(UUID submissionId, String email) {
        Submission submission = getById(submissionId);
        assertOwner(submission, email);
        if (!STATUS_PENDING.equals(submission.getStatus())) {
            throw new AppException(
                "Only pending submissions can be withdrawn (current status: " + submission.getStatus() + ").",
                HttpStatus.BAD_REQUEST);
        }
        submissionRepository.delete(submission);
    }

    /** Verify the given email owns this submission (resolved via Document → Project → Student → User). */
    public void assertOwner(UUID submissionId, String email) {
        assertOwner(getById(submissionId), email);
    }

    private void assertOwner(Submission submission, String email) {
        String owner = null;
        try {
            owner = submission.getDocument().getProject().getStudent().getUser().getEmail();
        } catch (Exception ignored) { /* lazy chain may be absent */ }
        if (owner == null || !owner.equalsIgnoreCase(email)) {
            throw new AppException("You can only access your own submissions.", HttpStatus.FORBIDDEN);
        }
    }

    /** All submissions belonging to the logged-in student (for the Submissions page). */
    public List<Submission> getMySubmissions(String email) {
        return submissionRepository.findByDocumentProjectStudentUserEmailIgnoreCase(email);
    }

    public List<Submission> getByDocument(UUID documentId) {
        return submissionRepository.findByDocumentDocumentId(documentId);
    }

    public Submission getById(UUID submissionId) {
        return submissionRepository.findById(submissionId)
                .orElseThrow(() -> new AppException("Submission not found", HttpStatus.NOT_FOUND));
    }
}