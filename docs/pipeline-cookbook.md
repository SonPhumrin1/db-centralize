# Pipeline Cookbook

This file is the quick-reference companion to [`user-guide.md`](/Users/phumrin/Documents/cubis_project/db-centralize/docs/user-guide.md). Every recipe here is grounded to the local sample schemas in `docker/local`.

## Rules That Apply To Every Recipe

- click `Save` before `Run`
- `Output` must have exactly one inbound edge
- `Join` must have exactly two inbound edges
- use saved datasource records, not unsaved connection drafts
- use Docker service names in datasource setup, never `localhost`

Recommended saved sources before you start:

- PostgreSQL source: `Orders warehouse`
- MySQL source: `Fulfillment ledger`
- REST source: `Operations REST sample`

## Recipe 1: PostgreSQL Smoke Test

Graph:

- `Source -> Output`

Purpose:

- verify the PostgreSQL source and output preview work

Source datasource:

- `Orders warehouse`

Source query:

```sql
SELECT order_code, status, total, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 10;
```

Expected preview:

- recent orders
- fields: `order_code`, `status`, `total`, `placed_at`

## Recipe 2: Paid Orders Filter

Graph:

- `Source -> Filter -> Output`

Purpose:

- narrow the dataset to paid orders only

Source datasource:

- `Orders warehouse`

Source query:

```sql
SELECT order_code, status, total, currency, placed_at
FROM orders;
```

Filter goal:

- keep rows where `status = paid`

Expected preview:

- rows for `ORD-1001`, `ORD-1002`, `ORD-1005`, `ORD-1006`, `ORD-1008`, `ORD-1010`

## Recipe 3: Revenue Transform

Graph:

- `Source -> Transform -> Output`

Purpose:

- reshape fields for reporting or endpoint output

Source datasource:

- `Orders warehouse`

Source query:

```sql
SELECT
  order_code,
  status,
  total,
  currency,
  metadata->>'warehouse' AS warehouse,
  metadata->>'channel' AS sales_channel
FROM orders
WHERE status = 'paid';
```

Transform target:

- rename `order_code` to `order_id`
- rename `total` to `amount`
- keep `currency`
- keep `warehouse`
- keep `sales_channel`

Expected preview:

- only paid rows
- cleaned output keys suitable for downstream APIs or alerts

## Recipe 4: Orders Joined To Shipments

Graph:

- `Postgres Source -> Join -> Output`
- `MySQL Source -> Join`

Purpose:

- enrich order records with shipment progress

Postgres source datasource:

- `Orders warehouse`

Postgres source query:

```sql
SELECT
  order_code,
  status AS order_status,
  total,
  currency,
  metadata->>'warehouse' AS planned_warehouse
FROM orders
WHERE status IN ('paid', 'pending');
```

MySQL source datasource:

- `Fulfillment ledger`

MySQL source query:

```sql
SELECT
  order_code,
  status AS shipment_status,
  carrier,
  warehouse_code,
  fragile
FROM shipments;
```

Join config:

- left key: `order_code`
- right key: `order_code`

Expected preview:

- matched rows for `ORD-1001` through `ORD-1008`
- combined order and fulfillment status

Useful validation query after the join:

- check that `planned_warehouse` and `warehouse_code` line up for most rows

## Recipe 5: Products Joined To Warehouse Stock

Graph:

- `Postgres Source -> Join -> Output`
- `MySQL Source -> Join`

Purpose:

- combine product metadata with warehouse stock quantities

Postgres source query:

```sql
SELECT sku, name, category, inventory_count
FROM products;
```

MySQL source query:

```sql
SELECT warehouse_code, sku, quantity, reorder_level
FROM warehouse_stock;
```

Join config:

- left key: `sku`
- right key: `sku`

Expected preview:

- one row per SKU and warehouse stock row
- fields from both product catalog and stock positions

## Recipe 6: Refund Work Queue

Graph:

- `MySQL Source -> Filter -> Output`

Purpose:

- isolate unapproved refund requests

MySQL source datasource:

- `Fulfillment ledger`

MySQL source query:

```sql
SELECT order_code, external_ref, amount, approved, requested_at
FROM refund_requests;
```

Filter goal:

- keep rows where `approved = 0`

Expected preview:

- open refund requests for `ORD-1003` and `ORD-1004`

## Recipe 7: PostgreSQL Support Queue

Graph:

- `Source -> Filter -> Output`

