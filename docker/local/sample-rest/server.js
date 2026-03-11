const http = require("http")
const { URL } = require("url")

const baseOrders = [
  {
    id: 5001,
    orderCode: "ORD-1001",
    customerId: 1,
    sku: "SKU-ET-007",
    total: 1598.0,
    currency: "USD",
    status: "paid",
    shipmentStatus: "delivered",
    placedAt: "2025-02-01T08:15:00Z",
    tags: ["priority", "renewal"],
    shipping: { carrier: "DHL", region: "NA", warehouse: "SG01" },
  },
  {
    id: 5002,
    orderCode: "ORD-1002",
    customerId: 2,
    sku: "SKU-AN-001",
    total: 2490.0,
    currency: "USD",
    status: "paid",
    shipmentStatus: "delivered",
    placedAt: "2025-02-03T11:05:00Z",
    tags: ["self-serve"],
    shipping: { carrier: "FedEx", region: "APAC", warehouse: "US02" },
  },
  {
    id: 5003,
    orderCode: "ORD-1003",
    customerId: 3,
    sku: "SKU-HW-021",
    total: 1299.5,
    currency: "USD",
    status: "refunded",
    shipmentStatus: "exception",
    placedAt: "2025-02-05T19:35:00Z",
    tags: ["hardware", "refund"],
    shipping: { carrier: "UPS", region: "SEA", warehouse: "DE03" },
  },
  {
    id: 5004,
    orderCode: "ORD-1004",
    customerId: 4,
    sku: "SKU-SV-100",
    total: 3499.0,
    currency: "GBP",
    status: "pending",
    shipmentStatus: "queued",
    placedAt: "2025-02-08T09:40:00Z",
    tags: ["approval"],
    shipping: { carrier: "Royal Mail", region: "EMEA", warehouse: "GB04" },
  },
]

const baseCustomers = [
  {
    id: 1,
    fullName: "Ava Martinez",
    segment: "enterprise",
    active: true,
    contacts: 3,
    preferredChannel: "slack",
    locations: ["San Francisco", "New York"],
    owner: { name: "Mira Chen", region: "apac" },
  },
  {
    id: 2,
    fullName: "Noah Kim",
    segment: "mid-market",
    active: true,
    contacts: 1,
    preferredChannel: "email",
    locations: ["Singapore"],
    owner: { name: "Jonas Reed", region: "emea" },
  },
  {
    id: 3,
    fullName: "Lina Sok",
    segment: "startup",
    active: true,
    contacts: 2,
    preferredChannel: "telegram",
    locations: ["Phnom Penh"],
    owner: { name: "Mira Chen", region: "apac" },
  },
  {
    id: 4,
    fullName: "Owen Patel",
    segment: "enterprise",
    active: true,
    contacts: 4,
    preferredChannel: "phone",
    locations: ["London"],
    owner: { name: "Jonas Reed", region: "emea" },
  },
]

const baseInventory = [
  {
    sku: "SKU-AN-001",
    onHand: 84,
    reorderLevel: 20,
    warehouse: "SG01",
    dimensions: { widthCm: 12.2, heightCm: 4.8, depthCm: 1.9 },
    hazardous: false,
  },
  {
    sku: "SKU-HW-021",
    onHand: 7,
    reorderLevel: 5,
    warehouse: "US02",
    dimensions: { widthCm: 44.5, heightCm: 18.0, depthCm: 31.2 },
    hazardous: false,
  },
  {
    sku: "SKU-ET-007",
    onHand: 19,
    reorderLevel: 8,
    warehouse: "DE03",
    dimensions: null,
    hazardous: false,
  },
  {
    sku: "SKU-DB-210",
    onHand: 24,
    reorderLevel: 10,
    warehouse: "SG01",
    dimensions: { widthCm: 18.0, heightCm: 7.0, depthCm: 4.0 },
    hazardous: false,
  },
]

const baseDrafts = [
  { id: 9001, name: "promo-asia", channel: "telegram", active: false },
  { id: 9002, name: "finance-follow-up", channel: "email", active: false },
]

const alerts = []

