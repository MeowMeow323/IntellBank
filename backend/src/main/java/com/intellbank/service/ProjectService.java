package com.intellbank.service;

import com.intellbank.entity.*;
import com.intellbank.exception.AppException;
import com.intellbank.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@SuppressWarnings("null")
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;

    public List<Project> getProjectsForStudent(String email) {
        Student student = getStudent(email);
        return projectRepository.findByStudentStudentId(student.getStudentId());
    }

    @Transactional
    public Project create(String projectName, String email) {
        Student student = getStudent(email);
        Project project = Project.builder()
                .student(student)
                .projectName(projectName)
                .build();
        return projectRepository.save(project);
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
        Project project = getById(projectId);
        verifyOwner(project, email);
        projectRepository.delete(project);
    }

    private Student getStudent(String email) {
        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException("User not found", HttpStatus.NOT_FOUND));
        return studentRepository.findByUserUserId(user.getUserId())
                .orElseThrow(() -> new AppException("Student profile not found", HttpStatus.NOT_FOUND));
    }

    private void verifyOwner(Project project, String email) {
        if (!project.getStudent().getUser().getEmail().equals(email)) {
            throw new AppException("Access denied", HttpStatus.FORBIDDEN);
        }
    }
}
