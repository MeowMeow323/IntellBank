package com.intellbank.controller;

import com.intellbank.dto.CreateUserRequest;
import com.intellbank.dto.UpdateUserRequest;
import com.intellbank.dto.UserResponse;
import com.intellbank.entity.User;
import com.intellbank.exception.AppException;
import com.intellbank.service.AdminUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Admin-only CRUD over all users (any role).
 * Every endpoint rejects non-ADMIN callers with 403.
 */
@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    private void assertAdmin(Authentication auth) {
        User user = (User) auth.getPrincipal();
        if (!AdminUserService.ROLE_ADMIN.equals(user.getRole())) {
            throw new AppException("Administrators only.", HttpStatus.FORBIDDEN);
        }
    }

    @GetMapping
    public ResponseEntity<List<UserResponse>> list(Authentication auth) {
        assertAdmin(auth);
        return ResponseEntity.ok(adminUserService.listUsers());
    }

    @PostMapping
    public ResponseEntity<UserResponse> create(@RequestBody CreateUserRequest body, Authentication auth) {
        assertAdmin(auth);
        return ResponseEntity.status(HttpStatus.CREATED).body(adminUserService.createUser(body));
    }

    @PutMapping("/{userId}")
    public ResponseEntity<UserResponse> update(@PathVariable UUID userId,
                                                @RequestBody UpdateUserRequest body,
                                                Authentication auth) {
        assertAdmin(auth);
        User currentUser = (User) auth.getPrincipal();
        return ResponseEntity.ok(adminUserService.updateUser(userId, body, currentUser));
    }
}
