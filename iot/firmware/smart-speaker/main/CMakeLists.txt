idf_component_register(SRCS "main.c"
                       INCLUDE_DIRS "."
                       REQUIRES driver esp-sr esp_wifi esp_event esp_netif nvs_flash esp_http_client
                       EMBED_FILES "light_on.wav" "light_off.wav"
                       "gas_normal.wav" "gas_warning.wav" "gas_danger.wav"
                       "gas_warmup.wav" "gas_unknown.wav" "device_offline.wav")
