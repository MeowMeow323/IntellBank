package com.intellbank.repository;

import com.intellbank.entity.Administrator;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface AdministratorRepository extends JpaRepository<Administrator, UUID> {
    Optional<Administrator> findByUserUserId(UUID userId);
}
