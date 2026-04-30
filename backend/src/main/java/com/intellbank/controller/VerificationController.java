package com.intellbank.controller;

import com.intellbank.entity.Solution;
import com.intellbank.service.VerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * VerificationController – works with Solutions only.
 * Question does NOT have a verification status.
 */
@RestController
@RequestMapping("/api/verification")
@RequiredArgsConstructor
public class VerificationController {

    private final VerificationService verificationService;

    /** List all solutions pending verification (isVerified = false). */
    @GetMapping("/pending")
    public ResponseEntity<List<Solution>> getPending() {
        return ResponseEntity.ok(verificationService.getPendingSolutions());
    }

    @GetMapping("/{solutionId}")
    public ResponseEntity<Solution> getById(@PathVariable UUID solutionId) {
        return ResponseEntity.ok(verificationService.getById(solutionId));
    }

    /** Approve: sets isVerified = true, records verifiedBy and verifiedAt. */
    @PostMapping("/{solutionId}/approve")
    public ResponseEntity<Solution> approve(@PathVariable UUID solutionId, Authentication auth) {
        return ResponseEntity.ok(verificationService.approve(solutionId, auth.getName()));
    }

    /** Reject: reverts isVerified to false. */
    @PostMapping("/{solutionId}/reject")
    public ResponseEntity<Solution> reject(@PathVariable UUID solutionId, Authentication auth) {
        return ResponseEntity.ok(verificationService.reject(solutionId, auth.getName()));
    }

    /**
     * Edit solution content/explanation.
     * Automatically creates a SolutionHistory record before saving.
     */
    @PutMapping("/{solutionId}")
    public ResponseEntity<Solution> edit(@PathVariable UUID solutionId,
                                         @RequestBody Map<String, Object> body,
                                         Authentication auth) {
        String content     = (String) body.get("content");
        String explanation = (String) body.get("explanation");
        return ResponseEntity.ok(verificationService.edit(solutionId, content, explanation, auth.getName()));
    }
}
