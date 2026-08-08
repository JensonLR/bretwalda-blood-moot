CREATE TABLE "legacy_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"player_id" integer NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"mode" text NOT NULL,
	"winner_id" integer,
	"winner_name" text,
	"player_count" integer NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"secret_hash" text NOT NULL,
	"recovery_code" text,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"honour" integer DEFAULT 0 NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"favorite_class" text DEFAULT 'warden' NOT NULL,
	"cosmetics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unlocked_cosmetics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bindings" jsonb,
	"muted" boolean DEFAULT false NOT NULL,
	"legacy_claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_claims_fingerprint_idx" ON "legacy_claims" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "legacy_claims_player_idx" ON "legacy_claims" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_recovery_code_idx" ON "players" USING btree ("recovery_code");