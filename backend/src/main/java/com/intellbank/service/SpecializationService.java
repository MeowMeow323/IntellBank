package com.intellbank.service;

import com.intellbank.entity.Educator;
import com.intellbank.entity.Specialization;
import com.intellbank.entity.SpecializationId;
import com.intellbank.entity.Subject;
import com.intellbank.entity.User;
import com.intellbank.exception.AppException;
import com.intellbank.repository.EducatorRepository;
import com.intellbank.repository.SpecializationRepository;
import com.intellbank.repository.SubjectRepository;
import com.intellbank.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Specialization rules: an EDUCATOR may only handle subjects they are assigned to;
 * ADMINs bypass every check. Enforcement is STRICT — an educator with no
 * specializations can handle nothing.
 */
@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class SpecializationService {

    public static final String ROLE_ADMIN = "ADMIN";

    private final SpecializationRepository specializationRepository;
    private final EducatorRepository educatorRepository;
    private final UserRepository userRepository;
    private final SubjectRepository subjectRepository;

    // ── Lookups used by the feature gates ─────────────────────────────────────

    /** Subjects (entities) the educator is assigned to, resolved by login email. */
    public List<Subject> subjectsForEducator(String email) {
        Educator educator = resolveEducator(email);
        return specializationRepository.findByEducatorEducatorId(educator.getEducatorId())
                .stream().map(Specialization::getSubject).collect(Collectors.toList());
    }

    public Set<String> subjectNamesForEducator(String email) {
        return subjectsForEducator(email).stream().map(Subject::getName).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** ADMIN → true always; EDUCATOR → only if assigned to the (non-null) subject. */
    public boolean canHandleSubjectName(String email, String role, String subjectName) {
        if (ROLE_ADMIN.equals(role)) return true;
        return subjectName != null && !subjectName.isBlank()
                && subjectNamesForEducator(email).contains(subjectName);
    }

    /** Same as {@link #canHandleSubjectName} but throws 403 instead of returning false. */
    public void assertCanHandleSubjectName(String email, String role, String subjectName) {
        if (!canHandleSubjectName(email, role, subjectName)) {
            throw new AppException("You are not assigned to this subject.", HttpStatus.FORBIDDEN);
        }
    }

    // ── Admin management ──────────────────────────────────────────────────────

    public List<Specialization> getForEducator(UUID educatorId) {
        return specializationRepository.findByEducatorEducatorId(educatorId);
    }

    /** Replace an educator's entire specialization set with the given subject ids. */
    @Transactional
    public void setForEducator(UUID educatorId, List<UUID> subjectIds) {
        Educator educator = educatorRepository.findById(educatorId)
                .orElseThrow(() -> new AppException("Educator not found", HttpStatus.NOT_FOUND));

        // Clear existing, then re-insert — flush between so re-adding the same subject
        // doesn't collide on the composite primary key.
        List<Specialization> existing = specializationRepository.findByEducatorEducatorId(educatorId);
        specializationRepository.deleteAll(existing);
        specializationRepository.flush();

        if (subjectIds == null) return;
        for (UUID subjectId : new LinkedHashSet<>(subjectIds)) {
            Subject subject = subjectRepository.findById(subjectId)
                    .orElseThrow(() -> new AppException("Subject not found", HttpStatus.NOT_FOUND));
            specializationRepository.save(Specialization.builder()
                    .id(new SpecializationId(subjectId, educatorId))
                    .subject(subject)
                    .educator(educator)
                    .build());
        }
    }

    private Educator resolveEducator(String email) {
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
        return educatorRepository.findByUserUserId(user.getUserId())
                .orElseThrow(() -> new AppException("Educator profile not found", HttpStatus.FORBIDDEN));
    }
}
