import json
import time
import unittest
from types import SimpleNamespace

from bridge import BrokerBridge


class FakeClient:
    def __init__(self):
        self.published = []

    def publish(self, topic, payload, qos, retain):
        self.published.append((topic, payload, qos, retain))
        return SimpleNamespace(rc=0)


class BrokerBridgeTests(unittest.TestCase):
    def test_actuators_use_exact_topics_and_nonretained_commands(self):
        fake = FakeClient()
        bridge = BrokerBridge(fake)
        bridge.connected = True
        for command in ("BIN_OPEN", "BIN_CLOSE", "BIN_AUTO"):
            self.assertTrue(bridge.dispatch(command)["sent"])
        self.assertEqual(fake.published[0], ("home/smart-bin/command", "open", 1, False))
        self.assertEqual(fake.published[-1], ("home/smart-bin/command", "auto", 1, False))

    def test_sensor_and_lock_requests_cannot_publish_actuator_commands(self):
        fake = FakeClient()
        bridge = BrokerBridge(fake)
        bridge.connected = True
        for command in ("DOOR_STATUS", "WINDOW_STATUS", "ENV_STATUS"):
            self.assertFalse(bridge.dispatch(command)["fresh"])
        with self.assertRaises(ValueError):
            bridge.dispatch("DOOR_UNLOCK")
        self.assertEqual(fake.published, [])

    def test_stale_telemetry_is_not_reported_as_current(self):
        bridge = BrokerBridge()
        bridge.connected = True
        payload = {"data": {"doorOpen": True}}
        bridge._on_message(None, None, SimpleNamespace(
            topic="home/smart-door-lock/telemetry", payload=json.dumps(payload).encode()))
        self.assertEqual(bridge.display_status("smart-door-lock"), "DOOR OPEN")
        bridge._messages["smart-door-lock"]["telemetry"].received_at = time.time() - 30
        self.assertEqual(bridge.display_status("smart-door-lock"), "DEVICE OFFLINE")

    def test_window_alarm_and_gas_level_match_device_payloads(self):
        bridge = BrokerBridge()
        bridge.connected = True
        window = {"doorOpen": True, "motion": True, "alarm": True}
        gas = {"kind": "state", "data": {"alertLevel": 2, "gasRaw": 1250}}
        bridge._on_message(None, None, SimpleNamespace(
            topic="home/window-sensor/telemetry", payload=json.dumps(window).encode()))
        bridge._on_message(None, None, SimpleNamespace(
            topic="home/environment-sensor/telemetry", payload=json.dumps(gas).encode()))
        self.assertEqual(bridge.display_status("window-sensor"), "WINDOW ALARM")
        self.assertEqual(bridge.display_status("environment-sensor"), "GAS WARNING")


if __name__ == "__main__":
    unittest.main()
