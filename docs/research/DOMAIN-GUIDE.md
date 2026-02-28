# Domain Connection Guide

Brewnet uses **Cloudflare Tunnel** to expose your home server to the internet — no port forwarding, no firewall rules, no static IP required.

---

## How It Works

```
Your server ──cloudflared──► Cloudflare Edge ──► Public URL
```

A lightweight `cloudflared` connector runs on your server and maintains an outbound connection to Cloudflare. Cloudflare assigns public hostnames that route external traffic back through the tunnel to your services. Your home IP is never exposed.

---

## Setup: Cloudflare Tunnel

> Reference: [Create a remote-managed tunnel (dashboard)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)

### Step 1 — Create a Cloudflare account

Go to **https://dash.cloudflare.com/sign-up** and register a free account.

Add your domain to Cloudflare if you have one (**Websites → Add a site**). This is required to publish public hostnames later.

### Step 2 — Create a new tunnel

1. Go to the Cloudflare Zero Trust dashboard: **https://one.dash.cloudflare.com**
2. Navigate to **Networks → Connectors → Cloudflare Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** as the connector type
5. Enter a tunnel name (e.g., `myserver`) and click **Save**
6. Cloudflare shows an install command — **copy the token** from that command

The install command looks like:
```
cloudflared service install eyJhIjoiMWY4ZjY...
```
The long string after `install ` is your connector token.

### Step 3 — Connect the tunnel via Brewnet

```bash
brewnet domain tunnel setup
```

Paste the token when prompted. Brewnet installs `cloudflared` as a Docker container and connects it to your Cloudflare tunnel. The tunnel status should change to **Healthy** in the dashboard.

### Step 4 — Publish your services

In the Cloudflare dashboard, go to your tunnel → **Published applications** tab → **Add**:

| Subdomain | Domain | Service (internal) |
|-----------|--------|-------------------|
| `www` | `yourdomain.com` | `http://traefik:80` |
| `files` | `yourdomain.com` | `http://nextcloud:80` |
| `git` | `yourdomain.com` | `http://gitea:3000` |

After saving, those URLs are immediately accessible from the internet.

---

## Verify tunnel status

```bash
brewnet domain tunnel status
```

Shows whether the `cloudflared` connector is running and connected.

---

## Brewnet commands

```bash
brewnet domain tunnel setup    # Enter or update the Cloudflare Tunnel token
brewnet domain tunnel status   # Check tunnel connection status
brewnet domain tunnel expose   # Add a public hostname to the tunnel
```
