package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import com.intellbank.config.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Map;

@SuppressWarnings("null")
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final StudentRepository studentRepository;
    private final EducatorRepository educatorRepository;
    private final AdministratorRepository administratorRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.reset-token-expiry-minutes}")
    private long resetTokenExpiryMinutes;

    /**
     * Register a new user.
     *
     * Rules applied:
     * - Email is trimmed and lowercased before saving.
     * - Password must satisfy the password policy (see validatePassword) and is
     *   encoded with BCryptPasswordEncoder before saving.
     * - Duplicate email check is case-insensitive.
     * - Public self-registration always creates a STUDENT. Educator/Admin roles
     *   are assigned by an administrator (or seeded directly in Supabase), never
     *   chosen by the registrant.
     */
    @Transactional
    public Map<String, Object> register(Map<String, Object> data) {
        String rawEmail  = (String) data.get("email");
        String password  = (String) data.get("password");
        String fullName  = (String) data.get("fullName");

        // Normalise email: trim whitespace and convert to lowercase
        String email = rawEmail == null ? null : rawEmail.trim().toLowerCase();

        if (email == null || email.isBlank()) {
            throw new AppException("Email is required", HttpStatus.BAD_REQUEST);
        }
        validatePassword(password);

        // Case-insensitive duplicate check
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new AppException("That email is already registered", HttpStatus.CONFLICT);
        }

        // Self-registration is always a STUDENT — role is not client-controlled.
        String role = "STUDENT";

        // Encode the password with BCrypt before saving – never store raw passwords
        User user = User.builder()
                .email(email)
                .fullName(fullName != null ? fullName.trim() : null)
                .passwordHash(passwordEncoder.encode(password))
                .role(role)
                .build();
        user = userRepository.save(user);

        // Create the matching profile row
        studentRepository.save(Student.builder().user(user).build());

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

    /**
     * Request a password reset.
     *
     * Always returns the same generic response whether or not the email exists,
     * so attackers can't use this endpoint to enumerate registered accounts.
     * A single-use, time-limited token is generated only for real accounts; the
     * raw token is emailed and only its SHA-256 hash is stored.
     */
    @Transactional
    public Map<String, Object> forgotPassword(Map<String, Object> data) {
        String rawEmail = (String) data.get("email");
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();

        userRepository.findByEmailIgnoreCase(email).ifPresent(user -> {
            // Invalidate any previously issued tokens for this account
            passwordResetTokenRepository.deleteByEmail(email);

            String rawToken = generateRawToken();
            PasswordResetToken prt = PasswordResetToken.builder()
                    .email(email)
                    .tokenHash(sha256Hex(rawToken))
                    .expiresAt(OffsetDateTime.now().plusMinutes(resetTokenExpiryMinutes))
                    .build();
            passwordResetTokenRepository.save(prt);

            String resetUrl = frontendUrl + "/reset-password?token=" + rawToken;
            emailService.sendPasswordResetEmail(email, resetUrl);
        });

        return Map.of("message",
                "If an account exists for that email, a password reset link has been sent.");
    }

    /**
     * Complete a password reset using the token from the email link.
     */
    @Transactional
    public Map<String, Object> resetPassword(Map<String, Object> data) {
        String token = (String) data.get("token");
        String newPassword = (String) data.get("password");

        if (token == null || token.isBlank()) {
            throw new AppException("Reset token is required", HttpStatus.BAD_REQUEST);
        }
        validatePassword(newPassword);

        PasswordResetToken prt = passwordResetTokenRepository.findByTokenHash(sha256Hex(token))
                .orElseThrow(() -> new AppException(
                        "This reset link is invalid or has already been used.", HttpStatus.BAD_REQUEST));

        if (Boolean.TRUE.equals(prt.getUsed())) {
            throw new AppException("This reset link has already been used.", HttpStatus.BAD_REQUEST);
        }
        if (prt.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new AppException("This reset link has expired. Please request a new one.", HttpStatus.BAD_REQUEST);
        }

        User user = userRepository.findByEmailIgnoreCase(prt.getEmail())
                .orElseThrow(() -> new AppException("Account no longer exists", HttpStatus.NOT_FOUND));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        prt.setUsed(true);
        passwordResetTokenRepository.save(prt);

        return Map.of("message", "Your password has been reset. You can now sign in.");
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

    /** Password policy: at least 8 characters, containing a letter and a number. */
    private void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new AppException("Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
        }
        boolean hasLetter = password.chars().anyMatch(Character::isLetter);
        boolean hasDigit  = password.chars().anyMatch(Character::isDigit);
        if (!hasLetter || !hasDigit) {
            throw new AppException("Password must contain at least one letter and one number",
                    HttpStatus.BAD_REQUEST);
        }
    }

    private static String generateRawToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
