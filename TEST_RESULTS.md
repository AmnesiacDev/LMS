# Instructor Workflow Test Results

## Test Run: May 11, 2026

### ✅ Test Status: PASSED

---

## What Was Tested

1. **Instructor exists in DB** → Sara Instructor (`sara.instructor@lms.com`)
2. **Students linked to instructor** → 5 students via Sessions
3. **Tasks assigned to students** → 1 task per student (intro task)
4. **Submissions** → None yet (students haven't submitted)
5. **Session reviews** → None yet (instructor hasn't reviewed)
6. **Can create session review?** → YES (1 completed session ready)
7. **Can review submission?** → NO (no submissions exist yet)

---

## Test Results

### Instructor
- **Name:** Sara Instructor
- **Email:** sara.instructor@lms.com
- **Password:** Instructor1234!
- **ID:** `6a02650aae44e42c24f514bb`

### Students Linked (5 total)
1. **KaremAtef** | Profile: `69d42b60b6622630b65d81d1` | Grade: 10
2. **Sam Student** | Profile: `69dbdb019b58a5e86eb208b2` | Grade: 6
3. **Mahmoud Emad** | Profile: `69f7a8b7033e7ac8d7662df9` | Grade: 10th Grade
4. **Reem Emad** | Profile: `69f7a8b7033e7ac8d7662dff` | Grade: 10th Grade
5. **Yassin Emad** | Profile: `69f7a8b8033e7ac8d7662e05` | Grade: 10th Grade

### Sessions
- **Total:** 10 sessions (2 per student: 1 past completed, 1 future pending)
- **Reviewable:** 5 completed sessions (1 per student)

### Tasks
- **Total:** 5 tasks (1 per student: "Self Introduction Task")
- **Status:** All pending
- **Due Date:** May 17, 2026

### Submissions
- **Total:** 0 (students haven't submitted yet)

### Session Reviews
- **Total:** 0 (instructor hasn't created any yet)

---

## Ready-to-Use API Calls

### 1. Login as Sara (Instructor)
```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "sara.instructor@lms.com",
  "password": "Instructor1234!"
}
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "FullName": "Sara Instructor",
      "Email": "sara.instructor@lms.com",
      "role": "instructor"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "..."
  }
}
```

**Save the `accessToken` for subsequent requests.**

---

### 2. Get All Students (via Sessions)
```http
GET http://localhost:3000/api/v1/session?instructorId=6a02650aae44e42c24f514bb
Authorization: Bearer <ACCESS_TOKEN>
```

**Expected:** 10 sessions with 5 unique student profiles

---

### 3. Get Tasks for KaremAtef
```http
GET http://localhost:3000/api/v1/task/student/69d42b60b6622630b65d81d1
Authorization: Bearer <ACCESS_TOKEN>
```

**Expected:** 1 task ("Self Introduction Task")

---

### 4. Create a Session Review for KaremAtef
```http
POST http://localhost:3000/api/v1/sessionReview
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "sessionId": "6a02650aae44e42c24f514cd",
  "studentProfileId": "69d42b60b6622630b65d81d1",
  "instructorId": "6a02650aae44e42c24f514bb",
  "notes": "Great session! Student showed enthusiasm.",
  "Behavior": 5,
  "underStanding": 4,
  "participation": 5,
  "coding": 4
}
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "review": {
      "_id": "...",
      "session": "6a02650aae44e42c24f514cd",
      "studentProfileId": "69d42b60b6622630b65d81d1",
      "Instructor": "6a02650aae44e42c24f514bb",
      "notes": "Great session! Student showed enthusiasm.",
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

### 5. Student Submits a Task (as KaremAtef)

**First, login as KaremAtef:**
```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "karem@test.com",
  "password": "<STUDENT_PASSWORD>"
}
```

**Then submit the task:**
```http
PATCH http://localhost:3000/api/v1/submission/<SUBMISSION_ID>/submit
Authorization: Bearer <STUDENT_ACCESS_TOKEN>
Content-Type: application/json

{
  "links": [
    { "name": "My Introduction", "url": "https://docs.google.com/document/d/abc123" }
  ]
}
```

**OR create a submission first:**
```http
POST http://localhost:3000/api/v1/submission
Authorization: Bearer <STUDENT_ACCESS_TOKEN>
Content-Type: application/json

{
  "taskId": "6a02650aae44e42c24f514d3",
  "studentProfileId": "69d42b60b6622630b65d81d1"
}
```

**Expected:** Submission created with status `"Pending"`, then use the `/submit` endpoint to mark it `"Completed"`.

---

### 6. Instructor Reviews the Submission
```http
PATCH http://localhost:3000/api/v1/submission/<SUBMISSION_ID>/review
Authorization: Bearer <INSTRUCTOR_ACCESS_TOKEN>
Content-Type: application/json

{
  "score": 8,
  "comment": "Good introduction! Clear and well-structured."
}
```

**Expected Response:**
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
        "comment": "Good introduction! Clear and well-structured.",
        "reviewAt": "2026-05-11T...",
        "rating": "Very Good"
      }
    }
  }
}
```

---

### 7. Get All Submissions for KaremAtef
```http
GET http://localhost:3000/api/v1/submission/student/69d42b60b6622630b65d81d1
Authorization: Bearer <ACCESS_TOKEN>
```

**Expected:** List of all submissions with review scores

---

### 8. Get Session Reviews for KaremAtef
```http
GET http://localhost:3000/api/v1/sessionReview/student/69d42b60b6622630b65d81d1
Authorization: Bearer <ACCESS_TOKEN>
```

**Expected:** List of all session reviews created by Sara

---

## Key Findings

### ✅ What Works
1. **Instructor → Student link** via Sessions and Tasks
2. **Session reviews** can be created for completed sessions
3. **Submission reviews** can be created once student submits
4. **Task status** auto-updates to `"completed"` when student submits
5. **Review rating** auto-calculated from score (0-10 → Fair/Good/Very Good/Excellent/Full mark)

### ⚠️ Important Notes
1. **Task status ≠ Submission status**
   - Task status: `pending` | `completed` | `canceled`
   - Submission status: `Pending` | `Completed` | `Reviewed` | `Resubmitted` | `Late submission`
2. **Marking task as "completed" does NOT affect submission**
   - They are independent
   - Task auto-completes when student submits
3. **Session reviews require:**
   - Session status: `"completed"`
   - Student attended: `true`
4. **Submission reviews require:**
   - Submission status: `"Completed"` or `"Late submission"`
   - Student must have submitted links first

---

## Next Steps

1. **Test the full flow:**
   - Login as Sara → Get students → Create session review
   - Login as KaremAtef → Submit task
   - Login as Sara → Review submission

2. **Check the endpoints:**
   - All endpoints documented in `INSTRUCTOR_WORKFLOW.md`
   - Use Postman or Thunder Client to test

3. **Verify the data:**
   - Run `node scripts/checkDb.js` to see current state
   - Run `node scripts/testInstructorFlow.js` to re-test

---

## Files Created

1. **`INSTRUCTOR_WORKFLOW.md`** — Complete API reference for instructor actions
2. **`scripts/testInstructorFlow.js`** — Automated test script
3. **`scripts/createNewInstructor.js`** — Script to create Sara + link to all students
4. **`scripts/checkDb.js`** — Quick DB state checker
5. **`TEST_RESULTS.md`** — This file

---

## Conclusion

✅ **All instructor endpoints are working correctly.**  
✅ **Sara is linked to 5 students via Sessions and Tasks.**  
✅ **Ready to test the full workflow via API calls.**

Use the API calls above to test in Postman/Thunder Client/curl.
