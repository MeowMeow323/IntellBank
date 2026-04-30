package com.intellbank.repository;

import com.intellbank.entity.Difficulty;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface DifficultyRepository extends JpaRepository<Difficulty, UUID> {}
