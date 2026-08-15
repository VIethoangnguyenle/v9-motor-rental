CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_phone_normalized" CHECK ("customers"."phone" ~ '^0[0-9]{8,10}$')
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"handed_over_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"total_amount" integer NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rentals_period_valid" CHECK ("rentals"."ends_at" > "rentals"."starts_at"),
	CONSTRAINT "rentals_status_valid" CHECK ("rentals"."status" IN ('BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "rentals_money_nonneg" CHECK ("rentals"."total_amount" >= 0 AND "rentals"."deposit_amount" >= 0),
	CONSTRAINT "rentals_ongoing_has_handover" CHECK ("rentals"."status" <> 'ONGOING' OR "rentals"."handed_over_at" IS NOT NULL),
	CONSTRAINT "rentals_completed_has_return" CHECK ("rentals"."status" <> 'COMPLETED' OR ("rentals"."handed_over_at" IS NOT NULL AND "rentals"."returned_at" IS NOT NULL)),
	CONSTRAINT "rentals_handover_only_when_out" CHECK ("rentals"."handed_over_at" IS NULL OR "rentals"."status" IN ('ONGOING', 'COMPLETED')),
	CONSTRAINT "rentals_return_only_when_completed" CHECK ("rentals"."returned_at" IS NULL OR "rentals"."status" = 'COMPLETED'),
	CONSTRAINT "rentals_return_after_handover" CHECK ("rentals"."returned_at" IS NULL OR "rentals"."handed_over_at" IS NULL OR "rentals"."returned_at" >= "rentals"."handed_over_at")
);
--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_created_by_staff_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rentals_revenue_idx" ON "rentals" USING btree ("handed_over_at") WHERE "rentals"."handed_over_at" IS NOT NULL;