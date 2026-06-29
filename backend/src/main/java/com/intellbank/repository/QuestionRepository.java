package com.intellbank.repository;

import com.intellbank.entity.Question;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface QuestionRepository extends JpaRepository<Question, UUID> {
    List<Question> findByPastYearPaperPypId(UUID pypId);

    /** Fetch questions for multiple papers in one query with the paper eagerly loaded. */
    @Query("SELECT q FROM Question q JOIN FETCH q.pastYearPaper p WHERE p.pypId IN :pypIds")
    List<Question> findByPapersIn(@Param("pypIds") Collection<UUID> pypIds);

    void deleteByPastYearPaperPypId(UUID pypId);
}
