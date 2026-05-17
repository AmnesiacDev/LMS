# Instructor Workflow — Use Case & API Reference

## Overview

This document explains how an **instructor** interacts with the LMS system to:
1. View all students assigned to them
2. Create session reviews for students
3. View tasks assigned to students
4. Review student submissions and provide feedback

---

## 1. Get All Students Assigned to Instructor

**Endpoint:** `GET /api/v1/task/student/:studentProfileId`  
**Alternative:** Query sessions or tasks by `instructorId`

### How it works:
- The instructor is linked to students through **Sessions** and **Tasks** (both have `instructorId` field)
- There's no direct "instructor → student" relationship in `StudentProfile`
- To get all students, query **Sessions** or **Tasks** where `instructorId = instructor._id`

### API Call:
```http
GET /api/v1/session?instructorId=<INSTRUCTOR_ID>
Authorization: Bearer <ACCESS_TOKEN>
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "sessions": [
      {
        "_id": "...",
        "title": "Mahmoud - Intro Session",
        "studentProfileId": {
          "_id": "...",
          "user": {
            "FullName": "Mahmoud Emad",
            "Email": "mahmoud@test.com"
          },
          "grade": "Grade 8"
        },
        "instructorId": "...",
        "date": "2026-05-08T...",
        "status": "completed"
      }
      // ... more sessions
    ]
  }
}
```

### Extract unique students:
```javascript
const uniqueStudents = [...new Map(
  sessions.map(s => [s.studentProfileId._id, s.studentProfileId])
).values()];
```

---

## 2. Create a Session Review

**Endpoint:** `POST /api/v1/sessionReview`  
**Auth:** Instructor only

### Request Body:
```json
{
  "sessionId": "SESSION_ID",
  "studentProfileId": "STUDENT_PROFILE_ID",
  "instructorId": "INSTRUCTOR_ID",
  "notes": "Great progress in JavaScript!",
  "Behavior": 5,
  "underStanding": 4,
  "participation": 5,
  "coding": 4
}
```

### Rules:
- Session must exist and belong to the student
- Student must have attended (`StudentAttended: true`)
- Scores are 1–5
- `overAllRating` is auto-calculated as the average

### Response:
```json
{
  "status": "success",
  "data": {
    "review": {
      "_id": "...",
      "session": "...",
      "studentProfileId": "...",
      "Instructor": "...",
      "notes": "Great progress in JavaScript!",
      "Behavior": 5,
      "underStanding": 4,
      "participation": 5,
      "coding": 4,
      "overAllRating": 4.5,
      "createdAt": "2026-05-11T..."
    }
  }
}
```

---

## 3. View Tasks Assigned to a Student

**Endpoint:** `GET /api/v1/task/student/:studentProfileId`  
**Auth:** Instructor or Admin

### API Call:
```http
GET /api/v1/task/student/6645a1b2c3d4e5f6a7b8c9d0
Authorization: Bearer <ACCESS_TOKEN>
```

### Response:
```json
{
  "status": "success",
  "data": {
    "results": 4,
    "tasks": [
      {
        "_id": "...",
        "title": "Mahmoud - Build a Calculator",
        "description": "Create a simple calculator...",
        "dueDate": "2026-05-01T...",
        "status": "completed",
        "sessionId": { "title": "Mahmoud - JavaScript Basics" },
        "studentProfileId": { "user": { "FullName": "Mahmoud Emad" } },
        "instructorId": { "FullName": "Sara Instructor" }
      }
      // ... more tasks
    ]
  }
}
```

---

## 4. View Submissions for a Task

**Endpoint:** `GET /api/v1/submission/task/:taskId`  
**Auth:** Any authenticated user

### API Call:
```http
GET /api/v1/submission/task/6645a1b2c3d4e5f6a7b8c9d0
Authorization: Bearer <ACCESS_TOKEN>
```

