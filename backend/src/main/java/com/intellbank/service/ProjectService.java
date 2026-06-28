package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final DocumentRepository documentRepository;
    private final SubmissionRepository submissionRepository;
    private final DocumentQuestionRepository documentQuestionRepository;

    public List<Project> getProjectsForStudent(String email) {
        log.info("Getting projects for student with email: {}", email);
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));

        // Educators / admins have no Student profile — they simply have no projects,
        // so return an empty list instead of 404ing the shared dashboard fetch.
        return studentRepository.findByUserUserId(user.getUserId())
                .map(student -> {
                    List<Project> projects = projectRepository.findByStudentStudentId(student.getStudentId());
                    log.info("Found {} projects for student {}", projects.size(), student.getStudentId());
                    return projects;
                })
                .orElseGet(() -> {
                    log.info("No student profile for {} — returning no projects", email);
                    return List.of();
                });
    }

    @Transactional
    public Project create(String projectName, String email) {
        log.info("Creating project '{}' for user: {}", projectName, email);
        Student student = getStudent(email);
        log.info("Found student: {}", student.getStudentId());
        Project project = Project.builder()
                .student(student)
                .projectName(projectName)
                .build();
        Project saved = projectRepository.save(project);
        log.info("Project created with ID: {}", saved.getProjectId());
        return saved;
    }

    public Project getById(UUID projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new AppException("Project not found", HttpStatus.NOT_FOUND));
    }

    @Transactional
    public Project update(UUID projectId, String projectName, String email) {
        Project project = getById(projectId);
        verifyOwner(project, email);
        project.setProjectName(projectName);
        return projectRepository.save(project);
    }

    @Transactional
    public void delete(UUID projectId, String email) {
        log.info("Deleting project with ID: {} for user: {}", projectId, email);
        Project project = getById(projectId);
        verifyOwner(project, email);

        // Documents cascade-delete with the project, but their grandchildren —
        // submissions and document_questions — have FK columns with no cascade, so the
        // DB rejects the document delete (this is what was throwing the 500). Clear those
        // child rows for every document first, then let the project cascade remove the
        // documents themselves.
        for (Document doc : documentRepository.findByProjectProjectId(projectId)) {
            UUID documentId = doc.getDocumentId();
            submissionRepository.deleteByDocumentDocumentId(documentId);
            documentQuestionRepository.deleteByDocumentDocumentId(documentId);
        }

        projectRepository.delete(project);
        log.info("Project deleted: {}", projectId);
    }

    private Student getStudent(String email) {
        log.info("Looking up user by email: {}", email);
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
        log.info("Found user: {} (ID: {})", email, user.getUserId());
        
        log.info("Looking up student for user ID: {}", user.getUserId());
        Student student = studentRepository.findByUserUserId(user.getUserId())
                .orElseThrow(() -> new AppException("Student profile not found", HttpStatus.NOT_FOUND));
        log.info("Found student: {}", student.getStudentId());
        return student;
    }

    private void verifyOwner(Project project, String email) {
        if (!project.getStudent().getUser().getEmail().equals(email)) {
            throw new AppException("Access denied", HttpStatus.FORBIDDEN);
        }
    }
}