Purpose:

- identify unresolved high-priority tickets

Source datasource:

- `Orders warehouse`

Source query:

```sql
SELECT
  id,
  priority,
  opened_at,
  resolved_at,
  summary,
  tags
FROM support_tickets;
```

Filter goal:

- unresolved rows: `resolved_at` is empty or null
- priority rows: `priority = high`

Expected preview:

- high-priority unresolved ticket rows including the refund-related case

## Recipe 8: REST Inventory Enrichment

Graph:

- `Postgres Source -> Join -> Output`
- `REST Source -> Join`

Purpose:

- enrich product catalog rows with REST warehouse inventory

This recipe depends on the app exposing structured REST requests in queries or source-node config. The sample API already supports the needed endpoint, but the UI may not yet provide the request builder.

Postgres source query:

```sql
SELECT sku, name, category, inventory_count
FROM products;
```

REST request:

- method: `GET`
- path: `/inventory`

Join config:

- left key: `sku`
- right key: `sku`

Expected preview:

- product identity from PostgreSQL
- warehouse-specific availability from REST

## Recipe 9: REST Metrics Snapshot

Graph:

- `REST Source -> Output`

Purpose:

- preview operational metrics from the sample API

REST request:

- method: `GET`
- path: `/metrics`

Expected preview:

- `uptimePct`
- `activeCustomers`
- `paidOrders`
- `paidRevenue`
- `generatedAt`
- `alerts`

## Recipe 10: REST Write Method Checks

Use these in the app’s REST request builder or with `curl` if you want to confirm the fixture service directly.

POST alert:

```bash
curl -X POST http://localhost:8090/alerts \
  -H 'content-type: application/json' \
  -d '{"severity":"high","code":"LOW_STOCK","message":"SKU-DB-210 below threshold"}'
```

PUT order:

```bash
curl -X PUT http://localhost:8090/orders/5004 \
  -H 'content-type: application/json' \
  -d '{"status":"paid","shipmentStatus":"in_transit","tags":["approval","released"],"shipping":{"carrier":"Royal Mail","region":"EMEA","warehouse":"GB04"}}'
```

PATCH order:

```bash
curl -X PATCH http://localhost:8090/orders/5003 \
  -H 'content-type: application/json' \
  -d '{"shipmentStatus":"returned","tags":["hardware","refund","warehouse-check"]}'
```

DELETE draft:

```bash
curl -X DELETE http://localhost:8090/drafts/9001
```

## Recipe 11: Telegram Notification Flow

Target graph:

- `Source -> Filter -> Transform or Template -> Telegram Send`
- or `Telegram Trigger -> Telegram Template -> Telegram Send -> Output`

Recommended source query:

```sql
SELECT
  order_code,
  total,
  currency,
  metadata->>'warehouse' AS warehouse
FROM orders
WHERE status = 'pending';
```

Suggested message template:

```text
Pending order {{order_code}} worth {{total}} {{currency}} is waiting in warehouse {{warehouse}}.
```

Telegram node setup:

- create a Telegram integration in `Integrations`
- point `Telegram Send` at that saved integration
- leave `Override chat ID` empty to use the integration’s default chat
- set `Message field` to `telegram_message`

Manual trigger test:

- add a `Telegram Trigger`
- select the saved integration
- set `Command filter` to `/orders`
- paste this `Mock event JSON`:

```json
{
  "telegram_chat_id": "999",
  "telegram_message_text": "/orders",
  "telegram_command": "/orders",
  "telegram_from_username": "operator"
}
```

Expected result:

- the run succeeds without a live webhook
- the template writes `telegram_message`
- the send node uses the configured chat and records delivery fields on the output row

## Common Errors

### `name is required`

Cause:

- the source label is empty

Fix:

- type a real `Source name`; placeholder text is not enough

### `column does not exist`

Cause:

- the query uses an old field name

Use the current names:

- `total`, not `total_amount`
- `placed_at`, not `ordered_at`
- `name`, not `title`
- `inventory_count`, not `stock_count`
- `order_code`, not `order_ref`

### `output node requires exactly one input`

Cause:

- no edge or too many edges are connected to `Output`

Fix:

- connect exactly one upstream node
- save again
- rerun

### Join has no rows

Cause:

- join keys do not match or the wrong fields were selected

Fix:

- use `order_code` for order and shipment joins
- use `sku` for product and inventory joins
- verify both upstream sources emit the join column with the same spelling
