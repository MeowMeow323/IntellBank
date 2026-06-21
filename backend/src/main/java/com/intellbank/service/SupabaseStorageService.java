package com.intellbank.service;

import com.intellbank.exception.AppException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

/**
 * SupabaseStorageService – uploads files directly to Supabase Storage via its
 * REST API using the service-role key. Mirrors the auth header shape already
 * proven working in the Python pipeline's delete_pdf_from_storage().
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SupabaseStorageService {

    @Value("${supabase.url}")
    private String supabaseUrl;

    @Value("${supabase.service-key}")
    private String serviceKey;

    @Value("${supabase.storage-bucket}")
    private String bucket;

    private final RestTemplate restTemplate;

    /**
     * Uploads a PDF to Supabase Storage under a generated path and returns
     * that relative path (NOT a full URL) — the AI service's build_url()
     * already turns a relative storage path into a public URL on its own,
     * so storing the path keeps this consistent with the existing convention.
     */
    public String uploadPdf(MultipartFile file) {
        if (supabaseUrl == null || supabaseUrl.isBlank() || serviceKey == null || serviceKey.isBlank()) {
            throw new AppException(
                    "Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }

        String path = "past-year-papers/" + UUID.randomUUID() + ".pdf";
        String url = supabaseUrl.replaceAll("/$", "") + "/storage/v1/object/" + bucket + "/" + path;

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new AppException("Failed to read uploaded file: " + e.getMessage(), HttpStatus.BAD_REQUEST);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + serviceKey);
        headers.set("apikey", serviceKey);
        headers.setContentType(MediaType.APPLICATION_PDF);

        try {
            restTemplate.exchange(url, HttpMethod.POST, new HttpEntity<>(bytes, headers), String.class);
        } catch (Exception e) {
            log.error("Supabase Storage upload failed: {}", e.getMessage());
            throw new AppException("Failed to upload PDF to storage: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return path;
    }

    /**
     * Deletes a previously-uploaded file from Supabase Storage. Mirrors the
     * Python pipeline's delete_pdf_from_storage() auth header shape. Skips
     * silently (no throw) if storagePath is empty/external — a missing
     * original file shouldn't block deleting the paper's DB rows.
     */
    public void deletePdf(String storagePath) {
        if (storagePath == null || storagePath.isBlank() || storagePath.startsWith("http")) {
            return;
        }
        if (supabaseUrl == null || supabaseUrl.isBlank() || serviceKey == null || serviceKey.isBlank()) {
            log.warn("Skipping Storage delete for {} — Supabase Storage not configured", storagePath);
            return;
        }

        String url = supabaseUrl.replaceAll("/$", "") + "/storage/v1/object/" + bucket + "/" + storagePath;
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + serviceKey);
        headers.set("apikey", serviceKey);

        try {
            restTemplate.exchange(url, HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
        } catch (Exception e) {
            log.warn("Supabase Storage delete failed for {}: {}", storagePath, e.getMessage());
        }
    }

    /**
     * Builds a public, directly viewable URL for a path previously returned
     * by uploadPdf() — matches the exact convention the AI service's
     * ocr_service.build_url() already uses to read these files back.
     */
    public String getPublicUrl(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            return null;
        }
        if (storagePath.startsWith("http")) {
            return storagePath;
        }
        return supabaseUrl.replaceAll("/$", "") + "/storage/v1/object/public/" + bucket + "/" + storagePath;
    }
}
