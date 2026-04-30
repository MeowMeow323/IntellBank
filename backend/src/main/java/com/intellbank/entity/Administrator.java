package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "administrators")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Administrator {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "administrator_id")
    private UUID administratorId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
