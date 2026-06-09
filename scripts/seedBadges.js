/**
 * Seed badge definitions into the database.
 *
 * Usage: npm run seed:badges
 * (add script to package.json: "seed:badges": "node scripts/seedBadges.js")
 */

import "dotenv/config";
import mongoose from "mongoose";
import { Badge } from "../Models/Badge.js";

const BADGES = [
  // ─── Submission Badges ──────────────────────────────────────────────
  {
    name: "First Blood",
    description: "Submit your first task",
    icon: "🎯",
    category: "submission",
    condition: { stat: "tasksSubmitted", threshold: 1 },
    xpReward: 25,
    rarity: "common",
  },
  {
    name: "Task Machine",
    description: "Submit 10 tasks",
    icon: "📝",
    category: "submission",
    condition: { stat: "tasksSubmitted", threshold: 10 },
    xpReward: 50,
    rarity: "rare",
  },
  {
    name: "Task Legend",
    description: "Submit 50 tasks",
    icon: "🏅",
    category: "submission",
    condition: { stat: "tasksSubmitted", threshold: 50 },
    xpReward: 150,
    rarity: "epic",
  },
  {
    name: "Perfect Score",
    description: "Get a perfect 10/10 review score",
    icon: "⭐",
    category: "submission",
    condition: { stat: "perfectScores", threshold: 1 },
    xpReward: 50,
    rarity: "rare",
  },
  {
    name: "Perfectionist",
    description: "Get 5 perfect review scores",
    icon: "🌟",
    category: "submission",
    condition: { stat: "perfectScores", threshold: 5 },
    xpReward: 100,
    rarity: "epic",
  },

  // ─── Streak Badges ──────────────────────────────────────────────────
  {
    name: "On Fire",
    description: "Maintain a 7-day activity streak",
    icon: "🔥",
    category: "streak",
    condition: { stat: "currentStreak", threshold: 7 },
    xpReward: 75,
    rarity: "rare",
  },
  {
    name: "Unstoppable",
    description: "Maintain a 30-day activity streak",
    icon: "💥",
    category: "streak",
    condition: { stat: "currentStreak", threshold: 30 },
    xpReward: 200,
    rarity: "legendary",
  },

  // ─── Challenge Badges ───────────────────────────────────────────────
  {
    name: "Code Warrior",
    description: "Solve 5 coding challenges",
    icon: "🧑‍💻",
    category: "challenge",
    condition: { stat: "challengesSolved", threshold: 5 },
    xpReward: 75,
    rarity: "rare",
  },
  {
    name: "Grand Master",
    description: "Solve 25 coding challenges",
    icon: "🏆",
    category: "challenge",
    condition: { stat: "challengesSolved", threshold: 25 },
    xpReward: 250,
    rarity: "legendary",
  },
  {
    name: "Puzzle Pro",
    description: "Solve 10 puzzles correctly",
    icon: "🧩",
    category: "challenge",
    condition: { stat: "puzzlesSolved", threshold: 10 },
    xpReward: 75,
    rarity: "rare",
  },

  // ─── Attendance Badges ──────────────────────────────────────────────
  {
    name: "Bookworm",
    description: "Attend 20 sessions",
    icon: "📚",
    category: "attendance",
    condition: { stat: "sessionsAttended", threshold: 20 },
    xpReward: 100,
    rarity: "rare",
  },

  // ─── Exam Badges ────────────────────────────────────────────────────
  {
    name: "Scholar",
    description: "Pass 5 exams above the passing mark",
    icon: "🎓",
    category: "exam",
    condition: { stat: "examsAbovePassing", threshold: 5 },
    xpReward: 100,
    rarity: "rare",
  },

  // ─── Level Badges ───────────────────────────────────────────────────
  {
    name: "Level 10",
    description: "Reach Level 10",
    icon: "💯",
    category: "general",
    condition: { stat: "level", threshold: 10 },
    xpReward: 100,
    rarity: "epic",
  },
  {
    name: "Level 25",
    description: "Reach Level 25",
    icon: "🚀",
    category: "general",
    condition: { stat: "level", threshold: 25 },
    xpReward: 250,
    rarity: "legendary",
  },
];

async function seed() {
  try {
    const dbUri = process.env.CONNECTION_STRING || process.env.DATA_BASE;
    if (!dbUri) {
      console.error("❌ CONNECTION_STRING or DATA_BASE env variable is not set!");
      process.exit(1);
    }

    await mongoose.connect(dbUri);
    console.log("✅ Connected to MongoDB");

    let created = 0;
    let skipped = 0;

    for (const badge of BADGES) {
      const exists = await Badge.findOne({ name: badge.name });
      if (exists) {
        skipped++;
        console.log(`⏭️  Skipped (exists): ${badge.icon} ${badge.name}`);
      } else {
        await Badge.create(badge);
        created++;
        console.log(`✅ Created: ${badge.icon} ${badge.name} (${badge.rarity})`);
      }
    }

    console.log(`\n🏁 Done! Created: ${created}, Skipped: ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
