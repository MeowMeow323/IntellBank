package com.intellbank.repository;

import com.intellbank.entity.Solution;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SolutionRepository extends JpaRepository<Solution, UUID> {
    Optional<Solution> findByQuestionQuestionId(UUID questionId);

    /** Pending verification = isVerified is false. */
    List<Solution> findByIsVerifiedFalse();
}
