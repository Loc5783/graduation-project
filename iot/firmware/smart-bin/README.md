# Smart bin - PlatformIO

Open this complete project folder in VS Code with PlatformIO. The first build
downloads the two TFT libraries automatically.

## ESP32 wiring

| Device pin | Connect to ESP32 / power |
|---|---|
| SG90 signal (orange/yellow) | D25 / GPIO25 |
| SG90 red | external regulated 5 V |
| SG90 brown/black | external supply GND |
| HC-SR04 VCC | VIN (5 V from ESP32 USB) |
| HC-SR04 GND | GND |
| HC-SR04 TRIG | D26 / GPIO26 |
| HC-SR04 ECHO | 2.2k resistor -> D34 / GPIO34 |
| D34 / GPIO34 | 3.3k resistor -> GND |
| TFT LED | 3V3 |
| TFT SCK | D18 / GPIO18 |
| TFT SDA | D23 / GPIO23 |
| TFT A0 | D16 / GPIO16 |
| TFT RESET | D17 / GPIO17 |
| TFT CS | D5 / GPIO5 |
| TFT GND | GND |
| TFT VCC | 3V3 |
| Green LED anode | D27 / GPIO27 through 220-330 ohm resistor |
| Yellow LED anode | D32 / GPIO32 through 220-330 ohm resistor |
| Red LED anode | D33 / GPIO33 through 220-330 ohm resistor |
| All LED cathodes | GND |

All grounds must be connected together: ESP32 GND, HC-SR04 GND, TFT GND, and
the external servo-power GND. Do not connect HC-SR04 ECHO directly to ESP32.

Each LED must have its own 220-330 ohm series resistor. Never connect an LED
directly between a GPIO and GND.

## Sensor placement and calibration

Mount HC-SR04 at the top inside the bin, pointing straight down. In
`src/main.cpp`, change these values to match the real bin:

- `EMPTY_DISTANCE_CM`: sensor-to-bottom distance with an empty bin (default 30 cm)
- `FULL_DISTANCE_CM`: sensor-to-trash distance considered full (default 5 cm)

## Behaviour

- 0-39%: green LED, TFT shows LOW.
- 40-79%: yellow LED, TFT shows MEDIUM.
- 80-100%: red LED, TFT shows FULL, and servo rotates from 10 to 90 degrees.
- The servo returns to 10 degrees after the level falls to 75% or less.
- TFT shows trash percentage, status, and a fill bar.

## Local web control

The ESP32 also creates the Wi-Fi network `SmartBin-Local`. Connect a phone or
laptop to it with the password in the local `src/wifi_config.h` file, then open
`http://192.168.4.1` in a browser. This works without a laptop server or
Internet. The page shows the measured fill level and has three buttons:

- **MỞ NẮP**: hold the lid open manually.
- **ĐÓNG NẮP**: hold the lid closed manually.
- **TỰ ĐỘNG**: return to the existing sensor-based rule (open at 80%, close at 75%).

The ESP32 also tries the `IOT_24G` Wi-Fi configured in `src/wifi_config.h`.
When connected, Serial Monitor prints a second web address for devices on
that same network. The local configuration file is excluded from Git so the
Wi-Fi passwords are not committed.

To upload from PlatformIO: open this folder, select `esp32dev`, then press
**Upload**. Use **Monitor** at 115200 baud to see the Wi-Fi address. You can
also run `platformio.exe run -e esp32dev -t upload --upload-port COM5` if
the bin board currently appears as COM5; check Device Manager when the port
changes.
