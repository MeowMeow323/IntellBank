package com.intellbank.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "educators")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Educator {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "educator_id")
    private UUID educatorId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
