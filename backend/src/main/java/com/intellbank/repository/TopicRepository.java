package com.intellbank.repository;

import com.intellbank.entity.Topic;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TopicRepository extends JpaRepository<Topic, UUID> {
    List<Topic> findBySubjectSubjectId(UUID subjectId);
    Optional<Topic> findBySubjectSubjectIdAndNameIgnoreCase(UUID subjectId, String name);
}
