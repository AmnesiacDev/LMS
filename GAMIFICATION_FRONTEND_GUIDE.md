# 🏆 Gamification & Leaderboard: Frontend Integration Guide

This guide details the newly added gamification, leaderboard, and challenge features, designed to help the **frontend agent** build the UI screens, manage state, and listen to real-time events.

---

## 🧭 Architecture & Integration Points

All logic is fully implemented on the backend. The frontend needs to:
1.  **Retrieve profile data**: Fetch student level, XP progress, earned badges, and daily streak info.
2.  **Display leaderboards**: Show paginated weekly, monthly, and all-time student rankings.
3.  **Solve challenges/puzzles**: Present problems, let students fetch hints, submit code links, or answer quiz questions.
4.  **Listen to Socket.io events**: Receive real-time alerts when a student gains XP, levels up, or unlocks a badge.

---

## 🔌 Socket.io Real-Time Events

The backend emits targeted socket events to individual users via the established `SocketManager` when they earn rewards. You should register listeners for these events on the client:

### 1. XP Earned (`xp:earned`)
Emitted whenever a student receives XP (from task submission, attendance, quiz completion, etc.).
*   **Event Name**: `xp:earned`
*   **Payload**:
    ```json
    {
      "amount": 20,
      "reason": "task_submit",
      "totalXP": 240,
      "level": 3
    }
    ```

### 2. Level Up (`level:up`)
Emitted when a student's XP pushes them past a level boundary (every 100 XP is 1 level).
*   **Event Name**: `level:up`
*   **Payload**:
    ```json
    {
      "newLevel": 4,
      "totalXP": 300
    }
    ```
    *Note: A system notification is also automatically created and sent to the student.*

### 3. Badge Unlocked (`badge:unlocked`)
Emitted in real-time when a student completes conditions for a new badge.
*   **Event Name**: `badge:unlocked`
*   **Payload**:
    ```json
    {
      "name": "First Blood",
      "icon": "🎯",
      "rarity": "common",
      "xpReward": 25
    }
    ```

---

## 📡 REST API Endpoints

All endpoints require standard authorization (JWT in cookies/headers).

### 1. Gamification Core Engine

#### 🟢 Get My Gamification Profile
Fetch the logged-in student's (or parent's children's) stats, level, and XP.
*   **Route**: `GET /api/v1/gamification/me`
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "data": {
        "xp": 140,
        "level": 2,
        "lifetimeXP": 140,
        "currentStreak": 3,
        "longestStreak": 7,
        "lastActivityDate": "2026-06-10T00:00:00.000Z",
        "badgeCount": 1,
        "stats": {
          "tasksSubmitted": 4,
          "tasksOnTime": 3,
          "perfectScores": 1,
          "sessionsAttended": 5,
          "challengesSolved": 0,
          "puzzlesSolved": 0,
          "examsAbovePassing": 1
        }
      }
    }
    ```

#### 🟢 Get Student Profile (Instructor / Admin Only)
Allow instructors to look up gamification statistics for any student by their student profile ID.
*   **Route**: `GET /api/v1/gamification/:profileId`

#### 🟢 Get My XP History (Activity Feed)
Paginated list of historical XP grants. Good for rendering a "recent activity" list.
*   **Route**: `GET /api/v1/gamification/me/history?page=1&limit=10`
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "results": 2,
      "page": 1,
      "totalPages": 1,
      "data": [
        {
          "amount": 50,
          "reason": "perfect_score",
          "awardedAt": "2026-06-09T18:00:00.000Z",
          "_id": "60c72b2f9b1d8b2bad9452b1"
        },
        {
          "amount": 20,
          "reason": "task_submit",
          "awardedAt": "2026-06-09T17:30:00.000Z",
          "_id": "60c72b2f9b1d8b2bad9452b2"
        }
      ]
    }
    ```

#### 🟢 Get My Badges
List all badges earned by the student.
*   **Route**: `GET /api/v1/gamification/me/badges`
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "data": [
        {
          "_id": "60c72b2f9b1d8b2bad9452c0",
          "unlockedAt": "2026-06-09T18:00:00.000Z",
          "badge": {
            "name": "First Blood",
            "description": "Submit your first task",
            "icon": "🎯",
            "category": "submission",
            "xpReward": 25,
            "rarity": "common"
          }
        }
      ]
    }
    ```

---

### 2. Leaderboard & Rankings

#### 🟢 Get Leaderboard
Retrieve the global student rankings.
*   **Route**: `GET /api/v1/leaderboard`
*   **Query Parameters**:
    *   `period`: `weekly`, `monthly`, or `all-time` (default: `all-time`)
    *   `metric`: `xp`, `challenges`, or `streak` (default: `xp`)
    *   `grade`: Filter by specific student grade (e.g. `Grade 8`, optional)
    *   `page`: Page number (default: `1`)
    *   `limit`: Items per page (default: `20`)
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "page": 1,
      "limit": 10,
      "totalStudents": 3,
      "data": {
        "leaderboard": [
          {
            "rank": 1,
            "studentName": "Reem Hassan",
            "grade": "Grade 6",
            "level": 3,
            "currentStreak": 4,
            "earnedXP": 240,
            "badgesCount": 2
          },
          {
            "rank": 2,
            "studentName": "Mahmoud Hassan",
            "grade": "Grade 8",
            "level": 2,
            "currentStreak": 3,
            "earnedXP": 140,
            "badgesCount": 1
          }
        ]
      }
    }
    ```

