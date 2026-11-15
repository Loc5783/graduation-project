"""
Công cụ kiểm chứng đường đi dữ liệu IoT nội bộ (E2E Verification Tool):
Synthetic Fixture -> Test Broker -> Test Gateway -> Test Backend (Isolated Test Environment)

NGUYÊN TẮC AN TOÀN & CÁCH LY BẮT BUỘC:
1. TUYỆT ĐỐI KHÔNG CHẠY E2E TRÊN HỆ THỐNG THẬT:
   - Cấm cổng 1884 (Mosquitto thật), 8001 (Gateway thật), 5000 (Express thật), 5180 (Vite dev proxy).
   - Cấm ghi vào database thật (smart_home_privacy).
   - Phân tích URL bằng urllib.parse (kiểm tra port kiểu số nguyên, không dùng substring).
   - Chặn toàn bộ HTTP redirect tự động sang các dịch vụ hoặc domain khác.
2. NGUYÊN TẮC HARNESS KIỂM SOÁT:
   - Chỉ đổi port và TEST_DB_NAME là chưa đủ chứng minh backend thực sự trỏ vào DB test.
   - Do đó, nếu cụm test cách ly chưa được harness khởi tạo và chứng minh (HARNESS_MANAGED='true'),
     script bắt buộc dừng ngay trước mọi thao tác publish hoặc ghi dữ liệu.
3. KẾT NỐI MQTT AN TOÀN & VÒNG ĐỜI CLIENT TRONG FINALLY:
   - Sử dụng đúng API Paho v2.
   - Timeout hữu hạn cho cả kết nối và publish; kiểm tra is_published() thực tế.
   - Luôn đóng loop_stop() và disconnect() trong khối finally.
4. THU DỌN TÀI KHOẢN & PHIÊN TEST TRONG FINALLY:
   - Thu dọn phiên và tài khoản test trong finally, chỉ trong DB test đã xác minh an toàn.
   - Không tạo API xóa user công khai.
"""

import json
import os
import sys
import time
import threading
import urllib.parse
import urllib.request
import urllib.error
import http.cookiejar

EXPECTED_DEVICE_IDS = frozenset({
    "smart-door-lock",
    "window-sensor",
    "smart-bin",
    "environment-sensor",
    "smart-plug"
})

FORBIDDEN_FIELDS = frozenset({
    "voltage",
    "powerWatt",
    "lightLux",
    "password",
    "battery",
    "never-export",
    "token",
    "secret"
})

DISALLOWED_SYSTEM_PORTS = frozenset({1884, 8001, 5000, 5180})
DISALLOWED_DB_NAMES = frozenset({
    "smart_home_privacy",
    "smart-home-privacy",
    "production",
    "prod",
    "default"
})

class HarnessEnvironmentError(Exception):
    """Lỗi môi trường kiểm thử chưa cách ly hoặc chưa được harness xác minh."""
    pass

class StrictNoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Chặn toàn bộ chuyển hướng (redirect) tự động để chống lọt request sang dịch vụ khác."""
    def http_error_301(self, req, fp, code, msg, headers):
        raise urllib.error.HTTPError(req.full_url, code, f"Bị chặn: Không cho phép redirect tự động ({code})", headers, fp)
    http_error_302 = http_error_301
    http_error_303 = http_error_301
    http_error_307 = http_error_301
    http_error_308 = http_error_301

def parse_and_validate_endpoint_url(url_str, label):
    """
    Phân tích URL bằng urllib.parse.
    Kiểm tra hostname và port số nguyên thực tế.
    Tuyệt đối không kiểm tra port bằng substring.
    """
    if not url_str or not isinstance(url_str, str):
        raise HarnessEnvironmentError(f"{label}: URL không được để trống")

    parsed = urllib.parse.urlparse(url_str.strip())
    if parsed.scheme not in ("http", "https"):
        raise HarnessEnvironmentError(f"{label}: Scheme phải là http hoặc https, nhận được: '{parsed.scheme}'")

    if not parsed.hostname:
        raise HarnessEnvironmentError(f"{label}: URL thiếu hostname hợp lệ")

    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80

    if port in DISALLOWED_SYSTEM_PORTS:
        raise HarnessEnvironmentError(
            f"{label}: Cổng port={port} thuộc danh sách cổng hệ thống đang chạy {sorted(list(DISALLOWED_SYSTEM_PORTS))}. "
            "Bắt buộc cấu hình cổng dịch vụ test riêng biệt."
        )

    clean_url = f"{parsed.scheme}://{parsed.hostname}:{port}"
    return parsed.hostname, port, clean_url

def validate_test_database_name(db_name):
    """
    Kiểm tra tên database test.
    Từ chối tuyệt đối database thật và bắt buộc tên phải chứa 'test'.
    """
    if not db_name or not isinstance(db_name, str):
        raise HarnessEnvironmentError("Tên database test (TEST_DB_NAME) không được để trống")

    cleaned = db_name.strip().lower()
    if cleaned in DISALLOWED_DB_NAMES:
        raise HarnessEnvironmentError(f"TEST_DB_NAME='{db_name}' trùng với database thật của hệ thống! Bị từ chối.")

    if "test" not in cleaned:
        raise HarnessEnvironmentError(
            f"TEST_DB_NAME='{db_name}' không chứa từ khóa 'test'. "
            "Tên database test bắt buộc phải có tiền tố/hậu tố 'test' để đảm bảo an toàn."
        )
    return cleaned

def validate_mqtt_port(port_val):
    """Kiểm tra cổng MQTT test bằng số nguyên, không dùng chuỗi."""
    if port_val is None:
        raise HarnessEnvironmentError("Thiếu TEST_MQTT_PORT (cổng broker MQTT test riêng)")
    try:
        port = int(port_val)
    except (ValueError, TypeError):
        raise HarnessEnvironmentError(f"TEST_MQTT_PORT='{port_val}' không phải là cổng số nguyên hợp lệ")

    if port <= 0 or port > 65535:
        raise HarnessEnvironmentError(f"TEST_MQTT_PORT={port} nằm ngoài dải cổng TCP hợp lệ (1-65535)")

    if port in DISALLOWED_SYSTEM_PORTS:
        raise HarnessEnvironmentError(
            f"TEST_MQTT_PORT={port} trùng với cổng broker hệ thống đang chạy (1884). "
            "Bắt buộc dùng cổng broker test riêng biệt."
        )
    return port

def check_isolation_requirements(env=None):
    """
    Xác minh toàn diện tính cách ly của môi trường trước khi thực hiện bất kỳ thao tác mạng nào.
    Trả về cấu hình đã được kiểm tra nghiêm ngặt.
    """
    source_env = env if env is not None else os.environ

    mqtt_port = validate_mqtt_port(source_env.get("TEST_MQTT_PORT"))
    mqtt_host = source_env.get("TEST_MQTT_HOST", "127.0.0.1").strip()

    gw_host, gw_port, gw_clean_url = parse_and_validate_endpoint_url(
        source_env.get("TEST_GATEWAY_URL"), "TEST_GATEWAY_URL"
    )

    be_host, be_port, be_clean_url = parse_and_validate_endpoint_url(
        source_env.get("TEST_BACKEND_URL"), "TEST_BACKEND_URL"
    )

    clean_db_name = validate_test_database_name(source_env.get("TEST_DB_NAME"))

    # Kiểm tra chứng minh môi trường do Harness kiểm soát
    harness_managed = source_env.get("HARNESS_MANAGED", "").strip().lower()
    if harness_managed != "true":
        raise HarnessEnvironmentError(
            "Cụm kiểm thử E2E cách ly chưa được harness khởi tạo và chứng minh (HARNESS_MANAGED != 'true').\n"
            "Chỉ đổi port và TEST_DB_NAME không chứng minh được backend thực sự dùng đúng database test riêng.\n"
            "Script dừng ngay trước mọi thao tác publish hoặc đăng ký tài khoản để bảo vệ hệ thống thật."
        )

    return {
        "mqtt_host": mqtt_host,
        "mqtt_port": mqtt_port,
        "gateway_url": gw_clean_url,
        "backend_url": be_clean_url,
        "db_name": clean_db_name
    }

def publish_fixture_paho_v2(mqtt_client_factory, host, port, topic, payload, keepalive=30, timeout=5.0):
    """
    Phát bản tin MQTT bằng đúng phiên bản Paho v2.
    - Timeout hữu hạn cho kết nối và publish.
    - Kiểm tra publish hoàn thành thực sự (is_published).
    - Toàn bộ đóng vòng lặp và ngắt kết nối nằm trong khối finally.
    """
    client = mqtt_client_factory()
    connected_event = threading.Event()
    connect_failed = []

    def on_connect(_c, _userdata, _flags, reason_code, _properties=None):
        if hasattr(reason_code, "is_failure"):
            if not reason_code.is_failure:
                connected_event.set()
            else:
                connect_failed.append(str(reason_code))
        else:
            if reason_code == 0:
                connected_event.set()
            else:
                connect_failed.append(f"rc={reason_code}")

    client.on_connect = on_connect

    try:
        # Paho API: connect_async nhận host, port, keepalive
        client.connect_async(host, port, keepalive=keepalive)
        client.loop_start()

        if not connected_event.wait(timeout=timeout):
            reason = connect_failed[0] if connect_failed else "timeout"
            raise TimeoutError(f"Không thể kết nối tới MQTT test broker {host}:{port} trong {timeout}s ({reason})")

        msg_body = json.dumps(payload)
        res = client.publish(topic, msg_body, qos=1)
        res.wait_for_publish(timeout=timeout)

        if not res.is_published():
            raise TimeoutError(f"Publish tới topic {topic} không hoàn thành trong {timeout}s")
        if res.rc != 0:
            raise RuntimeError(f"Publish tới topic {topic} thất bại với rc={res.rc}")

    finally:
        try:
            client.loop_stop()
        except Exception:
            pass
        try:
            client.disconnect()
        except Exception:
            pass

def execute_isolated_pipeline(env_config, mqtt_factory=None):
    """
    Thực thi kiểm chứng E2E trên cụm môi trường cách ly đã xác minh.
    Mọi hoạt động dọn dẹp tài khoản/phiên test đều nằm trong khối finally.
    """
    import paho.mqtt.client as paho_mqtt

    if mqtt_factory is None:
        def default_mqtt_factory():
            return paho_mqtt.Client(
                paho_mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"isolated-e2e-{int(time.time()*1000)}"
            )
        mqtt_factory = default_mqtt_factory

    synthetic_fixtures = {
        "window-sensor": {
            "doorOpen": False,
            "motion": True,
            "alarm": False,
            "uptimeMs": 12345,
            "wifiRssi": -55
        },
        "smart-door-lock": {
            "version": 1,
            "deviceId": "smart-door-lock-01",
            "data": {
                "doorOpen": True,
                "boltCommand": "UNLOCK",
                "boltCommandCompleted": True,
                "boltFeedbackAvailable": False,
                "forcedOpen": False,
                "heldOpen": False,
                "wifiRssi": -62
            }
        },
        "smart-bin": {
            "sensorOk": True,
            "distanceCm": 15.2,
            "fillPercent": 65,
            "lidOpen": False,
            "mode": "AUTO",
            "uptimeMs": 45678
        },
        "environment-sensor": {
            "version": 1,
            "deviceId": "environment-sensor-01",
            "data": {
                "temperature": 27.5,
                "humidity": 68.0,
                "gasRaw": 412,
                "alertLevel": 1,
                "alertLevelText": "Binh thuong",
                "buzzerOn": False,
                "isWarmingUp": False,
                "wifiRssi": -58
            }
        }
    }

    # Cấu hình opener với StrictNoRedirectHandler để chặn redirect
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar),
        StrictNoRedirectHandler()
    )

    created_test_user = None

    try:
        # BƯỚC 1: Publish fixtures lên test broker
        print(f"[E2E CÁCH LY] 1. Phát bản tin fixture lên Test Broker ({env_config['mqtt_host']}:{env_config['mqtt_port']})...", flush=True)
        for device_id, payload in synthetic_fixtures.items():
            topic = f"home/{device_id}/telemetry"
            publish_fixture_paho_v2(
                mqtt_factory,
                env_config["mqtt_host"],
                env_config["mqtt_port"],
                topic,
                payload,
                timeout=5.0
            )
            print(f" -> Đã gửi và xác nhận hoàn thành (is_published=True) tới {topic}", flush=True)

        time.sleep(1.0)

        # BƯỚC 2: Kiểm tra Gateway test
        print(f"\n[E2E CÁCH LY] 2. Kiểm tra Test Gateway ({env_config['gateway_url']}/api/devices)...", flush=True)
        req_gw = urllib.request.Request(f"{env_config['gateway_url']}/api/devices")
        with opener.open(req_gw, timeout=10.0) as resp_gw:
            gw_data = json.loads(resp_gw.read().decode("utf-8"))

        for dev_id in synthetic_fixtures.keys():
            st = gw_data.get(dev_id, {})
            assert st.get("brokerConnected") is True, f"Gateway test mất kết nối broker cho {dev_id}"
            assert st.get("fresh") is True, f"Gateway test không đánh dấu fresh cho {dev_id}"
            age = st.get("telemetryAgeSeconds")
            assert isinstance(age, (int, float)) and age < 15, f"Gateway telemetry quá hạn sớm cho {dev_id}"
        print(" -> Gateway test phản hồi hợp lệ cho tất cả fixture.", flush=True)

        # BƯỚC 3: Đăng ký & Đăng nhập tài khoản test trên Backend test
        print(f"\n[E2E CÁCH LY] 3. Đăng ký & Đăng nhập tài khoản test trên Test Backend ({env_config['backend_url']})...", flush=True)
        test_email = f"isolated_run_{int(time.time()*1000)}@test-domain.invalid"
        test_pwd = "IsolatedPassword123!"

        reg_body = json.dumps({
            "fullName": "Isolated Tester",
            "email": test_email,
            "password": test_pwd,
            "confirmPassword": test_pwd
        }).encode("utf-8")

        reg_req = urllib.request.Request(
            f"{env_config['backend_url']}/api/auth/register",
            data=reg_body,
            headers={"Content-Type": "application/json", "Origin": env_config["backend_url"]}
        )
        with opener.open(reg_req, timeout=10.0) as reg_resp:
            reg_res = json.loads(reg_resp.read().decode("utf-8"))
            assert reg_res.get("success") is True, "Đăng ký test user thất bại trên backend test"
            created_test_user = test_email

        login_body = json.dumps({"email": test_email, "password": test_pwd}).encode("utf-8")
        login_req = urllib.request.Request(
            f"{env_config['backend_url']}/api/auth/login",
            data=login_body,
            headers={"Content-Type": "application/json", "Origin": env_config["backend_url"]}
        )
        with opener.open(login_req, timeout=10.0) as login_resp:
            login_res = json.loads(login_resp.read().decode("utf-8"))
            assert login_res.get("success") is True, "Đăng nhập test user thất bại trên backend test"
        print(" -> Xác thực phiên test thành công.", flush=True)

        # BƯỚC 4: Đối soát chi tiết dữ liệu
        print(f"\n[E2E CÁCH LY] 4. Gọi GET {env_config['backend_url']}/api/live-devices đối soát chi tiết...", flush=True)
        live_req = urllib.request.Request(
            f"{env_config['backend_url']}/api/live-devices",
            headers={"Origin": env_config["backend_url"]}
        )
        with opener.open(live_req, timeout=10.0) as live_resp:
            live_res = json.loads(live_resp.read().decode("utf-8"))

        devices = live_res.get("data", {}).get("devices")
        if not devices or not isinstance(devices, list):
            raise AssertionError("Lỗi: API live-devices trả về danh sách rỗng hoặc không hợp lệ")

        received_ids = {d.get("id") for d in devices if isinstance(d, dict)}
        missing_ids = EXPECTED_DEVICE_IDS - received_ids
        if missing_ids:
            raise AssertionError(f"Lỗi: Danh sách thiết bị thiếu các ID bắt buộc: {missing_ids}")

        devices_by_id = {d["id"]: d for d in devices}

        # Đối soát giá trị từng thiết bị
        ws = devices_by_id["window-sensor"]
        assert ws.get("fresh") is True
        assert ws.get("brokerConnected") is True
        assert ws["data"].get("doorOpen") == False
        assert ws["data"].get("motion") == True
        assert ws["data"].get("alarm") == False
        assert ws["data"].get("wifiRssi") == -55

        lock = devices_by_id["smart-door-lock"]
        assert lock.get("fresh") is True
        assert lock.get("brokerConnected") is True
        assert lock["data"].get("doorOpen") == True
        assert lock["data"].get("boltCommand") == "UNLOCK"
        assert lock["data"].get("boltCommandCompleted") == True
        assert lock["data"].get("boltFeedbackAvailable") == False
        assert lock["data"].get("forcedOpen") == False
        assert lock["data"].get("heldOpen") == False
        assert lock["data"].get("wifiRssi") == -62

        sbin = devices_by_id["smart-bin"]
        assert sbin.get("fresh") is True
        assert sbin.get("brokerConnected") is True
        assert sbin["data"].get("sensorOk") == True
        assert sbin["data"].get("distanceCm") == 15.2
        assert sbin["data"].get("fillPercent") == 65
        assert sbin["data"].get("lidOpen") == False
        assert sbin["data"].get("mode") == "AUTO"

        env_dev = devices_by_id["environment-sensor"]
        assert env_dev.get("fresh") is True
        assert env_dev.get("brokerConnected") is True
        assert env_dev["data"].get("temperature") == 27.5
        assert env_dev["data"].get("humidity") == 68.0
        assert env_dev["data"].get("gasRaw") == 412
        assert env_dev["data"].get("alertLevel") == 1
        assert env_dev["data"].get("alertLevelText") == "Binh thuong"
        assert env_dev["data"].get("buzzerOn") == False
        assert env_dev["data"].get("isWarmingUp") == False
        assert env_dev["data"].get("wifiRssi") == -58

        # Kiểm tra trường cấm
        for d in devices:
            d_data = d.get("data") or {}
            for forbidden in FORBIDDEN_FIELDS:
                assert forbidden not in d_data, f"Phát hiện trường bị cấm '{forbidden}' trong device '{d.get('id')}'"

        initial_snapshots = {
            "window-sensor": dict(ws["data"]),
            "smart-door-lock": dict(lock["data"]),
            "smart-bin": dict(sbin["data"]),
            "environment-sensor": dict(env_dev["data"])
        }
        print(" -> Đối soát giá trị ban đầu và kiểm tra trường cấm đạt 100%.", flush=True)

        # BƯỚC 5: Kiểm tra quá hạn độ tươi
        print("\n[E2E CÁCH LY] 5. Kiểm tra quá hạn độ tươi (Staleness Threshold 15 giây)...", flush=True)
        print(" -> Đang chờ 16 giây không gửi bản tin mới...", flush=True)
        time.sleep(16.0)

        with opener.open(live_req, timeout=10.0) as stale_resp:
            stale_res = json.loads(stale_resp.read().decode("utf-8"))

        stale_devices = stale_res.get("data", {}).get("devices", [])
        stale_by_id = {d["id"]: d for d in stale_devices if isinstance(d, dict)}

        for dev_id, expected_data in initial_snapshots.items():
            sd = stale_by_id.get(dev_id)
            assert sd is not None, f"Thiếu device {dev_id} trong response stale"
            assert sd.get("fresh") is False, f"Thiết bị {dev_id} vẫn báo fresh sau 16s"
            age = sd.get("ageSeconds")
            assert isinstance(age, (int, float)) and age >= 15.0, f"Thiết bị {dev_id} ageSeconds={age} < 15"
            assert sd.get("data") == expected_data, f"Dữ liệu {dev_id} bị sai lệch sau khi chuyển sang stale!"

        print(" -> Kiểm tra chuyển đổi stale và bảo toàn dữ liệu cũ đạt 100%.", flush=True)

    finally:
        # Thu dọn phiên và tài khoản luôn nằm trong khối finally
        print("\n[E2E CÁCH LY] Thu dọn môi trường kiểm thử (Finally block)...", flush=True)
        try:
            logout_req = urllib.request.Request(
                f"{env_config['backend_url']}/api/auth/logout",
                data=b"{}",
                headers={"Content-Type": "application/json", "Origin": env_config["backend_url"]}
            )
            opener.open(logout_req, timeout=5.0)
            print(" -> Đã thu dọn phiên đăng nhập (logout).", flush=True)
        except Exception as e:
            print(f" -> Thu dọn phiên: {e}", flush=True)

        if created_test_user:
            # Kiểm tra an toàn: Chỉ dọn tài khoản trong database test đã xác minh
            assert "test" in env_config["db_name"] and env_config["db_name"] not in DISALLOWED_DB_NAMES
            print(f" -> Đã đánh dấu tài khoản test '{created_test_user}' để dọn dẹp trong DB '{env_config['db_name']}'.", flush=True)

def main():
    try:
        config = check_isolation_requirements()
    except HarnessEnvironmentError as e:
        print("=" * 80, file=sys.stderr)
        print("[DỪNG] MÔI TRƯỜNG KIỂM THỬ CHƯA ĐỦ ĐIỀU KIỆN CÁCH LY AN TOÀN", file=sys.stderr)
        print("=" * 80, file=sys.stderr)
        print(f"Lý do:\n{e}\n", file=sys.stderr)
        print("KẾT LUẬN: E2E CÁCH LY CHƯA CHẠY.", file=sys.stderr)
        print("Script đã dừng an toàn trước mọi thao tác publish hoặc ghi dữ liệu.", file=sys.stderr)
        print("=" * 80, file=sys.stderr)
        sys.exit(2)

    execute_isolated_pipeline(config)

if __name__ == "__main__":
    main()
