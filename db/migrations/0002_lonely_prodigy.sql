CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"temperature" real DEFAULT 0 NOT NULL,
	"max_tokens" integer DEFAULT 1024 NOT NULL,
	"tracing_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
