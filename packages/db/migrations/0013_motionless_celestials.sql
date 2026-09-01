CREATE TABLE "rental_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"start_date" date NOT NULL,
	"days" integer NOT NULL,
	"delivery_address" text,
	"note" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_requests_phone_normalized" CHECK ("rental_requests"."phone" ~ '^0[0-9]{8,10}$'),
	CONSTRAINT "rental_requests_status_valid" CHECK ("rental_requests"."status" IN ('NEW', 'CONTACTED', 'CLOSED')),
	CONSTRAINT "rental_requests_days_range" CHECK ("rental_requests"."days" >= 1 AND "rental_requests"."days" <= 92),
	CONSTRAINT "rental_requests_handled_consistent" CHECK ("rental_requests"."status" = 'NEW' OR ("rental_requests"."handled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_handled_by_staff_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_requests_new_idx" ON "rental_requests" USING btree ("created_at" DESC NULLS LAST) WHERE "rental_requests"."status" = 'NEW';--> statement-breakpoint
CREATE INDEX "rental_requests_vehicle_idx" ON "rental_requests" USING btree ("vehicle_id","created_at" DESC NULLS LAST);