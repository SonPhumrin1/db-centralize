# Local Docker Stack

This folder runs the full local DataPlatform stack plus three sample datasource targets:

- `sample-postgres`: commerce and support data in PostgreSQL
- `sample-mysql`: fulfillment and warehouse data in MySQL
- `sample-rest`: mutable fake REST API with read and write endpoints

The samples are deterministic and share business keys so you can test joins and pipelines without editing seed files.

## Start The Stack

```bash
cd docker/local
docker compose up --build
```

Open these URLs on your machine:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`
- Sample REST API: `http://localhost:8090`

Login credentials:

- Username: `root`
- Password: `123`

Use the browser only for `localhost:3000`. Inside datasource forms, use Docker service names, not `localhost`.

## Browser State For Visual Checks

When you compare screenshots or automate the UI with Playwright, start from a clean browser profile or reset the sidebar preference keys first.

- clear `dashboard-sidebar-mode`
- clear `dashboard-sidebar-manual-collapsed`
- choose light or dark mode intentionally before comparing visuals

Fresh browser state starts with the desktop sidebar in auto mode. If you reuse a browser profile, persisted theme and sidebar settings can make Docker-local screenshots look different from a clean test run.

## Why Service Names Matter

The app runs inside Docker. From that container:

- `localhost` means the frontend container itself
- `sample-postgres` means the Postgres sample service
- `sample-mysql` means the MySQL sample service
- `sample-rest` means the REST sample service

If you enter `localhost` in a datasource form, the connection usually points at the wrong place.

## Sample Datasource Values

### PostgreSQL

- `Name`: `Orders warehouse`
- `Type`: `PostgreSQL`
- `Host`: `sample-postgres`
- `Port`: `5432`
- `Database name`: `analytics`
- `Username`: `sample`
- `Password`: `sample`
- `Enable SSL`: off

### MySQL

- `Name`: `Fulfillment ledger`
- `Type`: `MySQL`
- `Host`: `sample-mysql`
- `Port`: `3306`
- `Database name`: `analytics`
- `Username`: `sample`
- `Password`: `sample`

### REST API

- `Name`: `Operations REST sample`
- `Type`: `REST API`
- `Base URL`: `http://sample-rest:8090`
- `Auth type`: `None`

Important for REST:

- use the root base URL exactly: `http://sample-rest:8090`
- do not use `http://sample-rest:8090/orders` as the datasource base URL
- do not use `localhost` inside the source form
- keep `Auth type = None`

If the REST form shows extra auth fields, leave them empty for the bundled sample.

## Step By Step: Add Each Datasource

### PostgreSQL source

1. Open `http://localhost:3000/login`.
2. Sign in with `root / 123`.
3. Open `Sources`.
4. Start a new source.
5. Enter `Name = Orders warehouse`.
6. Choose `Source type = PostgreSQL`.
7. Enter `Host = sample-postgres`.
8. Enter `Port = 5432`.
9. Enter `Database name = analytics`.
10. Enter `Username = sample`.
11. Enter `Password = sample`.
12. Leave `Enable SSL` unchecked.
13. Click `Test connection`.
14. Click `Save source`.

Expected tables:

- `customers`
- `products`
- `orders`
- `invoices`
- `support_tickets`

### MySQL source

1. Open `Sources`.
2. Start a new source.
3. Enter `Name = Fulfillment ledger`.
4. Choose `Source type = MySQL`.
5. Enter `Host = sample-mysql`.
6. Enter `Port = 3306`.
7. Enter `Database name = analytics`.
8. Enter `Username = sample`.
9. Enter `Password = sample`.
10. Click `Test connection`.
11. Click `Save source`.

Expected tables:

- `sales_reps`
- `shipments`
- `warehouse_stock`
- `refund_requests`
- `supplier_scorecards`

### REST source

1. Open `Sources`.
2. Start a new source.
3. Enter `Name = Operations REST sample`.
4. Choose `Source type = REST API`.
5. Enter `Base URL = http://sample-rest:8090`.
6. Set `Auth type = None`.
7. Leave auth-only fields empty.
8. Click `Test connection`.
9. Click `Save source`.

Expected result:

- connection test succeeds against the sample API root
- later REST requests use relative paths like `/orders` or `/metrics`

## Field Guide

### Common fields

- `Name`: your internal label for the datasource; this is required
- `Type`: decides which connection fields appear

### PostgreSQL and MySQL fields

- `Host`: Docker service name or reachable hostname
- `Port`: database port
- `Database name`: target database inside the server
- `Username`: login for that database
- `Password`: password for that user
- `Enable SSL`: PostgreSQL only; keep off for the bundled sample

### REST fields

- `Base URL`: root URL for the API
- `Auth type`: authentication mode used for outgoing requests

REST auth modes in the UI:

