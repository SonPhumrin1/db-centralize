# DataPlatform User Guide

This guide is written for the local Docker stack in [`docker/local`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/local/README.md). It explains how to log in, connect the bundled sample datasources, run sample queries, and build teachable pipeline flows against the real sample schemas.

## Scope

This guide covers:

- local login and role assumptions
- PostgreSQL, MySQL, and REST datasource setup
- exact sample fields and connection values
- corrected SQL for the seeded schemas
- REST request examples for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- pipeline walkthroughs using `Source`, `Filter`, `Transform`, `Join`, and `Output`
- common error messages and what they mean
- Telegram trigger, template, and send setup for bot-driven flows

## Before You Start

Start the local stack:

```bash
cd docker/local
docker compose up --build
```

Open:

- frontend: `http://localhost:3000`
- backend health: `http://localhost:8080/health`
- sample REST API: `http://localhost:8090/health`

Log in with:

- username: `root`
- password: `123`

## Roles And Access

For the local sample environment, use the seeded `root` account. It is the safest account for this guide because it can reach the workspaces used here.

Practical rule for this guide:

- use `root` when connecting datasources, writing queries, and building pipelines

If your environment has stricter role policy later, use an account that can:

- open `Sources`
- open `Queries`
- open `Pipelines`
- save and run pipeline drafts

## Important Network Rule

Use `localhost:3000` only in your browser.

Inside datasource forms, use Docker service names:

- PostgreSQL host: `sample-postgres`
- MySQL host: `sample-mysql`
- REST base URL: `http://sample-rest:8090`

Why:

- your browser runs on your machine
- the app connects to datasources from inside Docker
- inside Docker, `localhost` points to the container itself, not your host machine

## Datasource Setup

### PostgreSQL datasource

Suggested source name:

- `Orders warehouse`

Field-by-field setup:

- `Source name`: internal label shown in the UI; required
- `Source type`: `PostgreSQL`
- `Host`: `sample-postgres`
- `Port`: `5432`
- `Database name`: `analytics`
- `Username`: `sample`
- `Password`: `sample`
- `Enable SSL`: off

Click path:

1. Open `Sources`.
2. Create a new source.
3. Fill the fields above.
4. Click `Test connection`.
5. Click `Save source`.

Expected PostgreSQL tables:

- `customers`
- `products`
- `orders`
- `invoices`
- `support_tickets`

### MySQL datasource

Suggested source name:

- `Fulfillment ledger`

Field-by-field setup:

- `Source name`: required label
- `Source type`: `MySQL`
- `Host`: `sample-mysql`
- `Port`: `3306`
- `Database name`: `analytics`
- `Username`: `sample`
- `Password`: `sample`

Click path:

1. Open `Sources`.
2. Create a new source.
3. Fill the fields above.
4. Click `Test connection`.
5. Click `Save source`.

Expected MySQL tables:

- `sales_reps`
- `shipments`
- `warehouse_stock`
- `refund_requests`
- `supplier_scorecards`

### REST datasource

Suggested source name:

- `Operations REST sample`

Field-by-field setup:

- `Source name`: required label
- `Source type`: `REST API`
- `Base URL`: `http://sample-rest:8090`
- `Auth type`: `None`

If your form shows auth-specific fields, leave them empty for the bundled sample.

REST auth field meanings:

- `API Key Header`: custom header name plus key value
- `Bearer Token`: token appended to `Authorization: Bearer`
- `Basic Auth`: username and password pair
- `Custom Headers`: one `Key: Value` line per header

Click path:

1. Open `Sources`.
2. Create a new source.
3. Fill the fields above.
4. Click `Test connection`.
5. Click `Save source`.

## Actual Sample Schemas

Use these field names exactly. Earlier placeholder examples that use names like `total_amount` or `ordered_at` do not match the current sample data.

### PostgreSQL

`customers`

- `id`
- `full_name`
- `segment`
- `country`
- `joined_at`
- `is_active`
- `lifetime_value`
- `profile` JSONB

