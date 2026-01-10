# Redis-First Click Tracking Architecture (v2)

To verify implementation, run `k6 run src/tests/throughput-test.js`.

## 1. Core Concept: Zero-DB Request Path
The `/click` endpoint is the highest volume endpoint. To scale to 10k+ RPS, it MUST NOT touch MySQL (Disk I/O) in the critical path.
All reference data is cached in Redis (hash). All writes are buffered in Redis (streams).

## 2. Textual Data Flow Diagrams

### A. Click Internal Flow
```text
[Browser] -> GET /click
    |
    +-> [Node.js API]
         |
         +-> 1. Redis: Dedupe Check (SET NX EX 3) -> If Exists: Return Cached 302
         |
         +-> 2. Redis: Read Offer/Pub (Cache Hit?) -> If Miss: DB Read + Cache Set
         |
         +-> 3. Redis: Check Caps (GET stats:cap:...) -> If Limit: Return Fallback
         |
         +-> 4. Redis: Pipeline Write
         |      a. HSET click:{uuid} (Metadata)
         |      b. XADD stream:clicks (Queue)
         |      c. SET dedupe:redirect:{fingerprint} (Cache result)
         |
         +-> 5. Return HTTP 302 Redirect
```

### B. Worker Persistence Flow
```text
[Redis Stream] -> [Node.js Worker]
    |
    +-> 1. XREADGROUP (Batch 100)
    |
    +-> 2. Pipeline Fetch (HGETALL click:{uuid})
    |
    +-> 3. MySQL: Bulk INSERT IGNORE ... VALUES (...), (...), (...)
    |
    +-> 4. Redis: Check "conversion:{click_uuid}" (Pending Postbacks)
    |      |-> If Found: Insert Conversion to MySQL immediately
    |      |-> Redis: INCR stats (Revenue/Payout)
    |
    +-> 5. Redis: INCR stats (Clicks) for this batch
    |
    +-> 6. Redis: XACK (Acknowledge) + DEL keys
```

### C. Stats Flush Flow
```text
[Stats Worker] -> (Every 10s)
    |
    +-> 1. SCAN stats:offer:*:*:*
    |
    +-> 2. Pipeline GETSET (val, 0) -> Reset Redis counters to 0, get Delta
    |
    +-> 3. MySQL: Bulk INSERT ... ON DUPLICATE KEY UPDATE clicks = clicks + :delta
```

## 3. Key Guarantees
*   **Zero Loss**: Clicks are stored in Redis AOF (if configured) or Memory. Worker Retries indefinitely on DB failure.
*   **Late Postbacks**:
    *   If Click in DB: Standard DB Update.
    *   If Click in Redis (Stream): Postback saves to `conversion:{uuid}`. Worker picks it up when inserting click.
*   **Idempotency**:
    *   Clicks: Redis unique `SET NX` prevents instant duplicates. MySQL `INSERT IGNORE` prevents long-term duplicates.
    *   Conversions: MySQL Unique Constraint on `click_uuid`.
*   **Performance**: Redis Single-Threaded IO is extremely fast. Bottleneck moves to Network bandwidth.

## 4. Redis Key Schema

| Key | Type | Use | TTL |
| :--- | :--- | :--- | :--- |
| `ref:offer:{id}` | Hash | Offer details (url, caps, status) | 5m |
| `ref:publisher:{id}` | Hash | Publisher details | 5m |
| `click:{uuid}` | Hash | Full click metadata | 30m |
| `conversion:{uuid}` | String | Conversion waiting for click insert | 1h |
| `stats:offer:{id}:{date}:clicks` | String | Atomic Counter | 24h |
| `stats:offer:{id}:{date}:revenue` | String | Atomic Float Counter | 24h |
| `dedupe:click:{hash}` | String | 3-second deduplication lock | 3s |
| `stream:clicks` | Stream | FIFO queue for DB persistence | N/A |

