package com.intellbank.dto;

/** Every field is optional — null means "leave unchanged". No password field: use the
 *  existing forgot-password flow for password resets. */
public record UpdateUserRequest(
        String fullName,
        String email,
        String role,
        Boolean isActive
) {}
