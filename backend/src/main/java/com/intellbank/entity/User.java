package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Users – shared authentication/identity table.
 * 'role' (STUDENT | EDUCATOR | ADMIN) is kept as a plain String for
 * Spring Security JWT routing. The actual profile is in Student / Educator / Administrator.
 */
@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "full_name")
    private String fullName;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** STUDENT | EDUCATOR | ADMIN – used for Spring Security only. */
    @Builder.Default
    @Column(nullable = false, length = 50)
    private String role = "STUDENT";

    @Builder.Default
    @Column(name = "is_active")
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;
}
