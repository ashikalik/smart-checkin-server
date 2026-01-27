# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Smart Check-in services to a Kubernetes cluster.

## Architecture

The deployment includes:
- **MCP Server** - 2 replicas (auto-scales 2-10)
- **Orchestration Server** - 2 replicas (auto-scales 2-10)
- **Nginx** - 2 replicas as reverse proxy/load balancer
- **Ingress** - Kubernetes Ingress for external access
- **HPA** - Horizontal Pod Autoscaler for automatic scaling

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured to access your cluster
- Docker images built and pushed to a registry (or available locally for minikube/kind)
- Nginx Ingress Controller installed (if using Ingress)

## Building Docker Images

First, build the Docker images:

```bash
# From the project root
docker-compose build

# Tag images for your registry (if using a remote cluster)
docker tag smart-checkin-server-mcp-server:latest YOUR_REGISTRY/mcp-server:latest
docker tag smart-checkin-server-orchestration-server:latest YOUR_REGISTRY/orchestration-server:latest

# Push to registry
docker push YOUR_REGISTRY/mcp-server:latest
docker push YOUR_REGISTRY/orchestration-server:latest
```

## Configuration

### 1. Update Secret (Required)

Edit `k8s/secret.yaml` and add your OpenAI API key:

```yaml
stringData:
  api-key: "sk-your-actual-api-key-here"
```

### 2. Update Image References (If using remote registry)

In `mcp-server.yaml` and `orchestration-server.yaml`, update the image references:

```yaml
image: YOUR_REGISTRY/mcp-server:latest
image: YOUR_REGISTRY/orchestration-server:latest
```

## Deployment

### Option 1: Deploy All Resources

```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get all -n smart-checkin

# Watch pods starting up
kubectl get pods -n smart-checkin -w
```

### Option 2: Deploy Step by Step

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create secrets and configmaps
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml

# 3. Deploy services
kubectl apply -f k8s/mcp-server.yaml
kubectl apply -f k8s/orchestration-server.yaml
kubectl apply -f k8s/nginx.yaml

# 4. Setup autoscaling
kubectl apply -f k8s/hpa.yaml

# 5. Setup ingress (optional)
kubectl apply -f k8s/ingress.yaml
```

## Accessing the Services

### Using LoadBalancer (default)

```bash
# Get the external IP
kubectl get svc nginx-service -n smart-checkin

# Access the services
curl http://<EXTERNAL-IP>/health
curl http://<EXTERNAL-IP>/mcp
curl http://<EXTERNAL-IP>/api
```

### Using Ingress

If you're using the Ingress resource:

```bash
# Add to /etc/hosts (for local testing)
echo "$(kubectl get ingress smart-checkin-ingress -n smart-checkin -o jsonpath='{.status.loadBalancer.ingress[0].ip}') smart-checkin.local" | sudo tee -a /etc/hosts

# Access via hostname
curl http://smart-checkin.local/health
curl http://smart-checkin.local/mcp
curl http://smart-checkin.local/api
```

### Using Port Forward (for development)

```bash
# Forward nginx service
kubectl port-forward -n smart-checkin svc/nginx-service 8080:80

# Access locally
curl http://localhost:8080/health
curl http://localhost:8080/mcp
curl http://localhost:8080/api
```

## Monitoring

### Check Pods

```bash
kubectl get pods -n smart-checkin
kubectl describe pod <pod-name> -n smart-checkin
```

### View Logs

```bash
# MCP Server logs
kubectl logs -f deployment/mcp-server -n smart-checkin

# Orchestration Server logs
kubectl logs -f deployment/orchestration-server -n smart-checkin

# Nginx logs
kubectl logs -f deployment/nginx -n smart-checkin

# All pods logs
kubectl logs -f -l app=mcp-server -n smart-checkin
```

### Check HPA Status

```bash
kubectl get hpa -n smart-checkin
kubectl describe hpa mcp-server-hpa -n smart-checkin
```

## Scaling

### Manual Scaling

```bash
# Scale MCP server
kubectl scale deployment mcp-server --replicas=5 -n smart-checkin

# Scale orchestration server
kubectl scale deployment orchestration-server --replicas=5 -n smart-checkin
```

### Auto-scaling

HPA is configured to automatically scale based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)

Range: 2-10 replicas

## Updating Deployments

```bash
# Update image
kubectl set image deployment/mcp-server mcp-server=YOUR_REGISTRY/mcp-server:v2 -n smart-checkin

# Rollout status
kubectl rollout status deployment/mcp-server -n smart-checkin

# Rollback if needed
kubectl rollout undo deployment/mcp-server -n smart-checkin
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f k8s/

# Or delete namespace (removes everything)
kubectl delete namespace smart-checkin
```

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n smart-checkin
kubectl logs <pod-name> -n smart-checkin
```

### Service not accessible

```bash
# Check services
kubectl get svc -n smart-checkin

# Check endpoints
kubectl get endpoints -n smart-checkin

# Test internal connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n smart-checkin -- sh
# Inside the pod:
curl http://mcp-server-service:3000/mcp
```

### Image pull errors

```bash
# Check if images are available
kubectl get pods -n smart-checkin -o jsonpath='{.items[*].spec.containers[*].image}'

# For minikube/kind, load images directly
docker save smart-checkin-server-mcp-server:latest | kubectl load image -
```

## Production Considerations

1. **Secrets Management**: Use external secret management (e.g., Vault, AWS Secrets Manager)
2. **Resource Limits**: Adjust based on actual usage patterns
3. **Monitoring**: Set up Prometheus/Grafana for metrics
4. **Logging**: Use centralized logging (ELK, Loki)
5. **Backup**: Implement backup strategy for any persistent data
6. **SSL/TLS**: Add HTTPS support via Ingress with cert-manager
7. **Network Policies**: Implement network policies for security
8. **Pod Security**: Add Pod Security Standards/Policies

## Environment-Specific Configurations

### Development

```bash
# Use NodePort for easy access
kubectl patch svc nginx-service -n smart-checkin -p '{"spec":{"type":"NodePort"}}'
```

### Staging/Production

- Use external load balancer
- Enable SSL/TLS
- Set up proper DNS
- Implement monitoring and alerting
- Configure backup strategies
