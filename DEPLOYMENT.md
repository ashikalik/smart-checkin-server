# Smart Check-in Server - Complete Deployment Guide

This project provides multiple deployment options for the Smart Check-in services.

## Quick Start Options

1. **Docker Compose** - Development and simple deployments
2. **Kubernetes** - Production deployments with auto-scaling

## Architecture

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  (Reverse   │
                    │   Proxy)    │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐          ┌──────▼──────────┐
       │ MCP Server  │          │  Orchestration  │
       │   (Port     │◄─────────┤     Server      │
       │   3000)     │          │   (Port 3001)   │
       └─────────────┘          └─────────────────┘
```

## 1. Docker Compose Deployment

### Prerequisites
- Docker and Docker Compose installed
- Node.js 25.2.1+ (for local development)

### Quick Start

```bash
# Build all images (nginx, mcp-server, orchestration-server)
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Access Points

- **Nginx Proxy**: http://localhost
- **Health Check**: http://localhost/health
- **MCP Server**: http://localhost/mcp
- **Orchestration API**: http://localhost/api

### Configuration

Edit `docker-compose.yml` to customize:
- Port mappings
- Environment variables
- Resource limits
- Replica counts

See [DOCKER_README.md](DOCKER_README.md) for detailed Docker Compose documentation.

## 2. Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (1.24+)
- kubectl configured
- Docker images built and available

### Quick Start

```bash
# Build images
docker-compose build

# Deploy to Kubernetes
kubectl apply -f k8s/

# Check deployment
kubectl get all -n smart-checkin

# Get external IP (LoadBalancer)
kubectl get svc nginx-service -n smart-checkin
```

### Access Points

```bash
# Via LoadBalancer
EXTERNAL_IP=$(kubectl get svc nginx-service -n smart-checkin -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl http://$EXTERNAL_IP/health

# Via Port Forward
kubectl port-forward -n smart-checkin svc/nginx-service 8080:80
curl http://localhost:8080/health
```

### Features

- **Auto-scaling**: HPA scales pods based on CPU/memory (2-10 replicas)
- **High Availability**: 2+ replicas for each service
- **Load Balancing**: Nginx distributes traffic across pods
- **Health Checks**: Liveness and readiness probes
- **Resource Management**: CPU and memory limits/requests

See [k8s/README.md](k8s/README.md) for detailed Kubernetes documentation.

## 3. Local Development

### Without Docker

```bash
# Enable Corepack
npx corepack enable
npx corepack prepare yarn@4.2.1 --activate

# Install dependencies
npx corepack yarn install

# Build services
npx corepack yarn build:mcp-server
npx corepack yarn build:orchestration

# Run services (separate terminals)
npx corepack yarn start:mcp-server
npx corepack yarn start:orchestration
```

### Access Points (Local)
- MCP Server: http://localhost:3000
- Orchestration Server: http://localhost:3001

## Services Overview

### MCP Server
**Purpose**: Provides Model Context Protocol tools

**Features**:
- Math operations (add, subtract, multiply, divide, percentage)
- Result saving/logging
- Streamable HTTP transport

**Endpoints**:
- `POST /mcp` - MCP protocol endpoint

### Orchestration Server
**Purpose**: Orchestrates MCP tools with AI integration

**Features**:
- Tool discovery and listing
- AI-powered workflow orchestration
- OpenAI integration

**Endpoints**:
- `GET /api` - Health check
- `GET /api/orchestrator/tools` - List available tools
- `POST /api/orchestrator/run` - Execute workflow
- `POST /api/orchestrator/agent-run` - Run AI agent

### Nginx
**Purpose**: Reverse proxy and load balancer

**Features**:
- Single entry point for all services
- Load balancing across replicas
- Health checks
- Request routing

**Endpoints**:
- `/health` - Health check
- `/mcp` - Routes to MCP server
- `/api` - Routes to orchestration server

## Environment Variables

### Common
- `NODE_ENV` - Environment (development/production)

