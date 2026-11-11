# Deploy with Node.js

Use this to run SerpBear without Docker, on your computer or on a server.

## Step 1: Install Node.js and Git

The Docker image uses Node.js 26, so use a current Node.js release. Check what you have:

```bash
node -v
git --version
```

## Step 2: Clone the repository

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
```

## Step 3: Set the environment variables

Create a `.env` file in the project folder:

```
USER_NAME=admin
PASSWORD=your_password_here
SECRET=your_random_secret_here
APIKEY=your_random_api_key_here
MCP_APIKEY=your_separate_random_mcp_key_here
SESSION_DURATION=24
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_TIMEZONE=America/New_York
```

Replace the values. Set a separate `MCP_APIKEY` if you enable MCP OAuth or direct MCP bearer access. OAuth approval uses this key rather than the normal SerpBear login. Use `https://serpbear.yourdomain.com` for `NEXT_PUBLIC_APP_URL` on a server. Standard OAuth discovery routes are not present in this checkout, so clients that require automatic OAuth discovery cannot currently connect. Every variable is described in [Configuration](Configuration). Both the web app and the cron worker read this file.

## Step 4: Create the data folder

```bash
mkdir -p data
```

## Step 5: Install and build

```bash
npm install
npm run build
```

## Step 6: Start it

```bash
npm run start:all
```

This starts the web app on port 3000 and the cron worker that runs the scheduled scrapes. Open <http://localhost:3000>.

## Keep it running on a server

Use a process manager such as PM2:

```bash
npm install -g pm2
pm2 start npm --name "serpbear" -- run start:all
pm2 save
pm2 startup
```

Then put a reverse proxy in front of port 3000: see [Reverse Proxy and SSL](Reverse-Proxy-and-SSL).

## Updating

Back up the `data/` folder first, then:

```bash
git pull
npm install
npm run db:migrate
npm run build
npm run start:all
```

If you use PM2, run `pm2 restart serpbear` instead of `npm run start:all`.