#### 🟢 Get My Rank
Quickly find the rank of the logged-in student relative to the filtered list.
*   **Route**: `GET /api/v1/leaderboard/my-rank?period=all-time&metric=xp`
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "data": {
        "rank": 2,
        "score": 140
      }
    }
    ```

---

### 3. Puzzles & Coding Challenges

#### 🟢 List All Challenges
Retrieve all available coding games, challenges, and puzzles.
*   **Route**: `GET /api/v1/challenges`
*   **Query Parameters**: `type` (`coding`/`puzzle`), `difficulty` (`easy`/`medium`/`hard`), `tags` (comma-separated, e.g. `javascript,loops`)
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "results": 1,
      "data": [
        {
          "_id": "60c72b2f9b1d8b2bad9452d1",
          "title": "Reverse a String",
          "description": "Write a function that reverses an input string in JS.",
          "type": "coding",
          "difficulty": "easy",
          "xpReward": 25,
          "timeLimit": 0,
          "tags": ["strings", "javascript"],
          "codingData": {
            "starterCode": "function reverseString(str) {\n  // write code\n}",
            "hints": ["Try looping backwards", "You can use array methods"]
          }
        }
      ]
    }
    ```

#### 🟢 Start Challenge Attempt
Before submitting, students must initialize an attempt. This starts the timers on the backend.
*   **Route**: `POST /api/v1/challenges/:id/start`
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "data": {
        "_id": "60c72b2f9b1d8b2bad9452e5",
        "challenge": "60c72b2f9b1d8b2bad9452d1",
        "startedAt": "2026-06-10T00:54:57.000Z",
        "status": "pending",
        "hintsUsed": 0
      }
    }
    ```

#### 🟢 Submit Puzzle Answer (Auto-Graded Puzzles)
For `puzzle` challenges. Submit a plain-text answer. The backend will evaluate it immediately, award XP if correct, and return the grading status.
*   **Route**: `POST /api/v1/challenges/:id/submit-puzzle`
*   **Body**:
    ```json
    {
      "selectedAnswer": "Option A"
    }
    ```
*   **Response (`200 OK`)**:
    ```json
    {
      "status": "success",
      "data": {
        "isCorrect": true,
        "status": "correct",
        "xpAwarded": 15
      }
    }
    ```

#### 🟢 Submit Coding Challenge Code (Manual Grading)
For `coding` challenges. Submit links to GitHub, CodePen, or paste the text content. The status goes to `pending` until an instructor grades it.
*   **Route**: `POST /api/v1/challenges/:id/submit-code`
*   **Body**:
    ```json
    {
      "submittedCode": "function reverseString(str) { ... }",
      "codeLinks": [
        { "name": "GitHub", "url": "https://github.com/example/reverse" }
      ]
    }
    ```

#### 🟢 Get My Attempts
Find out which challenges the student has already solved or attempted.
*   **Route**: `GET /api/v1/challenges/my-attempts`

---

## 🎨 Recommended UI Design & Screen Guide

When building the frontend, the following layout sections are recommended to create a modern, game-like dashboard:

### 1. 🏅 The Student Gamification Widget
*   **Where**: Home page or top navigation bar.
*   **Visuals**:
    *   Show a progress bar depicting XP earned toward the next level (e.g. `40 / 100 XP`).
    *   Show a badge count indicator and a flaming daily streak counter (e.g., `🔥 3 Days`).
*   **Logic**: Use the `GET /api/v1/gamification/me` endpoint. Listen to `xp:earned` to animate the progress bar filling up and `level:up` to trigger full-screen confetti!

### 2. ⚡ Leaderboard Hub
*   **Filters**: Horizontal buttons for Time Scope (`Weekly` | `Monthly` | `All-Time`) and Metrics (`XP` | `Streaks` | `Challenges`).
*   **Podium**: The top 3 students should be styled prominently on a podium layout (gold, silver, and bronze theme) with avatars.
*   **Table list**: Remaining students are displayed in a clean list below, showing rank, name, stats, and a level badge.
*   **Current User Sticky Bar**: Pin the current student's ranking card to the bottom of the screen (using `GET /api/v1/leaderboard/my-rank`) so they always see their relative position.

### 🧩 3. Puzzles & Coding Sandbox
*   **Layout**: A dual-pane interface:
    *   **Left Pane**: Challenge details, markdown description, difficulty badges (`easy` = green, `medium` = orange, `hard` = red), and a **"Reveal Hint"** button.
        > ⚠️ **Caution warning to student**: Inform them that clicking the Hint button incurs a **20% XP penalty** per hint.
    *   **Right Pane**: If a quiz/puzzle: rendering of radio buttons or a single fill-in-the-blank input. If a coding challenge: a code editor text area (using the `starterCode` template) and inputs for repository/submission links.

### 👨‍🏫 4. Instructor Challenge Desk
*   **For Instructors**: Create a dashboard to create new puzzles or code problems, and a grading table to review pending attempts, view submitted code side-by-side, read hidden test cases, and allocate final scores (0-100) with written feedback.
