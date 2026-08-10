CREATE TABLE "password_reset_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prc_attempts_nonneg" CHECK ("password_reset_codes"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'STAFF' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email"),
	CONSTRAINT "staff_users_role_valid" CHECK ("staff_users"."role" IN ('OWNER', 'STAFF', 'SALES')),
	CONSTRAINT "staff_users_status_valid" CHECK ("staff_users"."status" IN ('PENDING', 'ACTIVE', 'DISABLED'))
);
--> statement-breakpoint
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prc_active" ON "password_reset_codes" USING btree ("staff_user_id") WHERE "password_reset_codes"."used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_users_pending" ON "staff_users" USING btree ("created_at") WHERE "staff_users"."status" = 'PENDING';