`products`

- `id`
- `sku`
- `name`
- `category`
- `price`
- `inventory_count`
- `tags` text array

`orders`

- `id`
- `customer_id`
- `product_id`
- `order_code`
- `status`
- `quantity`
- `total`
- `currency`
- `placed_at`
- `metadata` JSONB

`invoices`

- `id`
- `order_id`
- `invoice_number`
- `due_date`
- `paid_at`
- `notes`

`support_tickets`

- `id`
- `customer_id`
- `priority`
- `opened_at`
- `resolved_at`
- `tags` JSONB
- `summary`

### MySQL

`sales_reps`

- `id`
- `rep_code`
- `full_name`
- `region`
- `quota`
- `active`
- `started_on`

`shipments`

- `id`
- `order_code`
- `sku`
- `warehouse_code`
- `carrier`
- `status`
- `shipped_at`
- `delivered_at`
- `weight_kg`
- `fragile`
- `tracking_payload` JSON

`warehouse_stock`

- `id`
- `warehouse_code`
- `sku`
- `bin_location`
- `quantity`
- `reorder_level`
- `updated_at`

`refund_requests`

- `id`
- `order_code`
- `external_ref`
- `reason`
- `amount`
- `requested_at`
- `approved`
- `context` JSON

`supplier_scorecards`

- `id`
- `supplier_name`
- `risk_level`
- `on_time_pct`
- `defect_rate_pct`
- `review_month`
- `notes`

### REST resources

Read endpoints:

- `GET /health`
- `GET /orders`
- `GET /orders/:id`
- `GET /customers`
- `GET /inventory`
- `GET /metrics`

Write endpoints:

- `POST /alerts`
- `PUT /orders/:id`
- `PATCH /orders/:id`
- `DELETE /drafts/:id`

## Shared Join Keys

The local datasets are intentionally aligned:

- PostgreSQL `orders.order_code` matches MySQL `shipments.order_code`
- PostgreSQL `orders.order_code` matches REST `orders[].orderCode`
- PostgreSQL `products.sku` matches MySQL `shipments.sku`
- PostgreSQL `products.sku` matches MySQL `warehouse_stock.sku`
- PostgreSQL `products.sku` matches REST `inventory[].sku`
- PostgreSQL `customers.id` matches REST customer and order customer references

When a join recipe asks for one common key, prefer:

- `order_code` for order and shipment flows
- `sku` for product and inventory flows

## Correct Sample SQL

### PostgreSQL starter queries

List recent orders:

```sql
SELECT order_code, status, total, currency, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 10;
```

Join orders to customers and products:

```sql
SELECT
  o.order_code,
  c.full_name,
  p.sku,
  p.name AS product_name,
  o.status,
  o.total,
  o.placed_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
ORDER BY o.placed_at DESC;
```

Paid revenue by country:

```sql
SELECT
  c.country,
  COUNT(*) AS paid_orders,
  SUM(o.total) AS paid_revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'paid'
GROUP BY c.country
ORDER BY paid_revenue DESC;
```

Read JSONB and arrays:

```sql
SELECT
  order_code,
  metadata->>'warehouse' AS warehouse,
  metadata->>'channel' AS sales_channel
FROM orders
ORDER BY placed_at DESC;
```

```sql
SELECT sku, name, tags
FROM products
WHERE 'connector' = ANY(tags);
```

Open invoices:

```sql
SELECT invoice_number, due_date, notes
FROM invoices
WHERE paid_at IS NULL
ORDER BY due_date ASC;
```

### MySQL starter queries

Shipments by warehouse:

```sql
SELECT order_code, sku, warehouse_code, status, shipped_at
FROM shipments
ORDER BY shipped_at DESC;
```

Low stock:

```sql
SELECT warehouse_code, sku, quantity, reorder_level
FROM warehouse_stock
WHERE quantity <= reorder_level;
```

Refund work queue:

```sql
SELECT order_code, external_ref, amount, approved, requested_at
FROM refund_requests
ORDER BY requested_at DESC;
```

