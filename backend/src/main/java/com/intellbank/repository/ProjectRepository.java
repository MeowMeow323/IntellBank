package com.intellbank.repository;

import com.intellbank.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
    List<Project> findByStudentStudentId(UUID studentId);
}
