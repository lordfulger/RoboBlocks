# HTTPS for your RoboBlocks servers

Without HTTPS, everything between players and your server — including account passwords — crosses the internet
unencrypted. Put a small web server in front of the game and players get `https://play.example.com` with no port
number. The game switches its live connection to encrypted WebSockets (`wss://`) on its own.

You need:

- a domain with A records pointing at the machine (for example `play.example.com` and `hub.example.com`);
- ports **80 and 443** open on that machine's firewall;
- root (SSH) access to the machine.

The RoboBlocks servers keep running on their Pterodactyl ports (for example 12001 and 12000). The web server listens
on 443 and passes traffic through to them.

## Option A: the machine also runs the Pterodactyl panel (nginx is already there)

1. Get certificates (certbot is usually already installed with the panel):

   ```bash
   sudo certbot certonly --nginx -d play.example.com -d hub.example.com
   ```

2. Copy [`https/nginx-roboblocks.conf`](https/nginx-roboblocks.conf) to `/etc/nginx/sites-available/roboblocks.conf`,
   replace the domains and ports, then enable it:

   ```bash
   sudo ln -s /etc/nginx/sites-available/roboblocks.conf /etc/nginx/sites-enabled/roboblocks.conf
   ```

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Option B: nothing else uses ports 80/443 (Caddy, simplest)

1. Install Caddy (<https://caddyserver.com/docs/install>).
2. Put [`https/Caddyfile`](https/Caddyfile) at `/etc/caddy/Caddyfile`, replace the domains and ports, then:

   ```bash
   sudo systemctl reload caddy
   ```

   Caddy fetches and renews the certificates by itself.

## Then, in the panel (Startup tab of each RoboBlocks server)

| Variable | Value |
|---|---|
| `BC_TRUST_PROXY` | `1` (so the server sees players' real addresses and knows it is behind HTTPS) |
| `BC_PUBLIC_URL` | `https://play.example.com` (or `https://hub.example.com` on the hub) |
| `BC_HUB_URL` | `https://hub.example.com` (on servers that report to the hub) |

Restart the servers. Players now open `https://play.example.com`. The desktop app's built-in address can be changed to
the HTTPS one in `desktop/package.json` (`roboblocks.defaultServer`) for the next desktop release.

## If something does not work

- **The page loads but says "Connection lost"**: the proxy is not passing WebSockets. The `Upgrade` / `Connection`
  lines in the nginx config are what do that.
- **502 Bad Gateway**: the proxy cannot reach the game port. If the server's allocation is bound to the machine's
  public IP rather than `0.0.0.0`, use that IP instead of `127.0.0.1` in the config.
- **Certificate errors**: the A records must point at this machine and port 80 must be open while the certificate is
  issued.
