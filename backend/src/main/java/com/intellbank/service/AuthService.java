package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import com.intellbank.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final StudentRepository studentRepository;
    private final EducatorRepository educatorRepository;
    private final AdministratorRepository administratorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    /**
     * Register a new user.
     *
     * Rules applied:
     * - Email is trimmed and lowercased before saving.
     * - Password is encoded with BCryptPasswordEncoder before saving.
     * - Duplicate email check is case-insensitive.
     * - A matching profile row (Student / Educator / Admin) is created automatically.
     */
    @Transactional
    public Map<String, Object> register(Map<String, Object> data) {
        String rawEmail  = (String) data.get("email");
        String password  = (String) data.get("password");
        String fullName  = (String) data.get("fullName");
        String role      = ((String) data.getOrDefault("role", "STUDENT")).toUpperCase().trim();

        // Normalise email: trim whitespace and convert to lowercase
        String email = rawEmail == null ? null : rawEmail.trim().toLowerCase();

        if (email == null || email.isBlank()) {
            throw new AppException("Email is required", HttpStatus.BAD_REQUEST);
        }
        if (password == null || password.isBlank()) {
            throw new AppException("Password is required", HttpStatus.BAD_REQUEST);
        }

        // Case-insensitive duplicate check
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new AppException("Email already registered", HttpStatus.CONFLICT);
        }

        // Encode the password with BCrypt before saving – never store raw passwords
        User user = User.builder()
                .email(email)
                .fullName(fullName != null ? fullName.trim() : null)
                .passwordHash(passwordEncoder.encode(password))
                .role(role)
                .build();
        user = userRepository.save(user);

        // Create the matching profile row
        switch (role) {
            case "EDUCATOR" -> educatorRepository.save(Educator.builder().user(user).build());
            case "ADMIN"    -> administratorRepository.save(Administrator.builder().user(user).build());
            default         -> studentRepository.save(Student.builder().user(user).build());
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getRole());
        return buildResponse(token, user);
    }

    /**
     * Login a user.
     *
     * Rules applied:
     * - Email lookup is case-insensitive.
     * - Password is compared using BCrypt matches() — never direct string comparison.
     * - Returns 401 for email-not-found or password mismatch (same message to avoid user enumeration).
     * - Returns 403 if the account is deactivated.
     */
    public Map<String, Object> login(Map<String, Object> data) {
        String rawEmail = (String) data.get("email");
        String password = (String) data.get("password");

        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();

        // Case-insensitive lookup
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("Invalid email or password", HttpStatus.UNAUTHORIZED));

        // BCrypt match: compares raw password against stored hash — never raw vs raw
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new AppException("Invalid email or password", HttpStatus.UNAUTHORIZED);
        }

        // Reject deactivated accounts
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new AppException("Account is deactivated. Please contact an administrator.", HttpStatus.FORBIDDEN);
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getRole());
        return buildResponse(token, user);
    }

    public User getMe(String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
    }

    private Map<String, Object> buildResponse(String token, User user) {
        return Map.of(
            "token",    token,
            "userId",   user.getUserId(),
            "email",    user.getEmail(),
            "fullName", user.getFullName() != null ? user.getFullName() : "",
            "role",     user.getRole()
        );
    }
}
