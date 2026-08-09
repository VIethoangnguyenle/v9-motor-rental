CREATE TABLE "vehicle_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"alt" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"engine_cc" integer NOT NULL,
	"odo_km" integer,
	"color" text,
	"plate" text,
	"description" text,
	"price_per_day" integer NOT NULL,
	"deposit" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "vehicles_slug_format" CHECK ("vehicles"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "vehicles_status_valid" CHECK ("vehicles"."status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_photos_vehicle_idx" ON "vehicle_photos" USING btree ("vehicle_id","sort");--> statement-breakpoint
CREATE INDEX "vehicles_published_idx" ON "vehicles" USING btree ("sort","created_at" DESC NULLS LAST) WHERE "vehicles"."status" = 'published';