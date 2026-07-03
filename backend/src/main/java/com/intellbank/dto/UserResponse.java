package com.intellbank.dto;

import com.intellbank.entity.User;

import java.time.OffsetDateTime;
import java.util.UUID;

/** API-facing shape for User — deliberately excludes passwordHash. */
public record UserResponse(
        UUID userId,
        String fullName,
        String email,
        String role,
        Boolean isActive,
        OffsetDateTime createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getUserId(),
                user.getFullName(),
                user.getEmail(),
                user.getRole(),
                user.getIsActive(),
                user.getCreatedAt());
    }
}
