CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`phone_normalized` text DEFAULT '' NOT NULL,
	`line_id` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone_normalized`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`method` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`received_satang` integer NOT NULL,
	`change_satang` integer DEFAULT 0 NOT NULL,
	`paid_at` integer NOT NULL,
	`received_by` integer,
	`voided_at` integer,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_method_check" CHECK("method" IN ('cash', 'transfer', 'trade_in_credit')),
	CONSTRAINT "payments_amount_satang_non_negative" CHECK("amount_satang" >= 0),
	CONSTRAINT "payments_received_satang_non_negative" CHECK("received_satang" >= 0),
	CONSTRAINT "payments_change_satang_non_negative" CHECK("change_satang" >= 0)
);
--> statement-breakpoint
CREATE INDEX `payments_sale_idx` ON `payments` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sale_item_serials` (
	`sale_item_id` integer NOT NULL,
	`serial_item_id` integer NOT NULL,
	PRIMARY KEY(`sale_item_id`, `serial_item_id`),
	FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`serial_item_id`) REFERENCES `serial_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sale_item_serials_serial_idx` ON `sale_item_serials` (`serial_item_id`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`parent_item_id` integer,
	`kind` text DEFAULT 'product' NOT NULL,
	`product_id` integer,
	`build_id` integer,
	`name_snapshot` text NOT NULL,
	`sku_snapshot` text DEFAULT '' NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_satang` integer NOT NULL,
	`line_total_satang` integer NOT NULL,
	`regular_price_satang` integer,
	`unit_cost_satang` integer DEFAULT 0 NOT NULL,
	`warranty_type` text DEFAULT 'none' NOT NULL,
	`warranty_months` integer DEFAULT 0 NOT NULL,
	`returned_qty` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_item_id`) REFERENCES `sale_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_items_kind_check" CHECK("kind" IN ('product', 'build', 'service')),
	CONSTRAINT "sale_items_qty_positive" CHECK("qty" > 0),
	CONSTRAINT "sale_items_unit_price_satang_non_negative" CHECK("unit_price_satang" >= 0),
	CONSTRAINT "sale_items_line_total_satang_non_negative" CHECK("line_total_satang" >= 0),
	CONSTRAINT "sale_items_regular_price_satang_non_negative" CHECK("regular_price_satang" >= 0),
	CONSTRAINT "sale_items_unit_cost_satang_non_negative" CHECK("unit_cost_satang" >= 0),
	CONSTRAINT "sale_items_returned_qty_non_negative" CHECK("returned_qty" >= 0),
	CONSTRAINT "sale_items_returned_qty_max" CHECK("returned_qty" <= "qty")
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_product_idx` ON `sale_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `sale_return_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_id` integer NOT NULL,
	`sale_item_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`serial_item_id` integer,
	`refund_satang` integer DEFAULT 0 NOT NULL,
	`unit_cost_satang` integer DEFAULT 0 NOT NULL,
	`disposition` text DEFAULT 'pending' NOT NULL,
	`resolved_at` integer,
	`resolved_by` integer,
	`resolution_note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `sale_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`serial_item_id`) REFERENCES `serial_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_return_items_disposition_check" CHECK("disposition" IN ('pending', 'restocked', 'sent_to_claim', 'written_off')),
	CONSTRAINT "sale_return_items_qty_positive" CHECK("qty" > 0),
	CONSTRAINT "sale_return_items_refund_satang_non_negative" CHECK("refund_satang" >= 0),
	CONSTRAINT "sale_return_items_unit_cost_satang_non_negative" CHECK("unit_cost_satang" >= 0)
);
--> statement-breakpoint
CREATE INDEX `sale_return_items_return_idx` ON `sale_return_items` (`return_id`);--> statement-breakpoint
CREATE INDEX `sale_return_items_sale_item_idx` ON `sale_return_items` (`sale_item_id`);--> statement-breakpoint
CREATE INDEX `sale_return_items_pending_idx` ON `sale_return_items` (`disposition`);--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_no` text NOT NULL,
	`sale_id` integer NOT NULL,
	`returned_at` integer NOT NULL,
	`reason` text NOT NULL,
	`refund_method` text DEFAULT 'none' NOT NULL,
	`refund_satang` integer DEFAULT 0 NOT NULL,
	`refund_adjusted_by` integer,
	`refund_adjusted_at` integer,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_adjusted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_returns_refund_method_check" CHECK("refund_method" IN ('none', 'cash', 'transfer')),
	CONSTRAINT "sale_returns_refund_satang_non_negative" CHECK("refund_satang" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_returns_doc_no_unique` ON `sale_returns` (`doc_no`);--> statement-breakpoint
CREATE INDEX `sale_returns_sale_idx` ON `sale_returns` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_returns_returned_at_idx` ON `sale_returns` (`returned_at`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_no` text NOT NULL,
	`customer_id` integer,
	`customer_name` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`sold_at` integer NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`total_satang` integer NOT NULL,
	`savings_satang` integer DEFAULT 0 NOT NULL,
	`refunded_satang` integer DEFAULT 0 NOT NULL,
	`total_cost_satang` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'pos' NOT NULL,
	`quote_id` integer,
	`repair_job_id` integer,
	`note` text DEFAULT '' NOT NULL,
	`salesperson_id` integer,
	`created_at` integer NOT NULL,
	`voided_at` integer,
	`voided_by` integer,
	`void_reason` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`salesperson_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_status_check" CHECK("status" IN ('paid', 'voided')),
	CONSTRAINT "sales_source_check" CHECK("source" IN ('pos', 'quote', 'repair')),
	CONSTRAINT "sales_total_satang_non_negative" CHECK("total_satang" >= 0),
	CONSTRAINT "sales_savings_satang_non_negative" CHECK("savings_satang" >= 0),
	CONSTRAINT "sales_refunded_satang_non_negative" CHECK("refunded_satang" >= 0),
	CONSTRAINT "sales_total_cost_satang_non_negative" CHECK("total_cost_satang" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_doc_no_unique` ON `sales` (`doc_no`);--> statement-breakpoint
CREATE INDEX `sales_sold_at_idx` ON `sales` (`sold_at`);--> statement-breakpoint
CREATE INDEX `sales_customer_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_salesperson_idx` ON `sales` (`salesperson_id`,`sold_at`);