- `None`
- `API Key Header`
- `Bearer Token`
- `Basic Auth`
- `Custom Headers`

If you switch away from `None`, the form may request:

- `Header name` and `API key`
- `Bearer token`
- `Username` and `Password`
- one `Key: Value` header per line

The bundled REST sample does not require any of those.

## Full Verification Flow

Use this if you want one clean end-to-end test after rebuilding Docker.

### 1. Sign in

1. Open `http://localhost:3000/login`.
2. Sign in with:
   - username: `root`
   - password: `123`

### 2. Add PostgreSQL source

1. Open `Sources`.
2. Click `Add source`.
3. Fill:
   - `Source name`: `Orders warehouse`
   - `Source type`: `PostgreSQL`
   - `Host`: `sample-postgres`
   - `Port`: `5432`
   - `Database name`: `analytics`
   - `Username`: `sample`
   - `Password`: `sample`
   - `Enable SSL`: off
4. Click `Test connection`.
5. Click `Save source`.

### 3. Add MySQL source

1. Click `Add source`.
2. Fill:
   - `Source name`: `Fulfillment ledger`
   - `Source type`: `MySQL`
   - `Host`: `sample-mysql`
   - `Port`: `3306`
   - `Database name`: `analytics`
   - `Username`: `sample`
   - `Password`: `sample`
3. Click `Test connection`.
4. Click `Save source`.

### 4. Add REST source

1. Click `Add source`.
2. Fill:
   - `Source name`: `Operations REST sample`
   - `Source type`: `REST API`
   - `Base URL`: `http://sample-rest:8090`
   - `Auth type`: `None`
3. Leave all auth-only fields empty.
4. Click `Test connection`.
5. Click `Save source`.

If REST test fails:

- confirm you used `http://sample-rest:8090`
- do not append `/orders` or `/health` in the datasource form
- do not use `localhost`
- keep auth as `None`

### 5. Run a PostgreSQL query

1. Open `Queries`.
2. Click `New query`.
3. Set:
   - `Query name`: `Recent orders`
   - `Data source`: `Orders warehouse`
4. Paste:

```sql
SELECT order_code, status, total, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 10;
```

5. Click `Run`.
6. Confirm rows appear.
7. Click `Save query`.

### 6. Run a REST request

1. Stay in `Queries`.
2. Click `New query`.
3. Set:
   - `Query name`: `REST metrics`
   - `Data source`: `Operations REST sample`
4. In the REST request builder set:
   - `Method`: `GET`
   - `Path`: `/metrics`
5. Click `Run`.
6. Confirm one metrics row appears with fields like:
   - `activeCustomers`
   - `paidOrders`
   - `paidRevenue`
   - `generatedAt`

For another REST check use:

- `Method`: `GET`
- `Path`: `/orders`

### 7. Build a simple pipeline

1. Open `Pipelines`.
2. Create a pipeline named `Orders smoke test`.
3. Add nodes:
   - `Source`
   - `Output`
4. Connect `Source -> Output`.
5. Click the `Source` node and set:
   - `Data source`: `Orders warehouse`
   - `SQL query`:

```sql
SELECT order_code, status, total
FROM orders
LIMIT 10;
```

6. Click `Save`.
7. Click `Run`.
8. Click `Output` and confirm preview rows appear.

### 8. Build a join pipeline

1. Create a second pipeline named `Orders with shipments`.
2. Add:
   - `Source`
   - `Source`
   - `Join`
   - `Output`
3. Connect:
   - Postgres `Source -> Join`
   - MySQL `Source -> Join`
   - `Join -> Output`
4. Configure Postgres source:

```sql
SELECT order_code, status, total, currency
FROM orders;
```

5. Configure MySQL source:

```sql
SELECT order_code, carrier, warehouse_code, status AS shipment_status
FROM shipments;
```

6. Configure `Join`:
   - `Join key`: `order_code`
   - `Join type`: `inner`
7. Click `Save`.
8. Click `Run`.
9. Click `Output`.

Expected output:

- Postgres order fields
- MySQL shipment fields
- if both sides have `status`, the right-side value may appear as `right_status`

### 9. Build a REST pipeline

1. Create a pipeline named `Inventory API check`.
2. Add:
   - `Source`
   - `Output`
3. Connect `Source -> Output`.
4. Configure source:
   - `Data source`: `Operations REST sample`
   - `Method`: `GET`
   - `Path`: `/inventory`
5. Click `Save`.
6. Click `Run`.
7. Click `Output`.

Expected output fields:

- `sku`
- `onHand`
- `reorderLevel`
- `warehouse`

### 10. Test Telegram pipeline manually

1. Open `Integrations`.
2. Add a Telegram integration with:
   - `Display name`: `Local bot`
   - `Bot token`: your real bot token
   - optional `Default chat ID`
   - optional `Webhook secret`
