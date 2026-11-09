# Smart curtain - ESP32

Independent PlatformIO project. No speaker or servo is used.
LED ON represents a closed curtain; LED OFF represents an open curtain.
The ESP32 also serves a local web page for OPEN, CLOSE and AUTO control.

## Wiring

| Device pin | ESP32 |
|---|---|
| Light sensor VCC | 3V3 |
| Light sensor GND | GND |
| Light sensor A0 | GPIO34 |
| Light sensor D0 | Not connected |
| LED anode | GPIO27 through 220-330 ohm resistor |
| LED cathode | GND |
| TFT VCC and LED | 3V3 |
| TFT GND | GND |
| TFT SCK | GPIO18 |
| TFT SDA | GPIO23 |
| TFT A0/DC | GPIO16 |
| TFT RESET | GPIO17 |
| TFT CS | GPIO5 |

Power the ESP32 over USB. Disconnect the old ultrasonic sensor and servo
before using these pins. The sensor A0 and TFT A0 are separate signals.

## Build and upload

Open this folder in VS Code / PlatformIO. Check `src/wifi_config.h`,
then Build and Upload to the curtain ESP32 only. Do not upload it to the bin ESP32.
Serial Monitor baud rate: 115200. Upload replaces the running firmware on
the board; the smart-bin source project stays unchanged.

After Wi-Fi connects, Serial Monitor prints `Curtain web: http://<ESP_IP>`.
Open that address from a device on the same Wi-Fi. The page shows measured
brightness and current curtain state. OPEN and CLOSE override the light sensor;
AUTO returns control to the sensor. This is a local HTTP page on port 80 and
does not require Uvicorn or Internet access. If the ESP loses Wi-Fi, the sensor
and LED still run; the ESP retries Wi-Fi automatically.

## Calibration

The default assumes lower ADC means brighter light. Calibrate for your module:

1. Cover the sensor, wait at least 2 seconds, send `d` in Serial Monitor.
2. Illuminate the sensor, wait at least 2 seconds, send `b`.
3. Both readings must differ by at least 100 ADC units. If rejected, establish
   a more distinct dark/bright condition and repeat the command.

Calibration is saved on the ESP32 and supports either ADC direction.
Send `r` to restore defaults. The displayed percentage is relative brightness
between your two calibration readings, not lux.

## Behavior

- In AUTO: brightness >=70% for 2 seconds: CLOSED, LED ON.
- In AUTO: brightness <=45% for 2 seconds: OPEN, LED OFF.
- Between thresholds: keep the current state.
- In manual OPEN/CLOSE: the web command determines LED state until AUTO is selected.
- ADC sampled every 50 ms and smoothed; TFT and Serial update every 500 ms.
- Startup state is OPEN until a stable closing condition is detected.

Adjust CLOSE_PERCENT, OPEN_PERCENT and HOLD_MS in src/main.cpp if needed.
