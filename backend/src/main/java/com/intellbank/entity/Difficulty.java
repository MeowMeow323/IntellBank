package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "difficulties")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Difficulty {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "difficulty_id")
    private UUID difficultyId;

    /** "Easy" | "Medium" | "Hard" */
    @Column(nullable = false, length = 100)
    private String name;
}
