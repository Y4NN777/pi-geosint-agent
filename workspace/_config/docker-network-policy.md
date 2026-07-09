# Docker Network Policy

## Layer

This applies at the Docker Compose or container runtime level. It is not a firewall rule on the host — it configures the container's network egress/inbound behavior.

## Allowed Egress Domains

The container may make outbound HTTPS connections to:

| Domain | Purpose | Required for |
|--------|---------|--------------|
| `kartaview.org` | KartaView API and photo URLs | Stages 02, 03 |
| `nominatim.openstreetmap.org` | Geocoding (Nominatim) | Stage 01 |
| `api.openstreetmap.org` | OSM OAuth token refresh | Auth |
| Provider API domains | LLM provider endpoints (Anthropic, DeepSeek, OpenRouter, etc.) | Stages 01, 02 |

All other outbound traffic should be denied at the network layer.

## Inbound Ports

| Port | Protocol | Bind Address | Purpose |
|------|----------|--------------|---------|
| `8080` | TCP | `127.0.0.1` | Web UI (internal only — not exposed to LAN) |

No other ports are exposed. The web UI port is bound to `127.0.0.1` (loopback only) so it is not accessible from other machines on the network.

## Implementation Notes (Docker Compose)

```yaml
services:
  geo-osint:
    # ...
    ports:
      - "127.0.0.1:8080:8080"
    extra_hosts:
      - "kartaview.org:xxx.xxx.xxx.xxx"   # optional pinning
    # Network-level egress filtering requires Docker networking
    # or iptables on the host. For v1, document intent here
    # but implement only port binding and rely on the container
    # not having unnecessary tools (curl to arbitrary hosts, etc.).
```

## V1 Scope

For v1, the network policy is implemented as:
1. Port binding to `127.0.0.1` only.
2. Minimal base image with no unnecessary network tools.
3. Documented egress allowlist for review.

Full egress filtering (via `docker network --internal` or iptables) is v2.
