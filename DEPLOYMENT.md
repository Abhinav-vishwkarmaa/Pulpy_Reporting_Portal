# Deployment Guide

This guide explains how to deploy the refactored Node.js backend with separate API and worker processes.

## Architecture

The application has been refactored to separate concerns:

- **API Server**: Handles HTTP requests only (no background jobs)
- **Click Worker**: Processes Redis Streams and bulk inserts clicks to MySQL
- **Stats Worker**: Periodically flushes Redis stats to MySQL

## Processes

1. **api-server**: Cluster mode with multiple instances (uses all CPU cores)
2. **click-worker**: Single instance Redis Stream consumer
3. **stats-worker**: Single instance stats aggregator

## Deployment with PM2

### Start all services:
```bash
pm2 start ecosystem.config.js
```

### Start individual services:
```bash
# Start API server (cluster mode)
pm2 start ecosystem.config.js --only api-server

# Start click worker
pm2 start ecosystem.config.js --only click-worker

# Start stats worker
pm2 start ecosystem.config.js --only stats-worker
```

### Manual startup (without PM2):
```bash
# Terminal 1: API Server
node src/server.js

# Terminal 2: Click Worker
node click-worker.js

# Terminal 3: Stats Worker
node stats-worker.js
```

## Monitoring

### PM2 Commands:
```bash
# View all processes
pm2 list

# View logs
pm2 logs

# View specific service logs
pm2 logs api-server
pm2 logs click-worker
pm2 logs stats-worker

# Monitor resources
pm2 monit

# Restart services
pm2 restart ecosystem.config.js
```

## Performance Benefits

- **API Server**: Dedicated event loop for HTTP requests (1000+ RPS)
- **Workers**: Isolated processes prevent event-loop blocking
- **Redis Backlog**: Drains steadily without API interference
- **Scalability**: API scales horizontally, workers scale vertically

## Configuration

Environment variables (in `.env`):
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `PORT` (for API server)

## Health Checks

- API: `GET /health`
- Workers: PM2 health monitoring enabled
- Logs: Centralized in `logs/` directory

## Troubleshooting

### API timeouts under load:
- Ensure workers are running: `pm2 list`
- Check Redis connectivity
- Monitor Redis backlog: `redis-cli LLEN stream:clicks`

### Worker failures:
- Check logs: `pm2 logs click-worker`
- Verify database connectivity
- Check Redis connectivity

### High memory usage:
- Restart workers: `pm2 restart click-worker`
- Check for memory leaks in worker code

## Scaling

### API Server:
- PM2 cluster mode automatically uses all CPU cores
- Add load balancer for multiple servers

### Workers:
- Generally single instance per Redis/MySQL cluster
- Scale horizontally by partitioning data (advanced)

## Definition of Done

✅ High traffic does not block API responses
✅ Redis backlog drains steadily
✅ Workers operate independently
✅ System scales with load instead of collapsing