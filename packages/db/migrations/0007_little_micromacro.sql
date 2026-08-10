ALTER TABLE "password_reset_codes" DROP CONSTRAINT "prc_attempts_nonneg";--> statement-breakpoint
DROP INDEX "prc_active";--> statement-breakpoint
DROP INDEX "staff_users_pending";--> statement-breakpoint
CREATE INDEX "password_reset_codes_active_idx" ON "password_reset_codes" USING btree ("staff_user_id") WHERE "password_reset_codes"."used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_users_pending_idx" ON "staff_users" USING btree ("created_at") WHERE "staff_users"."status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_attempts_nonneg" CHECK ("password_reset_codes"."attempts" >= 0);