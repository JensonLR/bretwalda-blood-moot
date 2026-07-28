import { pgTable, text, integer, timestamp, serial, jsonb } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  secret: text("secret").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  honour: integer("honour").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  matches: integer("matches").notNull().default(0),
  favoriteClass: text("favorite_class").notNull().default("warden"),
  cosmetics: jsonb("cosmetics").notNull().default({}),
  unlockedCosmetics: jsonb("unlocked_cosmetics").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const matchHistory = pgTable("match_history", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  mode: text("mode").notNull(),
  winnerId: integer("winner_id"),
  winnerName: text("winner_name"),
  playerCount: integer("player_count").notNull(),
  duration: integer("duration").notNull().default(0),
  results: jsonb("results").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
