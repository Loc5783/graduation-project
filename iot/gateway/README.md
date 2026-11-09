# Local gateway

Install Python dependencies with `py -m pip install -r requirements.txt` and run from this directory with `py -m uvicorn app:app --host 0.0.0.0 --port 8001`. Set `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, and `MQTT_PASSWORD` in the PowerShell process first. The HTTP dashboard is at `http://127.0.0.1:8001` on the PC.

The gateway publishes MQTT commands for the bin, records voice events, and reads latest device telemetry. A successful publish means the client queued the message; check device telemetry and physical motion for execution. When the broker is offline, actuator requests return HTTP 503 and the voice ESP keeps the command in its RAM queue.

The gateway binds to all interfaces so the ESP can reach it. Keep it on a trusted local network and scope Windows Firewall access to that network. The HTTP endpoint currently has no user authentication; do not expose port 8001 to the Internet.
