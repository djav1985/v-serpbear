# Deploy with Docker

This works the same on your own computer and on a server. It uses the image [`vontainment/v-serpbear`](https://hub.docker.com/r/vontainment/v-serpbear) on Docker Hub, where you can also see the available tags: `latest` for the newest stable release, a version number such as `6.0.0` for a specific release, and `beta` for the opt-in beta build.

## Step 1: Install Docker

Install Docker Engine by following the official Docker installation guide for your system. Docker Compose is included with current versions. Check it:

```bash
docker --version
docker compose version
```

## Step 2: Create the compose file

Create a folder and a `docker-compose.yml` in it:

```yaml
services:
  app:
    image: vontainment/v-serpbear:latest
    restart: unless-stopped
    container_name: serpbear
    shm_size: "1024MB"
    ports:
      - "3030:3000"
    environment:
      USER_NAME: admin
      PASSWORD: change-me
      SECRET: change-me-to-a-long-random-string
      APIKEY: change-me-to-another-long-random-string
      MCP_APIKEY: change-me-to-a-separate-long-random-string
      SESSION_DURATION: 24
      NEXT_PUBLIC_APP_URL: http://localhost:3030
      CRON_TIMEZONE: America/New_York
    volumes:
      - data:/app/data

volumes:
  data:
```

Or clone the repository and use the `docker-compose.yml` already in it, which lists every setting with its default:

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
```

Change the values. At least replace `PASSWORD`, `SECRET` and `APIKEY`; set `MCP_APIKEY` to a separate random value only if you want direct MCP bearer access (`openssl rand -hex 32` makes a good value). OAuth uses the normal SerpBear login. Set `NEXT_PUBLIC_APP_URL` to the address you will open in the browser. Every variable is described in [Configuration](Configuration).

## Step 3: Start it

```bash
docker compose up -d
```

`-d` runs it in the background. Follow the logs with:

```bash
docker compose logs -f
```

Open <http://localhost:3030> and sign in. On a server, put a reverse proxy in front of it: see [Reverse Proxy and SSL](Reverse-Proxy-and-SSL).

## Updating

Back up the data, then pull the new image:

```bash
docker compose pull
docker compose up -d
```

Your data stays in the `data` volume, and migrations run automatically on start.
