"""Local MQTT bridge for the voice ESP and the device firmware."""

import json
import os
import threading
import time
from dataclasses import dataclass
from uuid import uuid4


ACTUATOR_COMMANDS = {
    "BIN_OPEN": ("smart-bin", "open"),
    "BIN_CLOSE": ("smart-bin", "close"),
    "BIN_AUTO": ("smart-bin", "auto"),
}

STATUS_COMMANDS = {
    "BIN_STATUS": "smart-bin",
    "DOOR_STATUS": "smart-door-lock",
    "WINDOW_STATUS": "window-sensor",
    "ENV_STATUS": "environment-sensor",
}


@dataclass
class DeviceMessage:
    payload: dict
    received_at: float


class BrokerBridge:
    def __init__(self, client=None):
        self.client = client
        self.connected = False
        self._lock = threading.Lock()
        self._messages: dict[str, dict[str, DeviceMessage]] = {}

    def start(self):
        if self.client is None:
            import paho.mqtt.client as mqtt

            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"smart-home-gateway-{uuid4().hex[:8]}",
            )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        username = os.getenv("MQTT_USERNAME", "")
        if username:
            self.client.username_pw_set(username, os.getenv("MQTT_PASSWORD", ""))
        try:
            self.client.connect_async(os.getenv("MQTT_HOST", "127.0.0.1"), int(os.getenv("MQTT_PORT", "1883")))
            self.client.loop_start()
        except OSError:
            self.connected = False

    def stop(self):
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()

    def _on_connect(self, client, _userdata, _flags, reason_code, _properties):
        self.connected = not reason_code.is_failure
        if self.connected:
            client.subscribe("home/+/telemetry", qos=1)
            client.subscribe("home/+/status", qos=1)
            client.subscribe("home/+/ack", qos=1)
            client.subscribe("home/+/alert", qos=1)

    def _on_disconnect(self, _client, _userdata, _flags, _reason_code, _properties):
        self.connected = False

    def _on_message(self, _client, _userdata, message):
        parts = message.topic.split("/")
        if len(parts) != 3 or parts[0] != "home" or parts[2] not in {"telemetry", "status", "ack", "alert"}:
            return
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if not isinstance(payload, dict):
            return
        kind = "event" if parts[2] == "telemetry" and payload.get("kind") == "event" else parts[2]
        with self._lock:
            self._messages.setdefault(parts[1], {})[kind] = DeviceMessage(payload, time.time())

    def dispatch(self, command: str) -> dict:
        if command in STATUS_COMMANDS:
            return self.device_state(STATUS_COMMANDS[command])
        if command not in ACTUATOR_COMMANDS:
            raise ValueError("Unsupported command")
        if not self.connected:
            return {"sent": False, "reason": "broker_offline"}
        device, action = ACTUATOR_COMMANDS[command]
        result = self.client.publish(f"home/{device}/command", action, qos=1, retain=False)
        return {"sent": result.rc == 0, "device": device, "action": action,
                "note": "broker accepted; check device telemetry for execution"}

    def device_state(self, device: str) -> dict:
        with self._lock:
            messages = dict(self._messages.get(device, {}))
        state = {"device": device, "brokerConnected": self.connected}
        for kind, item in messages.items():
            state[kind] = item.payload
            state[f"{kind}AgeSeconds"] = round(time.time() - item.received_at, 1)
        telemetry = messages.get("telemetry")
        state["fresh"] = bool(self.connected and telemetry and time.time() - telemetry.received_at < 15)
        return state

    def display_status(self, device: str) -> str:
        state = self.device_state(device)
        if not state["fresh"]:
            return "DEVICE OFFLINE"
        data = state["telemetry"].get("data", state["telemetry"])
        if device == "smart-bin":
            return f"BIN {round(data.get('fillPercent', 0))} PERCENT"
        if device == "smart-door-lock":
            return "DOOR OPEN" if data.get("doorOpen") else "DOOR CLOSED"
        if device == "window-sensor":
            if data.get("alarm"):
                return "WINDOW ALARM"
            return "WINDOW OPEN" if data.get("doorOpen") else "WINDOW CLOSED"
        if device == "environment-sensor":
            labels = {
                0: "GAS WARMUP",
                1: "GAS MONITOR",
                2: "GAS WARNING",
                3: "GAS DANGER",
            }
            return labels.get(data.get("alertLevel"), "GAS UNKNOWN")
        return "UNKNOWN DEVICE"

    def all_states(self) -> dict:
        devices = ["smart-bin", "smart-door-lock", "window-sensor", "environment-sensor"]
        return {device: self.device_state(device) for device in devices}


bridge = BrokerBridge()
