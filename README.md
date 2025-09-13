# CouchDB Replication Monitor

A lightweight microservice for monitoring CouchDB replication status across multiple instances. Provides REST API endpoints to check replication health, progress, and connection status between source and target databases.

## Features

- Monitor replications targeting specific databases
- Real-time status detection (running/retrying/failed)
- Track time since last replication activity
- View replication statistics and error history
- Docker containerization with GitHub Actions CI/CD
- Podman Quadlet support for systemd deployment

## Use Case

Perfect for monitoring CouchDB replications in distributed environments where you need to quickly identify connection issues or replication failures between database instances.

## Quick Start

### Using Docker/Podman

```bash
podman run -d -p 8080:8080 \
  -e COUCHDB_URL=http://localhost:5984 \
  -e COUCHDB_ADMIN_USER=admin \
  -e COUCHDB_ADMIN_PASSWORD=password \
  ghcr.io/hodlontoyourbutts/replication-monitor:latest
```

### Using Podman Quadlet

See [QUADLET.md](QUADLET.md) for systemd service setup.

### Local Development

```bash
npm install
npm start
```

## API Endpoints

### Health Check
- `GET /` - Service health status

### Replication Monitoring
- `GET /replication/status/{database}` - Get all replications for a database
- `GET /replication/status/{database}?target=true` - Get replications targeting the database
- `GET /replication/status/{database}/{replication_id}` - Get specific replication details

### Debug Endpoints
- `GET /debug/replications` - Basic debug response
- `GET /debug/replications/full` - All replication configuration documents
- `GET /debug/active-tasks` - CouchDB active replication tasks
- `GET /debug/scheduler-jobs` - CouchDB scheduler job status

## Example Usage

Check replication status for replications targeting the 'zombieauth' database:

```bash
curl http://localhost:8080/replication/status/zombieauth?target=true
```

Example response:
```json
{
  "database": "zombieauth",
  "target_filter": true,
  "replications": [
    {
      "id": "replication_doc_id",
      "source": "http://source.server:5984/zombieauth/",
      "target": "http://target.server:5984/zombieauth/",
      "status": "running",
      "continuous": true,
      "last_activity": "2025-09-13T02:25:44.000Z",
      "time_since_last_activity_seconds": 120,
      "stats": {
        "docs_read": 0,
        "docs_written": 0,
        "doc_write_failures": 0,
        "revisions_checked": 95,
        "changes_pending": 0
      },
      "recent_errors": []
    }
  ]
}
```

## Configuration

Environment variables:
- `COUCHDB_URL` - CouchDB server URL (default: http://localhost:5984)
- `COUCHDB_ADMIN_USER` - Admin username (default: admin)
- `COUCHDB_ADMIN_PASSWORD` - Admin password (default: password)
- `PORT` - Service port (default: 8080)

## Status Values

- `running` - Replication is active and working
- `retrying` - Replication has crashed recently and is retrying
- `unknown` - Unable to determine status

## License

AGPL-3.0