Read JSON in MySQL:

```sql
SELECT
  order_code,
  JSON_EXTRACT(tracking_payload, '$.hub') AS hub,
  JSON_EXTRACT(tracking_payload, '$.serviceLevel') AS service_level
FROM shipments;
```

## REST Request Examples

These examples work against the bundled sample API directly. If the query or pipeline UI later exposes a structured REST builder, use the same method, path, headers, and JSON body there.

### GET orders

```bash
curl http://localhost:8090/orders
```

### GET metrics

```bash
curl http://localhost:8090/metrics
```

### POST alert

```bash
curl -X POST http://localhost:8090/alerts \
  -H 'content-type: application/json' \
  -d '{"severity":"high","code":"LOW_STOCK","message":"SKU-DB-210 below threshold"}'
```

### PUT order

```bash
curl -X PUT http://localhost:8090/orders/5004 \
  -H 'content-type: application/json' \
  -d '{"status":"paid","shipmentStatus":"in_transit","tags":["approval","released"],"shipping":{"carrier":"Royal Mail","region":"EMEA","warehouse":"GB04"}}'
```

### PATCH order

```bash
curl -X PATCH http://localhost:8090/orders/5003 \
  -H 'content-type: application/json' \
  -d '{"shipmentStatus":"returned","tags":["hardware","refund","warehouse-check"]}'
```

### DELETE draft

```bash
curl -X DELETE http://localhost:8090/drafts/9001
```

## Pipeline Basics

The current pipeline builder is draft-first:

- `Save` persists the graph and node settings
- `Run` executes the saved graph, not unsaved canvas changes
- `Output` requires exactly one upstream input
- `Join` requires exactly two upstream inputs
- preview rows appear only after a successful run

Practical habit:

1. edit node config
2. connect nodes
3. click `Save`
4. click `Run`
5. inspect the `Output` node

## Pipeline Walkthroughs

### 1. Source -> Output

Goal: confirm the PostgreSQL source works end to end.

1. Open `Pipelines`.
2. Create a new pipeline.
3. Name it `Orders smoke test`.
4. Add a `Source` node.
5. Add an `Output` node.
6. Connect `Source -> Output`.
7. Click the `Source` node.
8. Choose datasource `Orders warehouse`.
9. Enter:

```sql
SELECT order_code, status, total, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 10;
```

10. Click `Save`.
11. Click `Run`.
12. Click the `Output` node and inspect the preview.

Expected shape:

- one row per order
- columns for `order_code`, `status`, `total`, `placed_at`

### 2. Source -> Filter -> Output

Goal: keep only paid orders.

1. Build `Source -> Filter -> Output`.
2. Use this PostgreSQL query in `Source`:

```sql
SELECT order_code, status, total, currency, placed_at
FROM orders;
```

3. Configure `Filter` to keep rows where `status = paid`.
4. Click `Save`.
5. Click `Run`.
6. Open `Output`.

Expected result:

- only rows with `status = paid`
- no `pending`, `refunded`, or `cancelled` rows

### 3. Source -> Transform -> Output

Goal: reshape columns for downstream use.

1. Build `Source -> Transform -> Output`.
2. Use this PostgreSQL query:

```sql
SELECT order_code, status, total, currency, metadata->>'warehouse' AS warehouse
FROM orders;
```

3. Configure `Transform` to produce a cleaner output shape. Exact UI labels may vary, but the target shape should be:

- `order_id` from `order_code`
- `amount` from `total`
- `warehouse` unchanged
- `status` unchanged

4. Click `Save`.
5. Click `Run`.
6. Inspect `Output`.

Expected result:

- transformed column names
- same row count as source unless you add additional transform rules

### 4. Source + Source -> Join -> Output

Goal: join PostgreSQL orders with MySQL shipment state.

1. Make sure both `Orders warehouse` and `Fulfillment ledger` are saved.
2. Build a graph with two `Source` nodes, one `Join`, and one `Output`.
3. Connect:

