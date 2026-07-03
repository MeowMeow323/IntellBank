package com.intellbank.service;

import com.intellbank.dto.CreateUserRequest;
import com.intellbank.dto.UpdateUserRequest;
import com.intellbank.dto.UserResponse;
import com.intellbank.entity.Administrator;
import com.intellbank.entity.Educator;
import com.intellbank.entity.Student;
import com.intellbank.entity.User;
import com.intellbank.exception.AppException;
import com.intellbank.repository.AdministratorRepository;
import com.intellbank.repository.EducatorRepository;
import com.intellbank.repository.StudentRepository;
import com.intellbank.repository.UserRepository;
import com.intellbank.util.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Admin-only user management: list/create/update/delete users of any role.
 * Keeps the Student/Educator/Administrator profile row in sync with `role`.
 */
@Service
@RequiredArgsConstructor
public class AdminUserService {

    public static final String ROLE_ADMIN = "ADMIN";
    private static final Set<String> VALID_ROLES = Set.of("STUDENT", "EDUCATOR", "ADMIN");

    private final UserRepository userRepository;
    private final StudentRepository studentRepository;
    private final EducatorRepository educatorRepository;
    private final AdministratorRepository administratorRepository;
    private final PasswordEncoder passwordEncoder;

    public List<UserResponse> listUsers() {
        return userRepository.findAll().stream().map(UserResponse::from).collect(Collectors.toList());
    }

    @Transactional
    public UserResponse createUser(CreateUserRequest req) {
        String email = req.email() == null ? null : req.email().trim().toLowerCase();
        if (email == null || email.isBlank()) {
            throw new AppException("Email is required", HttpStatus.BAD_REQUEST);
        }
        String fullName = req.fullName() == null ? null : req.fullName().trim();
        if (fullName == null || fullName.isBlank()) {
            throw new AppException("Full name is required", HttpStatus.BAD_REQUEST);
        }
        String role = normalizeRole(req.role());
        PasswordPolicy.validate(req.password());

        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new AppException("That email is already registered", HttpStatus.CONFLICT);
        }

        User user = User.builder()
                .email(email)
                .fullName(fullName)
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(role)
                .isActive(true)
                .build();
        user = userRepository.save(user);

        createProfileRow(user, role);

        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updateUser(UUID userId, UpdateUserRequest req, User currentUser) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));

        if (req.fullName() != null) {
            String fn = req.fullName().trim();
            if (fn.isBlank()) {
                throw new AppException("Full name cannot be blank", HttpStatus.BAD_REQUEST);
            }
            user.setFullName(fn);
        }

        if (req.email() != null) {
            String email = req.email().trim().toLowerCase();
            if (email.isBlank()) {
                throw new AppException("Email cannot be blank", HttpStatus.BAD_REQUEST);
            }
            userRepository.findByEmailIgnoreCase(email).ifPresent(existing -> {
                if (!existing.getUserId().equals(userId)) {
                    throw new AppException("That email is already registered", HttpStatus.CONFLICT);
                }
            });
            user.setEmail(email);
        }

        if (req.isActive() != null) {
            if (userId.equals(currentUser.getUserId()) && !req.isActive()) {
                throw new AppException("You cannot deactivate your own account.", HttpStatus.FORBIDDEN);
            }
            user.setIsActive(req.isActive());
        }

        if (req.role() != null) {
            String newRole = normalizeRole(req.role());
            if (!newRole.equals(user.getRole())) {
                if (userId.equals(currentUser.getUserId()) && !ROLE_ADMIN.equals(newRole)) {
                    throw new AppException("You cannot change your own role away from ADMIN.",
                            HttpStatus.FORBIDDEN);
                }
                String oldRole = user.getRole();
                try {
                    removeProfileRow(userId, oldRole);
                } catch (DataIntegrityViolationException e) {
                    throw new AppException(
                        "Cannot change this user's role: they have associated records under their " +
                        "current role (e.g. graded submissions or verified solutions) that must be " +
                        "reassigned first.", HttpStatus.CONFLICT);
                }
                user.setRole(newRole);
                user = userRepository.save(user);
                createProfileRow(user, newRole);
            }
        }

        user = userRepository.save(user);
        return UserResponse.from(user);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private String normalizeRole(String role) {
        String r = role == null ? "" : role.trim().toUpperCase();
        if (!VALID_ROLES.contains(r)) {
            throw new AppException("Role must be one of STUDENT, EDUCATOR, ADMIN", HttpStatus.BAD_REQUEST);
        }
        return r;
    }

    private void createProfileRow(User user, String role) {
        switch (role) {
            case "STUDENT" -> studentRepository.save(Student.builder().user(user).build());
            case "EDUCATOR" -> educatorRepository.save(Educator.builder().user(user).build());
            case "ADMIN" -> administratorRepository.save(Administrator.builder().user(user).build());
        }
    }

    /** Flushes immediately so any FK violation (e.g. submissions.educator_id, solutions.verified_by)
     *  surfaces here — inside the caller's try/catch — instead of escaping at commit time as a 500. */
    private void removeProfileRow(UUID userId, String role) {
        switch (role) {
            case "STUDENT" -> studentRepository.findByUserUserId(userId).ifPresent(s -> {
                studentRepository.delete(s);
                studentRepository.flush();
            });
            case "EDUCATOR" -> educatorRepository.findByUserUserId(userId).ifPresent(e -> {
                educatorRepository.delete(e);
                educatorRepository.flush();
            });
            case "ADMIN" -> administratorRepository.findByUserUserId(userId).ifPresent(a -> {
                administratorRepository.delete(a);
                administratorRepository.flush();
            });
        }
    }
}
