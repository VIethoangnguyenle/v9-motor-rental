CREATE TABLE "rental_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_photos_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "rental_photos_kind_valid" CHECK ("rental_photos"."kind" IN ('DOCUMENT', 'HANDOVER', 'RETURN')),
	CONSTRAINT "rental_photos_size_range" CHECK ("rental_photos"."size_bytes" >= 1 AND "rental_photos"."size_bytes" <= 12582912),
	CONSTRAINT "rental_photos_content_type_valid" CHECK ("rental_photos"."content_type" IN ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "rental_photos" ADD CONSTRAINT "rental_photos_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_photos" ADD CONSTRAINT "rental_photos_uploaded_by_staff_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_photos_rental_idx" ON "rental_photos" USING btree ("rental_id","kind","created_at");