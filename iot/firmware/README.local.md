# Device firmware sources

The hardware source snapshots were collected on 2026-11-08. Existing originals remain at their original locations. These folders are not yet integrated with the dashboard or each other.

| Folder | Source | Status |
| --- | --- | --- |
| smart-speaker | C:\iot_hybrid_project | ESP-IDF voice firmware, mic, speaker, TFT, local dashboard HTTP |
| smart-bin | C:\iot_offline_project\smart_bin_platformio | PlatformIO bin with local web |
| smart-curtain | C:\iot_offline_project\smart_curtain_platformio | PlatformIO curtain |
| smart-door-lock | Loc5783/graduation-project branch module/smart-door-lock | Team firmware |
| environment-sensor | Loc5783/graduation-project branch integration | Team firmware |
| window-sensor | Loc5783/graduation-project branch windowsensor | Team firmware |

For local builds, copy each *example.h to the corresponding actual config filename and enter private Wi-Fi details locally. Never commit those private files. Speaker ESP-IDF scripts retain the original C:\ paths and need adapting before building from this new folder. Managed dependencies, build outputs, and private config files were not copied. Smart plug had no device firmware in the inspected repository branch.
