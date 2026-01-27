# Docker Setup for Smart Check-in Servers

This project contains two NestJS applications running in Docker containers:
1. **MCP Server** - Model Context Protocol server
2. **Orchestration Server** - Orchestrates MCP tools and AI interactions

## Prerequisites

- Docker and Docker Compose installed
- Node.js 25.2.1 or higher (for local development)
- Yarn 4.2.1 (managed via Corepack)

## Quick Start

### Build and Run with Docker

```bash
# Build the Docker images
docker-compose build

# Start both containers
docker-compose up -d

# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

## Services

### MCP Server
- **Container Name**: `ey-smart-checkin-mcp-server`
- **Internal Port**: 3000
- **External Port**: 3100
- **Endpoint**: http://localhost:3100/mcp
- **Description**: Provides MCP tools for math operations and result saving

### Orchestration Server
- **Container Name**: `ey-smart-checkin-orchestration-server`
- **Internal Port**: 3001
- **External Port**: 3101
- **API Base**: http://localhost:3101/api
- **Description**: Orchestrates MCP tool calls with AI integration
- **Endpoints**:
  - `GET /api` - Health check
  - `GET /api/orchestrator/tools` - List available MCP tools
  - `POST /api/orchestrator/run` - Execute orchestration workflow
  - `POST /api/orchestrator/agent-run` - Run AI agent workflow

## Environment Variables

### MCP Server
- `NODE_ENV` - Set to `production` in Docker
- `PORT` - Server port (default: 3000)

### Orchestration Server
- `NODE_ENV` - Set to `production` in Docker
- `PORT` - Server port (default: 3001)
- `MCP_SERVER_URL` - URL of the MCP server (default: `http://mcp-server:3000/mcp` in Docker)
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` - OpenAI model to use
- `OPENAI_BASE_URL` - OpenAI API base URL (optional)

## Local Development

To run locally without Docker:

```bash
# Enable Corepack and install dependencies
npx corepack enable
npx corepack prepare yarn@4.2.1 --activate
npx corepack yarn install

# Build MCP server
npx corepack yarn build:mcp-server

# Build orchestration server
npx corepack yarn build:orchestration

# Run MCP server
npx corepack yarn start:mcp-server

# Run orchestration server (in a separate terminal)
npx corepack yarn start:orchestration
```

## Docker Commands

```bash
# View real-time logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f mcp-server
docker-compose logs -f orchestration-server

# Restart a service
docker-compose restart mcp-server

# Rebuild and restart
docker-compose up -d --build

# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

## Troubleshooting

### Port Already in Use
If you see "address already in use" errors, modify the port mappings in `docker-compose.yml`:

```yaml
ports:
  - "YOUR_PORT:3000"  # For MCP server
  - "YOUR_PORT:3001"  # For orchestration server
```

### Container Keeps Restarting
Check the logs for errors:
```bash
docker-compose logs orchestration-server
```

### Rebuilding After Code Changes
```bash
docker-compose build
docker-compose up -d
```

## Network Architecture

Both containers run in the same Docker network (`smart-checkin-network`), allowing the orchestration server to communicate with the MCP server using the service name `mcp-server` instead of `localhost`.

## Notes

- The project uses Yarn 4.2.1 with `nodeLinker: node-modules` configuration
- Webpack is configured with SWC compiler for faster builds
- Both containers use Node.js 25.2.1 base images
- Production stage uses slim images to reduce size
