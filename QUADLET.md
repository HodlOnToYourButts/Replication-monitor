# Running with Podman Quadlet

This service can be run as a systemd service using Podman Quadlet.

## Setup

1. **Copy the Quadlet file:**
   ```bash
   cp replication-monitor.container ~/.config/containers/systemd/
   ```

2. **Create the environment directory:**
   ```bash
   mkdir -p ~/.config/replication-monitor
   ```

3. **Create your environment file:**
   ```bash
   cp replication-monitor.env.example ~/.config/replication-monitor/replication-monitor.env
   ```

4. **Edit the environment file with your CouchDB credentials:**
   ```bash
   nano ~/.config/replication-monitor/replication-monitor.env
   ```

5. **Reload systemd and start the service:**
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now replication-monitor.service
   ```

## Usage

- **Check service status:**
  ```bash
  systemctl --user status replication-monitor.service
  ```

- **View logs:**
  ```bash
  journalctl --user -u replication-monitor.service -f
  ```

- **Stop the service:**
  ```bash
  systemctl --user stop replication-monitor.service
  ```

- **Update to latest image:**
  ```bash
  podman auto-update
  systemctl --user restart replication-monitor.service
  ```

The service will be available at `http://localhost:8080` once started.