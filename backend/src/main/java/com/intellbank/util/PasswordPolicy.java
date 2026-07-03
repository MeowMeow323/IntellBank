package com.intellbank.util;

import com.intellbank.exception.AppException;
import org.springframework.http.HttpStatus;

/** Password policy: at least 8 characters, containing a letter and a number. */
public final class PasswordPolicy {

    private PasswordPolicy() {}

    public static void validate(String password) {
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
}
