USE analytics;

CREATE TABLE sales_reps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_code VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  region ENUM('na', 'emea', 'apac') NOT NULL,
  quota DECIMAL(12,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  started_on DATE NOT NULL
);

CREATE TABLE shipments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(32) NOT NULL,
  sku VARCHAR(40) NOT NULL,
  warehouse_code CHAR(4) NOT NULL,
  carrier VARCHAR(80) NOT NULL,
  status ENUM('queued', 'in_transit', 'delivered', 'exception') NOT NULL,
  shipped_at DATETIME NOT NULL,
  delivered_at DATETIME NULL,
  weight_kg DECIMAL(8,2) NOT NULL,
  fragile TINYINT(1) NOT NULL DEFAULT 0,
  tracking_payload JSON NOT NULL,
  KEY idx_shipments_order_code (order_code),
  KEY idx_shipments_sku (sku)
);

CREATE TABLE warehouse_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_code CHAR(4) NOT NULL,
  sku VARCHAR(40) NOT NULL,
  bin_location VARCHAR(32) NOT NULL,
  quantity INT NOT NULL,
  reorder_level INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_stock_location (warehouse_code, sku)
);

CREATE TABLE refund_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(32) NOT NULL,
  external_ref VARCHAR(48) NOT NULL,
  reason TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  requested_at DATETIME NOT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  context JSON NOT NULL,
  KEY idx_refunds_order_code (order_code)
);

CREATE TABLE supplier_scorecards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(120) NOT NULL,
  risk_level ENUM('low', 'medium', 'high') NOT NULL,
  on_time_pct DECIMAL(5,2) NOT NULL,
  defect_rate_pct DECIMAL(5,2) NOT NULL,
  review_month VARCHAR(7) NOT NULL,
  notes TEXT NULL
);

INSERT INTO sales_reps (id, rep_code, full_name, region, quota, active, started_on) VALUES
  (1, 'REP-AP-01', 'Mira Chen', 'apac', 180000.00, 1, '2022-05-12'),
  (2, 'REP-EU-02', 'Jonas Reed', 'emea', 240000.00, 1, '2021-09-03'),
  (3, 'REP-NA-03', 'Tariq Hassan', 'na', 210000.00, 0, '2020-01-21'),
  (4, 'REP-NA-04', 'Elena Brooks', 'na', 195000.00, 1, '2023-03-14');

INSERT INTO shipments (id, order_code, sku, warehouse_code, carrier, status, shipped_at, delivered_at, weight_kg, fragile, tracking_payload) VALUES
  (1, 'ORD-1001', 'SKU-ET-007', 'SG01', 'DHL', 'delivered', '2025-02-01 08:15:00', '2025-02-04 16:20:00', 12.40, 0, JSON_OBJECT('events', JSON_ARRAY('picked','sorted','delivered'), 'hub', 'SIN', 'serviceLevel', 'express')),
  (2, 'ORD-1002', 'SKU-AN-001', 'US02', 'FedEx', 'delivered', '2025-02-03 11:05:00', '2025-02-05 09:12:00', 3.10, 0, JSON_OBJECT('events', JSON_ARRAY('picked','customs','delivered'), 'hub', 'LAX', 'serviceLevel', 'priority')),
  (3, 'ORD-1003', 'SKU-HW-021', 'DE03', 'UPS', 'exception', '2025-02-05 19:35:00', NULL, 27.80, 1, JSON_OBJECT('events', JSON_ARRAY('picked','delay-weather'), 'hub', 'AMS', 'serviceLevel', 'freight')),
  (4, 'ORD-1004', 'SKU-SV-100', 'GB04', 'Royal Mail', 'queued', '2025-02-08 09:40:00', NULL, 1.00, 0, JSON_OBJECT('events', JSON_ARRAY('label-created'), 'hub', 'LON', 'serviceLevel', 'manual')),
  (5, 'ORD-1005', 'SKU-DB-210', 'SG01', 'DHL', 'in_transit', '2025-02-10 06:25:00', NULL, 8.60, 0, JSON_OBJECT('events', JSON_ARRAY('picked','sorted'), 'hub', 'SIN', 'serviceLevel', 'standard')),
  (6, 'ORD-1006', 'SKU-AL-330', 'US02', 'FedEx', 'delivered', '2025-02-11 13:55:00', '2025-02-13 17:35:00', 4.40, 0, JSON_OBJECT('events', JSON_ARRAY('picked','out-for-delivery','delivered'), 'hub', 'LAX', 'serviceLevel', 'priority')),
  (7, 'ORD-1007', 'SKU-DB-210', 'DE03', 'UPS', 'queued', '2025-02-13 04:10:00', NULL, 8.60, 0, JSON_OBJECT('events', JSON_ARRAY('label-created'), 'hub', 'AMS', 'serviceLevel', 'partner')),
  (8, 'ORD-1008', 'SKU-HW-021', 'GB04', 'DHL', 'in_transit', '2025-02-15 17:20:00', NULL, 28.10, 1, JSON_OBJECT('events', JSON_ARRAY('picked','sorted','customs'), 'hub', 'LON', 'serviceLevel', 'fragile'));

INSERT INTO warehouse_stock (id, warehouse_code, sku, bin_location, quantity, reorder_level) VALUES
  (1, 'SG01', 'SKU-AN-001', 'A-01-03', 84, 20),
  (2, 'US02', 'SKU-HW-021', 'B-11-08', 7, 5),
  (3, 'DE03', 'SKU-ET-007', 'C-04-02', 19, 8),
  (4, 'GB04', 'SKU-SV-100', 'SERV-01', 999, 100),
  (5, 'SG01', 'SKU-DB-210', 'D-02-07', 24, 10),
  (6, 'US02', 'SKU-AL-330', 'A-08-11', 52, 12);

INSERT INTO refund_requests (id, order_code, external_ref, reason, amount, requested_at, approved, context) VALUES
  (1, 'ORD-1003', 'RF-9001', 'Damaged packaging on arrival', 1299.50, '2025-02-09 10:42:00', 0, JSON_OBJECT('channel', 'support', 'currency', 'USD', 'slaHours', 48)),
  (2, 'ORD-1004', 'RF-9002', 'Workshop scheduling conflict', 3499.00, '2025-02-14 14:05:00', 0, JSON_OBJECT('channel', 'account-team', 'currency', 'GBP', 'slaHours', 24)),
  (3, 'ORD-1009', 'RF-9003', 'Duplicate charge after card retry', 799.00, '2025-02-17 09:15:00', 1, JSON_OBJECT('channel', 'portal', 'currency', 'AUD', 'slaHours', 12));

INSERT INTO supplier_scorecards (id, supplier_name, risk_level, on_time_pct, defect_rate_pct, review_month, notes) VALUES
  (1, 'Pacific Components', 'low', 97.40, 0.80, '2025-01', 'Consistent lead times and fast replacement flow'),
  (2, 'Northwind Logistics', 'medium', 91.20, 1.90, '2025-01', 'Weather delays in EU lanes'),
  (3, 'Atlas Fabrication', 'high', 84.10, 4.60, '2025-01', 'Escalated for corrective action'),
  (4, 'Signal Distribution', 'low', 98.10, 0.40, '2025-01', 'Reliable packaging quality');