### Response:
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "submissions": [
      {
        "_id": "...",
        "task": {
          "_id": "...",
          "title": "Build a Calculator",
          "dueDate": "2026-05-01T..."
        },
        "studentProfileId": {
          "user": { "FullName": "Mahmoud Emad" },
          "grade": "Grade 8"
        },
        "SubmissionDate": "2026-04-30T...",
        "status": "Completed",
        "Task_links": [
          { "name": "Calculator on CodePen", "url": "https://codepen.io/..." },
          { "name": "GitHub Repo", "url": "https://github.com/..." }
        ],
        "note": "Great job!",
        "review": {
          "score": null,
          "comment": null,
          "reviewAt": null,
          "rating": null
        }
      }
    ]
  }
}
```

---

## 5. Review a Submission (Instructor Action)

**Endpoint:** `PATCH /api/v1/submission/:submissionId/review`  
**Auth:** Instructor or Admin only

### Request Body:
```json
{
  "score": 8,
  "comment": "Good work! Consider adding keyboard support."
}
```

### Rules:
- `score` must be 0–10
- `rating` is auto-calculated:
  - <5 → Fair
  - <7 → Good
  - <9 → Very Good
  - <10 → Excellent
  - 10 → Full mark
- `status` is automatically set to `"Reviewed"`
- `reviewAt` is set to current timestamp

### Response:
```json
{
  "status": "success",
  "message": "Submission reviewed successfully!",
  "data": {
    "submission": {
      "_id": "...",
      "status": "Reviewed",
      "review": {
        "score": 8,
        "comment": "Good work! Consider adding keyboard support.",
        "reviewAt": "2026-05-11T...",
        "rating": "Very Good"
      }
    }
  }
}
```

---

## 6. What Happens When Instructor Marks Task as Complete?

**Endpoint:** `PATCH /api/v1/task/:taskId/status`  
**Auth:** Instructor or Admin

### Request Body:
```json
{
  "status": "completed"
}
```

### What happens:
1. Task status changes to `"completed"`
2. **Nothing happens to the submission automatically**
3. The submission remains in its current state (`Pending`, `Completed`, `Reviewed`, etc.)

### Important Notes:
- **Task status** and **Submission status** are independent
- Task status tracks whether the task is active/done/canceled
- Submission status tracks the student's submission workflow:
  - `Pending` → Student hasn't submitted yet
  - `Completed` → Student submitted (auto-set when they submit links)
  - `Reviewed` → Instructor reviewed and scored it
  - `Resubmitted` → Instructor asked for changes
  - `Late submission` → Submitted after due date

### Typical Workflow:
1. Instructor creates a Task → status: `"pending"`
2. Student submits → Submission created with status: `"Completed"`, Task auto-updated to `"completed"`
3. Instructor reviews submission → Submission status: `"Reviewed"`, score/comment added
4. (Optional) Instructor manually marks Task as `"completed"` if needed

---

## 7. Get All Submissions for a Student

**Endpoint:** `GET /api/v1/submission/student/:studentProfileId`  
**Auth:** Any authenticated user

### API Call:
```http
GET /api/v1/submission/student/6645a1b2c3d4e5f6a7b8c9d0
Authorization: Bearer <ACCESS_TOKEN>
```

### Response:
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "submissions": [
      {
        "_id": "...",
        "task": { "title": "Build a Calculator", "dueDate": "..." },
        "status": "Reviewed",
        "review": { "score": 8, "rating": "Very Good" }
      },
      {
        "_id": "...",
        "task": { "title": "Arabic Essay", "dueDate": "..." },
        "status": "Completed",
        "review": { "score": null }
      }
    ]
  }
}
```

---

## 8. Get Session Reviews for a Student

**Endpoint:** `GET /api/v1/sessionReview/student/:studentProfileId`  
**Auth:** Instructor or Admin

### API Call:
```http
GET /api/v1/sessionReview/student/6645a1b2c3d4e5f6a7b8c9d0
Authorization: Bearer <ACCESS_TOKEN>
```

### Response:
```json
{
  "status": "success",
  "data": {
    "results": 2,
    "docs": [
      {
        "_id": "...",
        "session": { "title": "JavaScript Basics", "date": "..." },
        "Behavior": 5,
        "underStanding": 4,
        "participation": 5,
        "coding": 4,
        "overAllRating": 4.5,
        "notes": "Great progress!"
      }
    ]
  }
}
```

---

## Summary

| Action | Endpoint | Method | Auth |
|--------|----------|--------|------|
| Get students (via sessions) | `/api/v1/session?instructorId=<ID>` | GET | Instructor |
| Get tasks for a student | `/api/v1/task/student/:studentProfileId` | GET | Instructor/Admin |
| Get submissions for a task | `/api/v1/submission/task/:taskId` | GET | Any |
| Get submissions for a student | `/api/v1/submission/student/:studentProfileId` | GET | Any |
| Create session review | `/api/v1/sessionReview` | POST | Instructor/Admin |
| Review a submission | `/api/v1/submission/:id/review` | PATCH | Instructor/Admin |
| Update task status | `/api/v1/task/:id/status` | PATCH | Instructor/Admin |
| Get session reviews for student | `/api/v1/sessionReview/student/:id` | GET | Instructor/Admin |

---

## Key Relationships

```
Instructor
    ↓ (via instructorId)
Sessions ← studentProfileId → StudentProfile → User (student)
    ↓
Tasks ← studentProfileId → StudentProfile
    ↓
Submissions ← studentProfileId → StudentProfile
    ↓
Reviews (score, comment, rating)
```

**Important:** Submissions are linked to Tasks, not directly to Sessions. When a student submits a task, the Task status auto-updates to `"completed"`.
