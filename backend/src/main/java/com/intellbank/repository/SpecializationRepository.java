package com.intellbank.repository;

import com.intellbank.entity.Specialization;
import com.intellbank.entity.SpecializationId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Educator ↔ Subject links — which subjects each educator is allowed to handle. */
public interface SpecializationRepository extends JpaRepository<Specialization, SpecializationId> {
    List<Specialization> findByEducatorEducatorId(UUID educatorId);
    boolean existsByEducatorEducatorIdAndSubjectSubjectId(UUID educatorId, UUID subjectId);
}
