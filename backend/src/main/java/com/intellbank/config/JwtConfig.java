package com.intellbank.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * JWT configuration properties holder.
 * Actual JWT logic is in the JwtUtil class.
 */
@Configuration
public class JwtConfig {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration;

    public String getSecret() { return secret; }
    public long getExpiration() { return expiration; }
}
