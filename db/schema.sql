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
	"allegiance" text,
	"sworn_at" timestamp,
	"bretwalda_seasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"index" integer NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"verdict" jsonb
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"territory_id" text NOT NULL,
	"holder" text NOT NULL,
	"threshold" integer NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"contest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cleared" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "war_flips" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"territory_id" text NOT NULL,
	"from_people" text NOT NULL,
	"to_people" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "war_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"match_key" text NOT NULL,
	"player_id" text NOT NULL,
	"profile_id" integer NOT NULL,
	"people" text NOT NULL,
	"territory_id" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_claims_fingerprint_idx" ON "legacy_claims" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "legacy_claims_player_idx" ON "legacy_claims" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_recovery_code_idx" ON "players" USING btree ("recovery_code");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_index_idx" ON "seasons" USING btree ("index");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_running_idx" ON "seasons" USING btree ("state") WHERE "seasons"."state" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "territories_season_ground_idx" ON "territories" USING btree ("season_id","territory_id");--> statement-breakpoint
CREATE INDEX "war_flips_season_idx" ON "war_flips" USING btree ("season_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "war_ledger_match_player_idx" ON "war_ledger" USING btree ("match_key","player_id");--> statement-breakpoint
CREATE INDEX "war_ledger_season_profile_idx" ON "war_ledger" USING btree ("season_id","profile_id");--> statement-breakpoint
CREATE INDEX "war_ledger_season_ground_idx" ON "war_ledger" USING btree ("season_id","territory_id");--> statement-breakpoint
CREATE INDEX "war_ledger_season_people_idx" ON "war_ledger" USING btree ("season_id","people","points");