### Orchestration Server
- `MCP_SERVER_URL` - MCP server URL (default: http://mcp-server:3000/mcp)
- `OPENAI_API_KEY` - OpenAI API key (required for AI features)
- `OPENAI_MODEL` - Model to use (default: gpt-4)
- `OPENAI_BASE_URL` - API base URL (default: https://api.openai.com/v1)

## Comparison: Docker Compose vs Kubernetes

| Feature | Docker Compose | Kubernetes |
|---------|---------------|------------|
| **Ease of Setup** | ⭐⭐⭐⭐⭐ Simple | ⭐⭐⭐ Moderate |
| **Scalability** | ⭐⭐ Limited | ⭐⭐⭐⭐⭐ Excellent |
| **High Availability** | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced |
| **Auto-scaling** | ❌ No | ✅ Yes (HPA) |
| **Load Balancing** | ⭐⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced |
| **Health Checks** | ⭐⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced |
| **Rolling Updates** | ⭐⭐ Manual | ⭐⭐⭐⭐⭐ Automated |
| **Resource Management** | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced |
| **Best For** | Dev, Small deployments | Production, Large scale |

## Monitoring & Debugging

### Docker Compose

```bash
# View logs
docker-compose logs -f [service-name]

# Check resource usage
docker stats

# Inspect container
docker inspect <container-name>

# Execute command in container
docker-compose exec mcp-server sh
```

### Kubernetes

```bash
# View logs
kubectl logs -f deployment/mcp-server -n smart-checkin

# Check pod status
kubectl get pods -n smart-checkin
kubectl describe pod <pod-name> -n smart-checkin

# Execute command in pod
kubectl exec -it <pod-name> -n smart-checkin -- sh

# Check HPA status
kubectl get hpa -n smart-checkin
```

## Common Commands

### Docker Compose

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# View logs
docker-compose logs -f

# Scale a service
docker-compose up -d --scale mcp-server=3
```

### Kubernetes

```bash
# Deploy
kubectl apply -f k8s/

# Delete
kubectl delete -f k8s/

# Scale
kubectl scale deployment/mcp-server --replicas=5 -n smart-checkin

# Update image
kubectl set image deployment/mcp-server mcp-server=new-image:tag -n smart-checkin

# Rollback
kubectl rollout undo deployment/mcp-server -n smart-checkin
```

## Troubleshooting

### Service not accessible

**Docker Compose**:
```bash
docker-compose ps
docker-compose logs nginx
curl http://localhost/health
```

**Kubernetes**:
```bash
kubectl get pods -n smart-checkin
kubectl get svc -n smart-checkin
kubectl logs -f deployment/nginx -n smart-checkin
```

### High memory/CPU usage

**Docker Compose**: Edit resource limits in docker-compose.yml

**Kubernetes**: Adjust resource requests/limits in deployment manifests

### Container crashes

**Docker Compose**:
```bash
docker-compose logs <service-name>
docker-compose restart <service-name>
```

**Kubernetes**:
```bash
kubectl logs <pod-name> -n smart-checkin --previous
kubectl describe pod <pod-name> -n smart-checkin
```

## Production Checklist

- [ ] Set production environment variables
- [ ] Configure proper resource limits
- [ ] Set up SSL/TLS certificates
- [ ] Configure proper DNS
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure centralized logging
- [ ] Implement backup strategy
- [ ] Set up CI/CD pipeline
- [ ] Configure secrets management
- [ ] Enable network policies
- [ ] Set up alerts and notifications
- [ ] Document runbooks for common issues

## Next Steps

1. Choose your deployment method (Docker Compose or Kubernetes)
2. Follow the respective README for detailed setup
3. Configure environment variables
4. Test the deployment
5. Set up monitoring and logging
6. Plan for production hardening

## Additional Resources

- [Docker Compose Documentation](DOCKER_README.md)
- [Kubernetes Documentation](k8s/README.md)
- [Nginx Configuration](nginx.conf)
- [Project README](README.md)
