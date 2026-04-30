package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * VerificationService – verification is controlled ONLY through Solutions.isVerified.
 * Question itself has no verification status.
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class VerificationService {

    private final SolutionRepository solutionRepository;
    private final SolutionHistoryRepository historyRepository;
    private final UserRepository userRepository;

    /** Get all solutions pending verification (isVerified = false). */
    public List<Solution> getPendingSolutions() {
        return solutionRepository.findByIsVerifiedFalse();
    }

    public Solution getById(UUID solutionId) {
        return solutionRepository.findById(solutionId)
                .orElseThrow(() -> new AppException("Solution not found", HttpStatus.NOT_FOUND));
    }

    /** Approve: set isVerified = true, record who/when. */
    @Transactional
    public Solution approve(UUID solutionId, String reviewerEmail) {
        Solution solution = getById(solutionId);
        User reviewer = getUser(reviewerEmail);
        solution.setIsVerified(true);
        solution.setVerifiedBy(reviewer);
        solution.setVerifiedAt(OffsetDateTime.now());
        return solutionRepository.save(solution);
    }

    /** Reject (revert): set isVerified = false, clear verifier. */
    @Transactional
    public Solution reject(UUID solutionId, String reviewerEmail) {
        Solution solution = getById(solutionId);
        solution.setIsVerified(false);
        solution.setVerifiedBy(null);
        solution.setVerifiedAt(null);
        return solutionRepository.save(solution);
    }

    /**
     * Edit solution content or explanation.
     * A SolutionHistory record is created BEFORE the update for audit trail.
     */
    @Transactional
    public Solution edit(UUID solutionId, String newContent, String newExplanation, String editorEmail) {
        Solution solution = getById(solutionId);
        User editor = getUser(editorEmail);

        boolean contentChanging = newContent != null && !newContent.equals(solution.getContent());
        boolean explanationChanging = newExplanation != null && !newExplanation.equals(solution.getExplanation());

        if (contentChanging || explanationChanging) {
            // Write history BEFORE changing
            SolutionHistory history = SolutionHistory.builder()
                    .solution(solution)
                    .oldContent(solution.getContent())
                    .oldExplanation(solution.getExplanation())
                    .changedBy(editor)
                    .build();
            historyRepository.save(history);

            if (contentChanging) solution.setContent(newContent);
            if (explanationChanging) solution.setExplanation(newExplanation);

            // Editing resets verification status (needs re-approval)
            solution.setIsVerified(false);
            solution.setVerifiedBy(null);
            solution.setVerifiedAt(null);
        }

        return solutionRepository.save(solution);
    }

    private User getUser(String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
    }
}
