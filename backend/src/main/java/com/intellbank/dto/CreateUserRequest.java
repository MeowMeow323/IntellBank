package com.intellbank.dto;

/** Admin-driven user creation. Role is chosen by the admin (not client self-registration). */
public record CreateUserRequest(
        String fullName,
        String email,
        String password,
        String role
) {}
