package com.intellbank.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends transactional emails (currently just password-reset).
 *
 * If SMTP credentials are not configured (spring.mail.username blank) the email
 * is skipped and the reset link is logged instead, so password reset still works
 * end-to-end during local development without a real mailbox.
 */
@Slf4j
@Service
public class EmailService {

    private final JavaMailSender mailSender;
    private final String from;
    private final boolean mailConfigured;

    public EmailService(JavaMailSender mailSender,
                        @Value("${app.mail.from}") String from,
                        @Value("${spring.mail.username:}") String mailUsername) {
        this.mailSender = mailSender;
        this.from = from;
        this.mailConfigured = mailUsername != null && !mailUsername.isBlank();
    }

    public void sendPasswordResetEmail(String to, String resetUrl) {
        // Always log the link so dev can use it even when SMTP isn't set up.
        log.info("Password reset link for {}: {}", to, resetUrl);

        if (!mailConfigured) {
            log.warn("MAIL_USERNAME not configured — skipping real email send for {}", to);
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject("Reset your IntellBank password");
            message.setText(
                "We received a request to reset your IntellBank password.\n\n" +
                "Click the link below to set a new password. This link expires shortly " +
                "and can only be used once:\n\n" +
                resetUrl + "\n\n" +
                "If you didn't request this, you can safely ignore this email."
            );
            mailSender.send(message);
            log.info("Password reset email sent to {}", to);
        } catch (Exception e) {
            // Never fail the request because email delivery failed — the user
            // gets a generic success message regardless (see AuthService).
            log.error("Failed to send password reset email to {}: {}", to, e.getMessage());
        }
    }
}
