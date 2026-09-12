ALTER TABLE `products` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `goods_receipts` ADD `is_sample` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `is_sample` integer DEFAULT false NOT NULL;