let orders = clone(baseOrders)
let customers = clone(baseCustomers)
let inventory = clone(baseInventory)
let drafts = clone(baseDrafts)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" })
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
    })
    req.on("end", () => {
      if (raw.trim() === "") {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function parsePathname(req) {
  const url = new URL(req.url || "/", "http://localhost:8090")
  return url.pathname
}

function findOrderById(orderId) {
  return orders.find((item) => String(item.id) === String(orderId))
}

function metricsPayload() {
  const paidOrders = orders.filter((item) => item.status === "paid")
  const paidRevenue = paidOrders.reduce((sum, item) => sum + Number(item.total), 0)

  return {
    uptimePct: 99.94,
    activeCustomers: customers.filter((item) => item.active).length,
    paidOrders: paidOrders.length,
    paidRevenue,
    generatedAt: "2025-03-11T00:00:00Z",
    alerts: alerts.slice(-5),
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = parsePathname(req)
  const method = req.method || "GET"

  if ((pathname === "/" || pathname === "/health") && (method === "GET" || method === "HEAD")) {
    if (method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end()
      return
    }

    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === "/orders" && method === "GET") {
    sendJson(res, 200, orders)
    return
  }

  if (pathname === "/customers" && method === "GET") {
    sendJson(res, 200, customers)
    return
  }

  if (pathname === "/inventory" && method === "GET") {
    sendJson(res, 200, inventory)
    return
  }

  if (pathname === "/metrics" && method === "GET") {
    sendJson(res, 200, metricsPayload())
    return
  }

  if (pathname === "/alerts" && method === "POST") {
    try {
      const body = await readJsonBody(req)
      const alert = {
        id: 7000 + alerts.length + 1,
        severity: body.severity || "info",
        code: body.code || "CUSTOM_ALERT",
        message: body.message || "Alert created from sample API",
        open: body.open !== false,
        createdAt: "2025-03-11T00:00:00Z",
      }
      alerts.push(alert)
      sendJson(res, 201, alert)
    } catch {
      sendJson(res, 400, { error: "invalid_json" })
    }
    return
  }

  const orderMatch = pathname.match(/^\/orders\/(\d+)$/)
  if (orderMatch && method === "GET") {
    const order = findOrderById(orderMatch[1])
    if (!order) {
      sendJson(res, 404, { error: "not_found", resource: "order" })
      return
    }
    sendJson(res, 200, order)
    return
  }

  if (orderMatch && method === "PUT") {
    const order = findOrderById(orderMatch[1])
    if (!order) {
      sendJson(res, 404, { error: "not_found", resource: "order" })
      return
    }

    try {
      const body = await readJsonBody(req)
      const nextOrder = {
        ...order,
        status: body.status ?? order.status,
        shipmentStatus: body.shipmentStatus ?? order.shipmentStatus,
        tags: Array.isArray(body.tags) ? body.tags : order.tags,
        shipping:
          body.shipping && typeof body.shipping === "object"
            ? { ...order.shipping, ...body.shipping }
            : order.shipping,
      }
      orders = orders.map((item) => (item.id === order.id ? nextOrder : item))
      sendJson(res, 200, nextOrder)
    } catch {
      sendJson(res, 400, { error: "invalid_json" })
    }
    return
  }

  if (orderMatch && method === "PATCH") {
    const order = findOrderById(orderMatch[1])
    if (!order) {
      sendJson(res, 404, { error: "not_found", resource: "order" })
      return
    }

    try {
      const body = await readJsonBody(req)
      const nextOrder = {
        ...order,
        ...Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined)
        ),
      }
      orders = orders.map((item) => (item.id === order.id ? nextOrder : item))
      sendJson(res, 200, nextOrder)
    } catch {
      sendJson(res, 400, { error: "invalid_json" })
    }
    return
  }

  const draftMatch = pathname.match(/^\/drafts\/(\d+)$/)
  if (draftMatch && method === "DELETE") {
    const draftId = Number(draftMatch[1])
    const existing = drafts.find((item) => item.id === draftId)
    if (!existing) {
      sendJson(res, 404, { error: "not_found", resource: "draft" })
      return
    }

    drafts = drafts.filter((item) => item.id !== draftId)
    sendJson(res, 200, { deleted: true, id: draftId, remainingDrafts: drafts.length })
    return
  }

  sendJson(res, 404, { error: "not_found", method, path: pathname })
})

server.listen(8090, "0.0.0.0", () => {
  console.log("sample-rest listening on 8090")
})
