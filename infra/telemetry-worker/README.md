# Brewnet Telemetry Worker

Anonymous install counter running on Cloudflare Workers + KV.

## Setup

### 1. Install wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create KV namespace

```bash
cd infra/telemetry-worker
wrangler kv namespace create "INSTALL_COUNTS"
```

Copy the output `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "INSTALL_COUNTS"
id = "<paste-id-here>"
```

### 3. Deploy

```bash
npm install
npm run deploy
```

### 4. Custom domain (optional)

Uncomment the `routes` block in `wrangler.toml` and set your zone:

```toml
routes = [
  { pattern = "api.brewnet.dev/*", zone_name = "brewnet.dev" }
]
```

Or add a CNAME in Cloudflare DNS:
- `api` → `brewnet-telemetry.<account>.workers.dev` (Proxied)

### 5. Verify

```bash
# Test install ping
curl "https://api.brewnet.dev/telemetry/install?v=0.1.0&os=macOS&source=curl"

# Check stats
curl "https://api.brewnet.dev/telemetry/stats"

# Daily breakdown
curl "https://api.brewnet.dev/telemetry/stats/details?days=7"
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/telemetry/install?v=&os=&source=` | Record an install (called by install.sh / npm postinstall) |
| GET | `/telemetry/stats` | Total, today, OS, source breakdown |
| GET | `/telemetry/stats/details?days=30` | Daily counts + version breakdown |

## Cost

Free tier covers 100k requests/day + 1k KV writes/day.
