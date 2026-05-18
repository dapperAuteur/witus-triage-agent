CREATE TYPE "public"."received_via" AS ENUM('webhook', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."submission_priority" AS ENUM('normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('new', 'in_progress', 'replied', 'waiting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."triage_run_status" AS ENUM('running', 'pending_approval', 'approved', 'rejected', 'executed', 'failed');--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"form_type" text NOT NULL,
	"submitter_email" text,
	"submitter_name" text,
	"payload" jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'new' NOT NULL,
	"priority" "submission_priority" DEFAULT 'normal' NOT NULL,
	"received_via" "received_via" DEFAULT 'webhook' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" text
);
--> statement-breakpoint
CREATE TABLE "triage_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" "triage_run_status" DEFAULT 'running' NOT NULL,
	"classification" jsonb,
	"enrichment" jsonb,
	"proposed_action" jsonb,
	"approval" jsonb,
	"execution" jsonb,
	"langsmith_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "triage_audit_log" ADD CONSTRAINT "triage_audit_log_run_id_triage_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."triage_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;