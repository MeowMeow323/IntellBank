package com.intellbank.dto;

import lombok.Data;
import java.util.Map;
import java.util.UUID;

@Data
public class ExamSubmitRequest {
    // Map of question ID → student answer text
    private Map<UUID, String> answers;
}
