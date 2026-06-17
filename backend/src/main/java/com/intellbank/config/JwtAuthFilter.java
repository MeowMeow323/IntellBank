package com.intellbank.config;

import com.intellbank.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);
        
        // ── ADD THIS DEBUG BLOCK ──────────────────────────────────────
        String email;
        try {
            email = jwtUtil.extractEmail(token);
            System.out.println("✅ JWT extracted email: " + email);
        } catch (Exception e) {
            System.out.println("❌ JWT extractEmail FAILED: " + e.getClass().getSimpleName() + " – " + e.getMessage());
            filterChain.doFilter(request, response);
            return;
        }
        // ─────────────────────────────────────────────────────────────

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            userRepository.findByEmailIgnoreCase(email).ifPresent(user -> {
                boolean valid = jwtUtil.validateToken(token, email);
                System.out.println("🔑 validateToken: " + valid + " | role: " + user.getRole());
                if (valid) {
                    String role = "ROLE_" + user.getRole();
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(
                                    user, null, List.of(new SimpleGrantedAuthority(role)));
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            });
        }

        filterChain.doFilter(request, response);
    }
}
