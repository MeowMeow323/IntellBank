package com.intellbank.dto;

import lombok.Data;

@Data
public class VerificationEditRequest {
    private String questionText;
    private String solutionText;
}