3. Save it.
4. Open `Pipelines`.
5. Create a pipeline named `Telegram dry run`.
6. Add:
   - `Telegram Trigger`
   - `Telegram Template`
   - `Telegram Send`
   - `Output`
7. Connect:
   - `Telegram Trigger -> Telegram Template`
   - `Telegram Template -> Telegram Send`
   - `Telegram Send -> Output`
8. Configure `Telegram Trigger`:
   - select your saved integration
   - `Command filter`: `/orders`
   - `Mock event JSON`:

```json
{
  "telegram_chat_id": "999",
  "telegram_message_text": "/orders",
  "telegram_command": "/orders",
  "telegram_from_username": "operator"
}
```

9. Configure `Telegram Template`:
   - `Output field`: `telegram_message`
   - `Message template`: `Manual test from {{telegram_from_username}}`
10. Configure `Telegram Send`:
   - select the same integration
   - `Message field`: `telegram_message`
11. Click `Save`.
12. Click `Run`.

If your bot token and chat ID are valid, the message is sent. If you only want to validate the pipeline shape first, stop after configuring the trigger and template and inspect the output row before enabling live sends.

## Real Sample Schema

### PostgreSQL tables

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

### MySQL tables

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

The sample data is arranged so these values line up across systems:

- `orders.order_code` in PostgreSQL matches `shipments.order_code` in MySQL
- `orders.order_code` in PostgreSQL matches `orderCode` in REST orders
- `products.sku` in PostgreSQL matches `shipments.sku` and `warehouse_stock.sku` in MySQL
- `products.sku` in PostgreSQL matches `sku` in REST inventory
- `customers.id` in PostgreSQL matches `customerId` in REST orders and `id` in REST customers

Use `order_code` and `sku` first when testing join pipelines.

## Quick SQL Checks

### PostgreSQL

```sql
SELECT order_code, status, total, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 5;
```

```sql
SELECT o.order_code, c.full_name, p.sku, p.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
ORDER BY o.placed_at DESC;
```

### MySQL

```sql
SELECT order_code, sku, warehouse_code, status, shipped_at
FROM shipments
ORDER BY shipped_at DESC;
```

```sql
SELECT warehouse_code, sku, quantity, reorder_level
FROM warehouse_stock
WHERE quantity <= reorder_level;
```

## REST Checks

Use these from any HTTP client, or from the app later when structured REST requests are supported in the query and pipeline UI.

### GET

```bash
curl http://localhost:8090/orders
```

### POST

```bash
curl -X POST http://localhost:8090/alerts \
  -H 'content-type: application/json' \
  -d '{"severity":"high","code":"LOW_STOCK","message":"SKU-DB-210 below threshold"}'
```

### PUT

```bash
curl -X PUT http://localhost:8090/orders/5004 \
  -H 'content-type: application/json' \
  -d '{"status":"paid","shipmentStatus":"in_transit","tags":["approval","released"],"shipping":{"carrier":"Royal Mail","region":"EMEA","warehouse":"GB04"}}'
```

### PATCH

```bash
curl -X PATCH http://localhost:8090/orders/5003 \
  -H 'content-type: application/json' \
  -d '{"shipmentStatus":"returned","tags":["hardware","refund","warehouse-check"]}'
```

### DELETE

```bash
curl -X DELETE http://localhost:8090/drafts/9001
```

## Reset App Authored Data

Use this when you want to wipe authored runtime data from the app database but keep the user account, auth records, and settings.

From `docker/local` run:

```bash
docker compose exec postgres psql -U dp -d dataplatform -c "TRUNCATE endpoints, pipeline_runs, pipelines, queries, data_sources, telegram_integrations RESTART IDENTITY;"
```

This removes:

- data sources
- queries
- endpoints
- pipelines
- pipeline runs
- telegram integrations

This keeps:

- users
- sessions
- accounts
- system settings

## Pipeline Notes

For the current pipeline builder:

- `Run` executes the last saved graph
- click `Save` before every `Run`
- `Output` requires exactly one inbound connection
- `Join` requires exactly two inbound connections

Starter flow:

1. Add a `Source` node.
2. Set the PostgreSQL datasource to `Orders warehouse`.
3. Use `SELECT * FROM orders LIMIT 10`.
4. Connect `Source -> Output`.
5. Click `Save`.
6. Click `Run`.
7. Click the `Output` node to inspect rows.

See [`docs/user-guide.md`](/Users/phumrin/Documents/cubis_project/db-centralize/docs/user-guide.md) for the full walkthrough and [`docs/pipeline-cookbook.md`](/Users/phumrin/Documents/cubis_project/db-centralize/docs/pipeline-cookbook.md) for copy-paste recipes.
