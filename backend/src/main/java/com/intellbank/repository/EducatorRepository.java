package com.intellbank.repository;

import com.intellbank.entity.Educator;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface EducatorRepository extends JpaRepository<Educator, UUID> {
    Optional<Educator> findByUserUserId(UUID userId);
}
