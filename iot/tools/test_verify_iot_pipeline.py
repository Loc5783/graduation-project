"""
Unit tests cho công cụ kiểm chứng verify_iot_pipeline.py (chạy hoàn toàn offline không cần mạng).
Xác minh:
1. Thiếu cấu hình -> dừng ngay lập tức.
2. Cổng hệ thống thật (1884, 8001, 5000, 5180) -> phân tích bằng urllib.parse và từ chối.
3. Không bị nhầm lẫn substring cổng (ví dụ: port 50000 không bị nhầm là 5000).
4. Tên database thật hoặc thiếu 'test' -> từ chối.
5. Môi trường chưa được harness xác minh (HARNESS_MANAGED != 'true') -> dừng trước publish/register.
6. StrictNoRedirectHandler chặn toàn bộ redirect 301/302/307/308.
7. Vòng đời client MQTT luôn đóng (loop_stop, disconnect) trong finally khi xảy ra lỗi.
"""

import unittest
from unittest.mock import MagicMock
import urllib.error

from verify_iot_pipeline import (
    check_isolation_requirements,
    parse_and_validate_endpoint_url,
    validate_test_database_name,
    validate_mqtt_port,
    publish_fixture_paho_v2,
    StrictNoRedirectHandler,
    HarnessEnvironmentError
)

class TestVerifyIoTPipelineTool(unittest.TestCase):

    def test_missing_config_raises_error(self):
        """Thiếu cấu hình phải raise HarnessEnvironmentError trước mọi thao tác mạng."""
        with self.assertRaises(HarnessEnvironmentError):
            check_isolation_requirements({})

    def test_system_ports_rejected_via_urlparse(self):
        """Cổng hệ thống thật (1884, 8001, 5000, 5180) bị từ chối bằng urllib.parse."""
        with self.assertRaises(HarnessEnvironmentError) as ctx:
            validate_mqtt_port(1884)
        self.assertIn("1884", str(ctx.exception))

        with self.assertRaises(HarnessEnvironmentError) as ctx:
            parse_and_validate_endpoint_url("http://127.0.0.1:8001", "GW")
        self.assertIn("8001", str(ctx.exception))

        with self.assertRaises(HarnessEnvironmentError) as ctx:
            parse_and_validate_endpoint_url("http://127.0.0.1:5000", "BE")
        self.assertIn("5000", str(ctx.exception))

        with self.assertRaises(HarnessEnvironmentError) as ctx:
            parse_and_validate_endpoint_url("http://localhost:5180/api", "FE")
        self.assertIn("5180", str(ctx.exception))

    def test_port_not_checked_by_substring(self):
        """Kiểm tra port bằng số nguyên thật, không bị sai bởi substring (ví dụ: 50000 không bị coi là 5000)."""
        host, port, url = parse_and_validate_endpoint_url("http://127.0.0.1:50000/api", "TEST_URL")
        self.assertEqual(port, 50000)
        self.assertEqual(url, "http://127.0.0.1:50000")

    def test_url_scheme_validation(self):
        """Chỉ chấp nhận http hoặc https."""
        with self.assertRaises(HarnessEnvironmentError):
            parse_and_validate_endpoint_url("ftp://127.0.0.1:9000", "TEST_FTP")
        with self.assertRaises(HarnessEnvironmentError):
            parse_and_validate_endpoint_url("javascript:alert(1)", "TEST_JS")

    def test_database_name_validation(self):
        """Từ chối database thật (smart_home_privacy) và DB không có 'test'."""
        with self.assertRaises(HarnessEnvironmentError):
            validate_test_database_name("smart_home_privacy")

        with self.assertRaises(HarnessEnvironmentError):
            validate_test_database_name("production_db")

        with self.assertRaises(HarnessEnvironmentError):
            validate_test_database_name("my_custom_db")

        # Hợp lệ:
        valid_db = validate_test_database_name("smart_home_privacy_isolated_test")
        self.assertEqual(valid_db, "smart_home_privacy_isolated_test")

    def test_unverified_harness_halts_before_execution(self):
        """Cấu hình đủ cổng test nhưng HARNESS_MANAGED != 'true' -> phải dừng ngay lập tức."""
        env = {
            "TEST_MQTT_PORT": "1885",
            "TEST_GATEWAY_URL": "http://127.0.0.1:8002",
            "TEST_BACKEND_URL": "http://127.0.0.1:5001",
            "TEST_DB_NAME": "smart_home_privacy_test",
            "HARNESS_MANAGED": "false"  # Chưa chứng minh harness quản lý cụm test
        }
        with self.assertRaises(HarnessEnvironmentError) as ctx:
            check_isolation_requirements(env)
        self.assertIn("HARNESS_MANAGED", str(ctx.exception))

    def test_verified_harness_accepted(self):
        """Khi đầy đủ cấu hình cách ly và HARNESS_MANAGED='true', kiểm tra pass thành công."""
        env = {
            "TEST_MQTT_PORT": "1885",
            "TEST_GATEWAY_URL": "http://127.0.0.1:8002",
            "TEST_BACKEND_URL": "http://127.0.0.1:5001",
            "TEST_DB_NAME": "smart_home_privacy_test",
            "HARNESS_MANAGED": "true"
        }
        cfg = check_isolation_requirements(env)
        self.assertEqual(cfg["mqtt_port"], 1885)
        self.assertEqual(cfg["gateway_url"], "http://127.0.0.1:8002")
        self.assertEqual(cfg["backend_url"], "http://127.0.0.1:5001")
        self.assertEqual(cfg["db_name"], "smart_home_privacy_test")

    def test_strict_no_redirect_handler_blocks_redirects(self):
        """StrictNoRedirectHandler chặn mọi mã chuyển hướng 301, 302, 307, 308."""
        handler = StrictNoRedirectHandler()
        req = MagicMock()
        req.full_url = "http://127.0.0.1:5001/api/auth/login"

        for code in (301, 302, 303, 307, 308):
            with self.assertRaises(urllib.error.HTTPError):
                method = getattr(handler, f"http_error_{code}")
                method(req, None, code, "Redirect blocked", {})

    def test_mqtt_client_always_cleaned_up_in_finally(self):
        """Vòng đời client MQTT luôn được loop_stop() và disconnect() trong khối finally kể cả khi có lỗi."""
        mock_client = MagicMock()
        # Giả lập connect_async ném lỗi
        mock_client.connect_async.side_effect = RuntimeError("Network error")

        with self.assertRaises(RuntimeError):
            publish_fixture_paho_v2(
                lambda: mock_client,
                "127.0.0.1",
                1885,
                "home/test/telemetry",
                {"hello": "world"}
            )

        # Kiểm tra loop_stop và disconnect vẫn được gọi trong finally
        mock_client.loop_stop.assert_called_once()
        mock_client.disconnect.assert_called_once()

if __name__ == "__main__":
    unittest.main()
