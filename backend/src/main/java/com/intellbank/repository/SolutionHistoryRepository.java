package com.intellbank.repository;

import com.intellbank.entity.SolutionHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SolutionHistoryRepository extends JpaRepository<SolutionHistory, UUID> {
    List<SolutionHistory> findBySolutionSolutionIdOrderByChangedTimestampDesc(UUID solutionId);

    void deleteBySolutionSolutionIdIn(List<UUID> solutionIds);
}