- `Postgres Source -> Join`
- `MySQL Source -> Join`
- `Join -> Output`

4. PostgreSQL source query:

```sql
SELECT order_code, status AS order_status, total, currency
FROM orders
WHERE status IN ('paid', 'pending');
```

5. MySQL source query:

```sql
SELECT order_code, status AS shipment_status, carrier, warehouse_code
FROM shipments;
```

6. Configure `Join` to match `order_code` on both sides.
7. Click `Save`.
8. Click `Run`.
9. Inspect `Output`.

Expected result:

- orders enriched with shipment state
- matching rows for `ORD-1001` through `ORD-1008`

### 5. REST enrichment pipeline

Goal: combine DB product data with REST inventory.

Use this only when the product supports structured REST requests in queries or source nodes. The sample REST API is ready today, but your current UI may expose only connection-level setup.

Recommended graph:

- `Postgres Source -> Join`
- `REST Source -> Join`
- `Join -> Output`

PostgreSQL query:

```sql
SELECT sku, name, category, inventory_count
FROM products;
```

REST request:

- method: `GET`
- path: `/inventory`

Join key:

- `sku`

Expected result:

- product metadata from PostgreSQL
- warehouse availability from REST

### 6. Telegram notification flow

The local stack now includes Telegram integrations plus pipeline nodes for:

- `Telegram Trigger`
- `Telegram Template`
- `Telegram Send`

Recommended pattern:

- `Source -> Filter -> Transform/Template -> Telegram Send`

Starter alert query:

```sql
SELECT order_code, total, metadata->>'warehouse' AS warehouse
FROM orders
WHERE status = 'pending';
```

Suggested message template:

```text
Pending order {{order_code}} worth {{total}} is waiting in warehouse {{warehouse}}.
```

Setup steps:

1. Open `Integrations`.
2. Create a Telegram integration with:
   - `Display name`
   - `Bot token`
   - optional `Default chat ID`
   - optional `Webhook secret`
3. Save the integration.
4. Copy the generated webhook path and register it with BotFather or the Telegram Bot API on your public backend host.
5. In `Pipelines`, add either:
   - `Telegram Trigger -> Telegram Template -> Telegram Send -> Output`
   - or `Source -> Filter -> Transform -> Telegram Template -> Telegram Send -> Output`
6. For manual testing, add `Mock event JSON` on the trigger node, save, and run.

Working mock event JSON:

```json
{
  "telegram_chat_id": "999",
  "telegram_message_text": "/orders",
  "telegram_command": "/orders",
  "telegram_from_username": "operator"
}
```

## Troubleshooting

### `{"error":"validation_failed","fields":[{"field":"name","message":"name is required"}]}`

Meaning:

- the datasource `Source name` field is empty

Fix:

- click into `Source name`
- type a real value
- submit again

Note:

- placeholder text does not count as input

### `ERROR: column "total_amount" does not exist`

Meaning:

- the query uses an old or incorrect column name

Fix:

- use `total`, not `total_amount`
- use `placed_at`, not `ordered_at`
- use `name`, not `title`
- use `inventory_count`, not `stock_count`

### `output node requires exactly one input`

Meaning:

- the saved graph does not show exactly one edge flowing into `Output`

Fix:

1. connect one upstream node to `Output`
2. click `Save`
3. click `Run`

If the nodes only look close together, that is not enough. The edge must exist in the saved graph.

### `Run` ignores my latest edits

Meaning:

- you changed the canvas or node config but did not save first

Fix:

- click `Save`
- then click `Run`

### Connection fails when using `localhost`

Meaning:

- the app container is trying to connect to itself, not the sample service

Fix:

- PostgreSQL host: `sample-postgres`
- MySQL host: `sample-mysql`
- REST base URL: `http://sample-rest:8090`

## Next Reference

Use [`pipeline-cookbook.md`](/Users/phumrin/Documents/cubis_project/db-centralize/docs/pipeline-cookbook.md) when you want copy-paste recipes rather than the full guide narrative.
