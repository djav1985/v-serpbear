# Reverse Proxy and SSL

SerpBear listens on port 3000 inside the container. To serve it on your own domain with HTTPS, put a reverse proxy in front of it.

You need a server with SSH access and a domain name (for example `serpbear.yourdomain.com`) pointed at the server's IP address.

Whichever proxy you use:

1. Set `NEXT_PUBLIC_APP_URL` to the full HTTPS address, for example `https://serpbear.yourdomain.com`.
2. Set `TRUST_PROXY` to the number of proxies in front of the app, usually `1`. Without it every visitor shares the proxy's address, which breaks the login lockouts. See [Security](Security).
3. Make sure the proxy forwards the `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` headers, as in the examples below.

## Option A: Nginx

### Step 1: Install Nginx

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install nginx

# RHEL/CentOS/Fedora
sudo dnf install nginx
```

### Step 2: Create the site

```bash
sudo nano /etc/nginx/sites-available/serpbear
```

Use this, with your own domain. If you use the compose file from [Deploy with Docker](Deploy-with-Docker), the app is on host port 3030, so change the port below to match.

```nginx
server {
    listen 80;
    server_name serpbear.yourdomain.com;

    location / {
        proxy_pass http://localhost:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/serpbear /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 3: Add SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx   # Debian/Ubuntu
sudo certbot --nginx -d serpbear.yourdomain.com
```

Certbot updates the Nginx config to redirect HTTP to HTTPS. Check that renewal works:

```bash
sudo certbot renew --dry-run
```

### Step 4: Firewall (optional)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable
```

## Option B: Traefik

Traefik works with Docker directly and gets SSL certificates automatically.

### Step 1: Create a shared network

```bash
docker network create proxy
```

### Step 2: Start Traefik

In a new folder, create a `docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.3
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=proxy"
      - "--entryPoints.web.address=:80"
      - "--entryPoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=your-email@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entryPoints.web.http.redirections.entryPoint.to=websecure"
      - "--entryPoints.web.http.redirections.entryPoint.scheme=https"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt
    networks:
      - proxy

networks:
  proxy:
    external: true

volumes:
  traefik_letsencrypt:
```

Put your own email address in place of `your-email@example.com`, then run `docker compose up -d`.

### Step 3: Point SerpBear at Traefik

In SerpBear's compose file, remove `ports`, add the labels and join the `proxy` network. Replace the domain with yours:

```yaml
services:
  app:
    image: vontainment/v-serpbear:latest
    restart: unless-stopped
    environment:
      USER_NAME: admin
      PASSWORD: change-me
      SECRET: change-me-to-a-long-random-string
      APIKEY: change-me-to-another-long-random-string
      NEXT_PUBLIC_APP_URL: https://serpbear.yourdomain.com
      TRUST_PROXY: 1
      TZ: America/New_York
    volumes:
      - data:/app/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.serpbear.rule=Host(`serpbear.yourdomain.com`)"
      - "traefik.http.routers.serpbear.entrypoints=websecure"
      - "traefik.http.routers.serpbear.tls.certresolver=letsencrypt"
      - "traefik.http.services.serpbear.loadbalancer.server.port=3000"
    networks:
      - proxy

networks:
  proxy:
    external: true

volumes:
  data:
```

Run `docker compose up -d`. Traefik finds the container, gets a certificate from Let's Encrypt and routes `https://serpbear.yourdomain.com` to SerpBear.
