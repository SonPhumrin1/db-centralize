CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  segment TEXT NOT NULL,
  country TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  lifetime_value NUMERIC(12,2) NOT NULL,
  profile JSONB NOT NULL
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  inventory_count INTEGER NOT NULL,
  tags TEXT[] NOT NULL
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  order_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  invoice_number TEXT NOT NULL UNIQUE,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE support_tickets (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  priority TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  tags JSONB NOT NULL,
  summary TEXT NOT NULL
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_orders_placed_at ON orders(placed_at);
CREATE INDEX idx_support_tickets_opened_at ON support_tickets(opened_at);

INSERT INTO customers (id, full_name, segment, country, joined_at, is_active, lifetime_value, profile) VALUES
  (1, 'Ava Martinez', 'enterprise', 'US', '2023-01-14T09:20:00Z', TRUE, 18450.75, '{"tier":"gold","contacts":3,"preferredChannel":"slack","region":"na","accountManager":"Mira Chen"}'),
  (2, 'Noah Kim', 'mid-market', 'SG', '2023-07-02T13:05:00Z', TRUE, 9240.40, '{"tier":"silver","contacts":1,"preferredChannel":"email","region":"apac","accountManager":"Jonas Reed"}'),
  (3, 'Lina Sok', 'startup', 'KH', '2024-03-18T04:40:00Z', TRUE, 1320.00, '{"tier":"starter","contacts":2,"preferredChannel":"telegram","region":"sea","accountManager":"Mira Chen"}'),
  (4, 'Owen Patel', 'enterprise', 'GB', '2022-11-09T17:30:00Z', TRUE, 24890.10, '{"tier":"platinum","contacts":4,"preferredChannel":"phone","region":"emea","accountManager":"Jonas Reed"}'),
  (5, 'Priya Nair', 'mid-market', 'IN', '2024-05-06T08:50:00Z', TRUE, 6880.20, '{"tier":"silver","contacts":2,"preferredChannel":"whatsapp","region":"apac","accountManager":"Mira Chen"}'),
  (6, 'Sam Carter', 'enterprise', 'AU', '2021-08-26T12:10:00Z', FALSE, 31240.00, '{"tier":"platinum","contacts":5,"preferredChannel":"email","region":"apac","accountManager":"Jonas Reed"}');

INSERT INTO products (id, sku, name, category, price, inventory_count, tags) VALUES
  (1, 'SKU-AN-001', 'Analytics Seat', 'software', 249.00, 120, ARRAY['saas','subscription','b2b']),
  (2, 'SKU-ET-007', 'Event Stream Pack', 'software', 799.00, 34, ARRAY['streaming','integration']),
  (3, 'SKU-HW-021', 'Edge Sensor Kit', 'hardware', 1299.50, 9, ARRAY['iot','device','field']),
  (4, 'SKU-SV-100', 'Success Workshop', 'service', 3499.00, 1000, ARRAY['consulting','training']),
  (5, 'SKU-DB-210', 'Data Bridge Connector', 'software', 1199.00, 42, ARRAY['connector','sync']),
  (6, 'SKU-AL-330', 'Alerting Pack', 'software', 499.00, 75, ARRAY['monitoring','alerts']);

INSERT INTO orders (id, customer_id, product_id, order_code, status, quantity, total, currency, placed_at, metadata) VALUES
  (1, 1, 2, 'ORD-1001', 'paid', 2, 1598.00, 'USD', '2025-02-01T08:15:00Z', '{"channel":"account-team","region":"na","priority":"standard","warehouse":"SG01"}'),
  (2, 2, 1, 'ORD-1002', 'paid', 10, 2490.00, 'USD', '2025-02-03T11:05:00Z', '{"channel":"self-serve","region":"apac","priority":"rush","warehouse":"US02"}'),
  (3, 3, 3, 'ORD-1003', 'refunded', 1, 1299.50, 'USD', '2025-02-05T19:35:00Z', '{"channel":"partner","region":"sea","priority":"standard","warehouse":"DE03"}'),
  (4, 4, 4, 'ORD-1004', 'pending', 1, 3499.00, 'GBP', '2025-02-08T09:40:00Z', '{"channel":"sales","region":"emea","priority":"approval","warehouse":"GB04"}'),
  (5, 5, 5, 'ORD-1005', 'paid', 3, 3597.00, 'USD', '2025-02-10T06:25:00Z', '{"channel":"self-serve","region":"apac","priority":"standard","warehouse":"SG01"}'),
  (6, 1, 6, 'ORD-1006', 'paid', 5, 2495.00, 'USD', '2025-02-11T13:55:00Z', '{"channel":"account-team","region":"na","priority":"standard","warehouse":"US02"}'),
  (7, 2, 5, 'ORD-1007', 'pending', 1, 1199.00, 'USD', '2025-02-13T04:10:00Z', '{"channel":"partner","region":"apac","priority":"review","warehouse":"DE03"}'),
  (8, 4, 3, 'ORD-1008', 'paid', 2, 2599.00, 'GBP', '2025-02-15T17:20:00Z', '{"channel":"sales","region":"emea","priority":"fragile","warehouse":"GB04"}'),
  (9, 6, 2, 'ORD-1009', 'cancelled', 1, 799.00, 'AUD', '2025-02-18T21:45:00Z', '{"channel":"renewal","region":"apac","priority":"standard","warehouse":"SG01"}'),
  (10, 3, 1, 'ORD-1010', 'paid', 4, 996.00, 'USD', '2025-02-20T02:05:00Z', '{"channel":"inside-sales","region":"sea","priority":"standard","warehouse":"US02"}');

INSERT INTO invoices (order_id, invoice_number, due_date, paid_at, notes) VALUES
  (1, 'INV-2025-001', '2025-02-12', '2025-02-04T10:15:00Z', 'Paid via ACH'),
  (2, 'INV-2025-002', '2025-02-16', '2025-02-06T08:10:00Z', 'Annual contract prepay'),
  (3, 'INV-2025-003', '2025-02-19', NULL, 'Refund in review'),
  (4, 'INV-2025-004', '2025-02-24', NULL, 'Awaiting approver sign-off'),
  (5, 'INV-2025-005', '2025-02-22', '2025-02-14T03:35:00Z', 'Self-serve checkout'),
  (6, 'INV-2025-006', '2025-02-25', '2025-02-15T07:55:00Z', 'Upsell bundle'),
  (7, 'INV-2025-007', '2025-02-28', NULL, 'Partner reseller order'),
  (8, 'INV-2025-008', '2025-03-01', '2025-02-18T15:20:00Z', 'EMEA consulting package');

INSERT INTO support_tickets (customer_id, priority, opened_at, resolved_at, tags, summary) VALUES
  (1, 'high', '2025-02-11T06:45:00Z', '2025-02-11T14:02:00Z', '["billing","invoice","ORD-1001"]', 'Invoice PDF missing VAT breakdown'),
  (2, 'medium', '2025-02-12T03:30:00Z', NULL, '["api","throughput","ORD-1002"]', 'Webhook delivery lag above SLO'),
  (4, 'low', '2025-02-14T09:05:00Z', NULL, '["enablement","training","ORD-1004"]', 'Request for workshop agenda and attendee prep'),
  (5, 'medium', '2025-02-17T16:10:00Z', '2025-02-18T05:42:00Z', '["connector","setup","ORD-1005"]', 'Connector credentials rotated unexpectedly'),
  (3, 'high', '2025-02-21T01:15:00Z', NULL, '["refund","hardware","ORD-1003"]', 'Refund still pending after pickup confirmation');
