CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role_check" CHECK("role" IN ('owner', 'staff'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` integer,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `document_sequences` (
	`doc_type` text PRIMARY KEY NOT NULL,
	`format` text NOT NULL,
	`reset_policy` text NOT NULL,
	`current_period` text DEFAULT '' NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_sequences_doc_type_check" CHECK("doc_type" IN ('sale', 'return', 'quote', 'goods_receipt', 'adjustment', 'repair', 'claim', 'trade_in')),
	CONSTRAINT "document_sequences_reset_policy_check" CHECK("reset_policy" IN ('never', 'yearly', 'monthly')),
	CONSTRAINT "document_sequences_last_number_non_negative" CHECK("last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha256` text NOT NULL,
	`path` text NOT NULL,
	`thumb_path` text,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_sha256_unique` ON `files` (`sha256`);--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`shop_name` text NOT NULL,
	`logo_file_id` integer,
	`address` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`line_id` text DEFAULT '' NOT NULL,
	`promptpay_id` text DEFAULT '' NOT NULL,
	`receipt_footer` text DEFAULT '' NOT NULL,
	`use_buddhist_era` integer DEFAULT true NOT NULL,
	`allow_negative_stock` integer DEFAULT false NOT NULL,
	`default_assembly_fee_satang` integer DEFAULT 0 NOT NULL,
	`backup_dir` text,
	`backup_keep_count` integer DEFAULT 14 NOT NULL,
	`backup_hour` integer DEFAULT 22 NOT NULL,
	`recovery_code_hash` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`logo_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shop_settings_single_row" CHECK("id" = 1),
	CONSTRAINT "shop_settings_default_assembly_fee_satang_non_negative" CHECK("default_assembly_fee_satang" >= 0),
	CONSTRAINT "shop_settings_backup_keep_count_range" CHECK("backup_keep_count" BETWEEN 1 AND 365),
	CONSTRAINT "shop_settings_backup_hour_range" CHECK("backup_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK("kind" IN ('cpu', 'mainboard', 'ram', 'gpu', 'storage', 'psu', 'case', 'cooler', 'monitor', 'accessory', 'service', 'other'))
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`product_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`product_id`, `file_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`price_satang` integer,
	`regular_price_satang` integer,
	`changed_by` integer,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_price_history_product_idx` ON `product_price_history` (`product_id`,`changed_at`);--> statement-breakpoint
CREATE TABLE `product_tags` (
	`product_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`product_id`, `tag_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_tags_tag_idx` ON `product_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`category_id` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`specs` text NOT NULL,
	`condition` text DEFAULT 'new' NOT NULL,
	`warranty_type` text DEFAULT 'none' NOT NULL,
	`warranty_months` integer DEFAULT 0 NOT NULL,
	`supplier_warranty_months` integer DEFAULT 0 NOT NULL,
	`price_satang` integer,
	`regular_price_satang` integer,
	`cost_satang` integer DEFAULT 0 NOT NULL,
	`track_stock` integer DEFAULT true NOT NULL,
	`serial_required` integer DEFAULT false NOT NULL,
	`min_stock` integer DEFAULT 0 NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_condition_check" CHECK("condition" IN ('new', 'used')),
	CONSTRAINT "products_warranty_type_check" CHECK("warranty_type" IN ('distributor', 'shop', 'none')),
	CONSTRAINT "products_price_satang_non_negative" CHECK("price_satang" >= 0),
	CONSTRAINT "products_regular_price_satang_non_negative" CHECK("regular_price_satang" >= 0),
	CONSTRAINT "products_cost_satang_non_negative" CHECK("cost_satang" >= 0),
	CONSTRAINT "products_warranty_months_non_negative" CHECK("warranty_months" >= 0),
	CONSTRAINT "products_supplier_warranty_months_non_negative" CHECK("supplier_warranty_months" >= 0),
	CONSTRAINT "products_min_stock_non_negative" CHECK("min_stock" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `goods_receipt_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goods_receipt_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`unit_cost_satang` integer NOT NULL,
	`cost_source` text NOT NULL,
	`line_total_satang` integer NOT NULL,
	FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "goods_receipt_items_qty_positive" CHECK("qty" > 0),
	CONSTRAINT "goods_receipt_items_cost_source_check" CHECK("cost_source" IN ('entered', 'average')),
	CONSTRAINT "goods_receipt_items_unit_cost_satang_non_negative" CHECK("unit_cost_satang" >= 0)
);
--> statement-breakpoint
CREATE INDEX `goods_receipt_items_receipt_idx` ON `goods_receipt_items` (`goods_receipt_id`);--> statement-breakpoint
CREATE INDEX `goods_receipt_items_product_idx` ON `goods_receipt_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_no` text NOT NULL,
	`supplier_id` integer,
	`supplier_invoice_no` text DEFAULT '' NOT NULL,
	`received_at` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`cost_status` text NOT NULL,
	`cost_verified_by` integer,
	`cost_verified_at` integer,
	`total_cost_satang` integer DEFAULT 0 NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`voided_at` integer,
	`voided_by` integer,
	`void_reason` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "goods_receipts_status_check" CHECK("status" IN ('posted', 'voided')),
	CONSTRAINT "goods_receipts_cost_status_check" CHECK("cost_status" IN ('unverified', 'verified')),
	CONSTRAINT "goods_receipts_total_cost_satang_non_negative" CHECK("total_cost_satang" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goods_receipts_doc_no_unique` ON `goods_receipts` (`doc_no`);--> statement-breakpoint
CREATE INDEX `goods_receipts_received_at_idx` ON `goods_receipts` (`received_at`);--> statement-breakpoint
CREATE TABLE `serial_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`serial_no` text NOT NULL,
	`status` text NOT NULL,
	`was_returned` integer DEFAULT false NOT NULL,
	`unit_cost_satang` integer NOT NULL,
	`goods_receipt_item_id` integer,
	`received_at` integer NOT NULL,
	`supplier_warranty_expires_at` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "serial_items_status_check" CHECK("status" IN ('in_stock', 'in_build', 'sold', 'customer_returned', 'in_claim', 'returned_to_supplier', 'written_off')),
	CONSTRAINT "serial_items_unit_cost_satang_non_negative" CHECK("unit_cost_satang" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_items_product_serial_unique` ON `serial_items` (`product_id`,`serial_no`);--> statement-breakpoint
CREATE INDEX `serial_items_serial_no_idx` ON `serial_items` (`serial_no`);--> statement-breakpoint
CREATE INDEX `serial_items_status_idx` ON `serial_items` (`product_id`,`status`);--> statement-breakpoint
CREATE TABLE `stock_movement_serials` (
	`movement_id` integer NOT NULL,
	`serial_item_id` integer NOT NULL,
	PRIMARY KEY(`movement_id`, `serial_item_id`),
	FOREIGN KEY (`movement_id`) REFERENCES `stock_movements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`serial_item_id`) REFERENCES `serial_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_movement_serials_serial_idx` ON `stock_movement_serials` (`serial_item_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`qty_change` integer NOT NULL,
	`type` text NOT NULL,
	`ref_type` text,
	`ref_id` integer,
	`ref_doc_no` text,
	`unit_cost_satang` integer,
	`balance_after` integer NOT NULL,
	`reason` text,
	`performed_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_type_check" CHECK("type" IN ('opening', 'receive', 'sale', 'build_consume', 'build_release', 'adjustment', 'return_restock', 'trade_in', 'void', 'repair_use', 'claim_out', 'claim_in')),
	CONSTRAINT "stock_movements_qty_nonzero" CHECK("qty_change" <> 0)
);
--> statement-breakpoint
CREATE INDEX `stock_movements_product_idx` ON `stock_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_ref_idx` ON `stock_movements` (`ref_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`line_id` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
