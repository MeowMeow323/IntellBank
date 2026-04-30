package com.intellbank.repository;

import com.intellbank.entity.PastYearPaper;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PastYearPaperRepository extends JpaRepository<PastYearPaper, UUID> {}
