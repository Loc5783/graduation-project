#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/i2s_std.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "esp_afe_config.h"
#include "esp_afe_sr_iface.h"
#include "esp_afe_sr_models.h"
#include "esp_mn_iface.h"
#include "esp_mn_models.h"
#include "esp_mn_speech_commands.h"
#include "model_path.h"
#include "hybrid_config.h"

#define TAG "OFFLINE_EN"
#define LED_GPIO GPIO_NUM_15
#define MIC_BCLK GPIO_NUM_12
#define MIC_WS GPIO_NUM_13
#define MIC_SD GPIO_NUM_14
#define SPEAKER_BCLK GPIO_NUM_4
#define SPEAKER_WS GPIO_NUM_5
#define SPEAKER_DOUT GPIO_NUM_7
#define TFT_SCLK GPIO_NUM_6
#define TFT_MOSI GPIO_NUM_8
#define TFT_CS GPIO_NUM_9
#define TFT_DC GPIO_NUM_10
#define TFT_RST GPIO_NUM_11
#define TFT_WIDTH 240
#define TFT_HEIGHT 320
#define SAMPLE_RATE 16000
#define WAKENET_THRESHOLD 0.45f
#define COMMAND_LIGHT_ON 1
#define COMMAND_LIGHT_OFF 2
#define COMMAND_BIN_OPEN 3
#define COMMAND_BIN_CLOSE 4
#define COMMAND_BIN_AUTO 5
#define COMMAND_BIN_STATUS 9
#define COMMAND_DOOR_STATUS 11
#define COMMAND_WINDOW_STATUS 12
#define COMMAND_ENV_STATUS 13

static const esp_afe_sr_iface_t *afe_handle;
static esp_afe_sr_data_t *afe_data;
static srmodel_list_t *models;
static i2s_chan_handle_t mic_rx;
static i2s_chan_handle_t speaker_tx;
static spi_device_handle_t tft_spi;
static uint16_t *tft_frame;
static volatile bool running = true;
static volatile bool awake = false;
static QueueHandle_t command_log_queue;

typedef struct {
    char command[16];
    uint32_t sequence;
} command_log_t;
static uint32_t command_sequence;
static void tft_fill(uint16_t color);
static void tft_show_message(uint16_t background, uint16_t foreground,
                             const char *line1, const char *line2);

extern const uint8_t light_on_wav_start[] asm("_binary_light_on_wav_start");
extern const uint8_t light_on_wav_end[] asm("_binary_light_on_wav_end");
extern const uint8_t light_off_wav_start[] asm("_binary_light_off_wav_start");
extern const uint8_t light_off_wav_end[] asm("_binary_light_off_wav_end");

static void rearm_wakenet(void)
{
    awake = false;
    afe_handle->disable_wakenet(afe_data);
    afe_handle->reset_buffer(afe_data);
    afe_handle->enable_wakenet(afe_data);
    int threshold_result = afe_handle->set_wakenet_threshold(
        afe_data, 1, WAKENET_THRESHOLD);
    tft_show_message(0x001f, 0xffff, "SAY HI ESP", "READY");
    ESP_LOGI(TAG, "WakeNet rearmed (threshold %.2f, result %d). Say Hi ESP.",
             WAKENET_THRESHOLD, threshold_result);
}

static void tft_send(const void *data, size_t length, int dc)
{
    gpio_set_level(TFT_DC, dc);
    spi_transaction_t transaction = {
        .length = length * 8,
        .tx_buffer = data,
    };
    ESP_ERROR_CHECK(spi_device_transmit(tft_spi, &transaction));
}

static void tft_command(uint8_t command)
{
    tft_send(&command, 1, 0);
}

static void tft_data(const void *data, size_t length)
{
    tft_send(data, length, 1);
}

static void tft_set_window(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1)
{
    uint8_t columns[] = {x0 >> 8, x0 & 0xff, x1 >> 8, x1 & 0xff};
    uint8_t rows[] = {y0 >> 8, y0 & 0xff, y1 >> 8, y1 & 0xff};
    tft_command(0x2a);
    tft_data(columns, sizeof(columns));
    tft_command(0x2b);
    tft_data(rows, sizeof(rows));
    tft_command(0x2c);
}

static void tft_fill(uint16_t color)
{
    tft_set_window(0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1);

    uint8_t pixels[512];
    for (size_t i = 0; i < sizeof(pixels); i += 2) {
        pixels[i] = color >> 8;
        pixels[i + 1] = color;
    }
    int remaining = TFT_WIDTH * TFT_HEIGHT;
    while (remaining > 0) {
        int count = remaining > 256 ? 256 : remaining;
        tft_send(pixels, count * 2, 1);
        remaining -= count;
    }
}

static const uint8_t font_az[26][5] = {
    {0x7e,0x11,0x11,0x11,0x7e},{0x7f,0x49,0x49,0x49,0x36},
    {0x3e,0x41,0x41,0x41,0x22},{0x7f,0x41,0x41,0x22,0x1c},
    {0x7f,0x49,0x49,0x49,0x41},{0x7f,0x09,0x09,0x09,0x01},
    {0x3e,0x41,0x49,0x49,0x7a},{0x7f,0x08,0x08,0x08,0x7f},
    {0x00,0x41,0x7f,0x41,0x00},{0x20,0x40,0x41,0x3f,0x01},
    {0x7f,0x08,0x14,0x22,0x41},{0x7f,0x40,0x40,0x40,0x40},
    {0x7f,0x02,0x0c,0x02,0x7f},{0x7f,0x04,0x08,0x10,0x7f},
    {0x3e,0x41,0x41,0x41,0x3e},{0x7f,0x09,0x09,0x09,0x06},
    {0x3e,0x41,0x51,0x21,0x5e},{0x7f,0x09,0x19,0x29,0x46},
    {0x46,0x49,0x49,0x49,0x31},{0x01,0x01,0x7f,0x01,0x01},
    {0x3f,0x40,0x40,0x40,0x3f},{0x1f,0x20,0x40,0x20,0x1f},
    {0x3f,0x40,0x38,0x40,0x3f},{0x63,0x14,0x08,0x14,0x63},
    {0x07,0x08,0x70,0x08,0x07},{0x61,0x51,0x49,0x45,0x43}
};

static uint16_t swap16(uint16_t value)
{
    return (uint16_t)((value << 8) | (value >> 8));
}

static void frame_text(const char *text, int x, int y, int scale, uint16_t color)
{
    uint16_t pixel = swap16(color);
    while (*text) {
        char ch = *text++;
        if (ch >= 'a' && ch <= 'z') ch -= 32;
        const uint8_t *glyph = (ch >= 'A' && ch <= 'Z') ? font_az[ch - 'A'] : NULL;
        if (glyph) {
            for (int column = 0; column < 5; ++column) {
                for (int row = 0; row < 7; ++row) {
                    if (!(glyph[column] & (1U << row))) continue;
                    for (int dx = 0; dx < scale; ++dx) {
                        for (int dy = 0; dy < scale; ++dy) {
                            int px = x + column * scale + dx;
                            int py = y + row * scale + dy;
                            if (px >= 0 && px < TFT_WIDTH && py >= 0 && py < TFT_HEIGHT)
                                tft_frame[py * TFT_WIDTH + px] = pixel;
                        }
                    }
                }
            }
        }
        x += 6 * scale;
        if (x + 5 * scale >= TFT_WIDTH) break;
    }
}

static void frame_rect(int x, int y, int width, int height, uint16_t color)
{
    uint16_t pixel = swap16(color);
    for (int py = y; py < y + height && py < TFT_HEIGHT; ++py) {
        if (py < 0) continue;
        for (int px = x; px < x + width && px < TFT_WIDTH; ++px) {
            if (px >= 0) tft_frame[py * TFT_WIDTH + px] = pixel;
        }
    }
}

static void frame_outline(int x, int y, int width, int height, int thickness,
                          uint16_t color)
{
    frame_rect(x, y, width, thickness, color);
    frame_rect(x, y + height - thickness, width, thickness, color);
    frame_rect(x, y, thickness, height, color);
    frame_rect(x + width - thickness, y, thickness, height, color);
}

static void frame_center_text(const char *text, int y, int scale, uint16_t color)
{
    int width = (int)strlen(text) * 6 * scale;
    int x = (TFT_WIDTH - width) / 2;
    if (x < 4) x = 4;
    frame_text(text, x, y, scale, color);
}

static void frame_waveform(int center_y, uint16_t color)
{
    static const uint8_t heights[] = {10, 20, 34, 52, 72, 48, 28, 16, 8};
    const int bar_width = 8;
    const int gap = 7;
    const int total = (int)(sizeof(heights)) * (bar_width + gap) - gap;
    int x = (TFT_WIDTH - total) / 2;
    for (size_t i = 0; i < sizeof(heights); ++i) {
        frame_rect(x, center_y - heights[i] / 2, bar_width, heights[i], color);
        x += bar_width + gap;
    }
}

static void tft_push_frame(void)
{
    tft_set_window(0, 0, TFT_WIDTH - 1, TFT_HEIGHT - 1);
    for (int offset = 0; offset < TFT_WIDTH * TFT_HEIGHT; offset += 256) {
        int count = TFT_WIDTH * TFT_HEIGHT - offset;
        if (count > 256) count = 256;
        tft_send(tft_frame + offset, count * sizeof(uint16_t), 1);
    }
}

static void tft_show_message(uint16_t background, uint16_t foreground,
                             const char *line1, const char *line2)
{
    (void)foreground;
    if (!tft_frame) {
        tft_fill(background);
        return;
    }
    uint16_t dark = swap16(0x0841);
    for (int i = 0; i < TFT_WIDTH * TFT_HEIGHT; ++i) tft_frame[i] = dark;

    frame_rect(0, 0, TFT_WIDTH, 9, background);
    frame_outline(8, 17, TFT_WIDTH - 16, TFT_HEIGHT - 34, 2, 0x18e3);
    frame_center_text("ESP VOICE", 30, 2, 0x7dff);
    frame_rect(25, 58, TFT_WIDTH - 50, 2, background);

    int title_scale = strlen(line1) > 11 ? 2 : 3;
    frame_center_text(line1, 82, title_scale, 0xffff);
    frame_center_text(line2, 132, 2, background);
    frame_waveform(222, background);
    frame_center_text("OFFLINE AI", 279, 1, 0x7bef);
    frame_rect(0, TFT_HEIGHT - 9, TFT_WIDTH, 9, background);
    tft_push_frame();
}

static void tft_show_recognized(const char *text)
{
    char first[15] = {0};
    char second[15] = {0};
    size_t length = strlen(text);
    size_t split = length > 14 ? 14 : length;
    if (length > 14) {
        for (size_t i = 14; i > 0; --i) {
            if (text[i] == ' ') { split = i; break; }
        }
    }
    memcpy(first, text, split);
    const char *rest = text + split;
    while (*rest == ' ') ++rest;
    strncpy(second, rest, sizeof(second) - 1);

    uint16_t dark = swap16(0x0841);
    for (int i = 0; i < TFT_WIDTH * TFT_HEIGHT; ++i) tft_frame[i] = dark;
    frame_rect(0, 0, TFT_WIDTH, 9, 0xffe0);
    frame_outline(8, 17, TFT_WIDTH - 16, TFT_HEIGHT - 34, 2, 0x7bef);
    frame_center_text("VOICE CAPTURED", 31, 2, 0xffe0);
    frame_rect(18, 73, TFT_WIDTH - 36, 112, 0x10a2);
    frame_outline(18, 73, TFT_WIDTH - 36, 112, 2, 0xffe0);
    frame_center_text(first, 101, 2, 0xffff);
    frame_center_text(second, 137, 2, 0xffff);
    frame_waveform(230, 0xffe0);
    frame_center_text("PROCESSING", 280, 1, 0x7dff);
    frame_rect(0, TFT_HEIGHT - 9, TFT_WIDTH, 9, 0xffe0);
    tft_push_frame();
}

static void init_tft(void)
{
    gpio_config_t control_pins = {
        .pin_bit_mask = (1ULL << TFT_DC) | (1ULL << TFT_RST),
        .mode = GPIO_MODE_OUTPUT,
    };
    ESP_ERROR_CHECK(gpio_config(&control_pins));

    gpio_set_level(TFT_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(2));
    gpio_set_level(TFT_RST, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(TFT_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(120));

    spi_bus_config_t bus = {
        .mosi_io_num = TFT_MOSI,
        .miso_io_num = -1,
        .sclk_io_num = TFT_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 512,
    };
    ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO));
    spi_device_interface_config_t device = {
        .clock_speed_hz = 10 * 1000 * 1000,
        .mode = 0,
        .spics_io_num = TFT_CS,
        .queue_size = 1,
    };
    ESP_ERROR_CHECK(spi_bus_add_device(SPI2_HOST, &device, &tft_spi));

    // ST7789 240x320 initialization.
    tft_command(0x01); // Software reset
    vTaskDelay(pdMS_TO_TICKS(150));
    tft_command(0x11); // Sleep out
    vTaskDelay(pdMS_TO_TICKS(120));
    uint8_t pixel_format = 0x55; // RGB565
    tft_command(0x3a);
    tft_data(&pixel_format, 1);
    uint8_t madctl = 0x00;
    tft_command(0x36);
    tft_data(&madctl, 1);
    tft_command(0x21); // Display inversion on (IPS panels)
    tft_command(0x13); // Normal display mode
    tft_command(0x29); // Display on
    vTaskDelay(pdMS_TO_TICKS(100));
    tft_frame = heap_caps_malloc(TFT_WIDTH * TFT_HEIGHT * sizeof(uint16_t),
                                 MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_LOGI(TAG, "TFT ST7789 240x320 initialized at 10 MHz");
    tft_fill(0xf800);
    vTaskDelay(pdMS_TO_TICKS(300));
    tft_fill(0x07e0);
    vTaskDelay(pdMS_TO_TICKS(300));
    tft_fill(0x001f);
    vTaskDelay(pdMS_TO_TICKS(300));
    tft_show_message(0x001f, 0xffff, "SAY HI ESP", "READY");
}

static void init_speaker(void)
{
    i2s_chan_config_t channel_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&channel_cfg, &speaker_tx, NULL));
    i2s_std_config_t config = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = SPEAKER_BCLK,
            .ws = SPEAKER_WS,
            .dout = SPEAKER_DOUT,
            .din = I2S_GPIO_UNUSED,
            .invert_flags = {0},
        },
    };
    ESP_ERROR_CHECK(i2s_channel_init_std_mode(speaker_tx, &config));
    ESP_ERROR_CHECK(i2s_channel_enable(speaker_tx));
}

static void speaker_play_wav(const uint8_t *start, const uint8_t *end)
{
    const uint8_t *pcm = NULL;
    size_t pcm_size = 0;
    for (const uint8_t *p = start + 12; p + 8 <= end;) {
        uint32_t size = (uint32_t)p[4] | ((uint32_t)p[5] << 8) |
                        ((uint32_t)p[6] << 16) | ((uint32_t)p[7] << 24);
        if (!memcmp(p, "data", 4) && p + 8 + size <= end) {
            pcm = p + 8;
            pcm_size = size;
            break;
        }
        p += 8 + size + (size & 1U);
    }
    if (!pcm) {
        ESP_LOGE(TAG, "Invalid embedded WAV");
        return;
    }
    const int16_t *mono = (const int16_t *)pcm;
    size_t samples = pcm_size / sizeof(int16_t);
    int16_t stereo[256 * 2];
    for (size_t offset = 0; offset < samples;) {
        size_t count = samples - offset;
        if (count > 256) count = 256;
        for (size_t i = 0; i < count; ++i) {
            stereo[i * 2] = mono[offset + i];
            stereo[i * 2 + 1] = mono[offset + i];
        }
        size_t written;
        ESP_ERROR_CHECK(i2s_channel_write(speaker_tx, stereo,
                                           count * 2 * sizeof(int16_t),
                                           &written, portMAX_DELAY));
        offset += count;
    }
}

static void init_microphone(void)
{
    i2s_chan_config_t channel_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&channel_cfg, NULL, &mic_rx));

    i2s_std_config_t mic_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = MIC_BCLK,
            .ws = MIC_WS,
            .dout = I2S_GPIO_UNUSED,
            .din = MIC_SD,
            .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
        },
    };
    mic_cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;
    ESP_ERROR_CHECK(i2s_channel_init_std_mode(mic_rx, &mic_cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(mic_rx));
}

static void microphone_feed_task(void *arg)
{
    (void)arg;
    const int samples = afe_handle->get_feed_chunksize(afe_data);
    int32_t *raw = heap_caps_malloc(samples * sizeof(int32_t), MALLOC_CAP_INTERNAL);
    int16_t *pcm = heap_caps_malloc(samples * sizeof(int16_t), MALLOC_CAP_INTERNAL);
    assert(raw && pcm);
    TickType_t last_level_log = xTaskGetTickCount();
    int peak_since_log = 0;

    while (running) {
        size_t bytes_read = 0;
        ESP_ERROR_CHECK(i2s_channel_read(mic_rx, raw, samples * sizeof(int32_t), &bytes_read, portMAX_DELAY));
        int count = bytes_read / sizeof(int32_t);
        for (int i = 0; i < count; ++i) {
            pcm[i] = (int16_t)(raw[i] >> 14); // INMP441 24-bit data to signed 16-bit
            int level = abs((int)pcm[i]);
            if (level > peak_since_log) {
                peak_since_log = level;
            }
        }
        if (count == samples) {
            afe_handle->feed(afe_data, pcm);
        }
        TickType_t now = xTaskGetTickCount();
        if (now - last_level_log >= pdMS_TO_TICKS(1000)) {
            ESP_LOGI(TAG, "Mic level: %d", peak_since_log);
            peak_since_log = 0;
            last_level_log = now;
        }
    }
    free(raw);
    free(pcm);
    vTaskDelete(NULL);
}

static void queue_dashboard_log(const char *command)
{
    if (!command_log_queue) return;
    command_log_t entry = {0};
    strlcpy(entry.command, command, sizeof(entry.command));
    entry.sequence = ++command_sequence;
    if (xQueueSend(command_log_queue, &entry, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Dashboard queue full; latest command was not sent.");
    }
}

static const char *remote_command_name(int command)
{
    switch (command) {
    case COMMAND_BIN_OPEN: return "BIN_OPEN";
    case COMMAND_BIN_CLOSE: return "BIN_CLOSE";
    case COMMAND_BIN_AUTO: return "BIN_AUTO";
    case COMMAND_BIN_STATUS: return "BIN_STATUS";
    case COMMAND_DOOR_STATUS: return "DOOR_STATUS";
    case COMMAND_WINDOW_STATUS: return "WINDOW_STATUS";
    case COMMAND_ENV_STATUS: return "ENV_STATUS";
    default: return NULL;
    }
}

static void apply_light_command(int command)
{
    if (command == COMMAND_LIGHT_ON) {
        gpio_set_level(LED_GPIO, 1);
        tft_show_message(0x07e0, 0x0000, "LIGHT ON", "LED ENABLED");
        ESP_LOGI(TAG, "LIGHT ON");
        speaker_play_wav(light_on_wav_start, light_on_wav_end);
        queue_dashboard_log("LIGHT_ON");
    } else if (command == COMMAND_LIGHT_OFF) {
        gpio_set_level(LED_GPIO, 0);
        tft_show_message(0xf800, 0xffff, "LIGHT OFF", "LED DISABLED");
        ESP_LOGI(TAG, "LIGHT OFF");
        speaker_play_wav(light_off_wav_start, light_off_wav_end);
        queue_dashboard_log("LIGHT_OFF");
    } else {
        const char *name = remote_command_name(command);
        if (name) {
            tft_show_message(0x001f, 0xffff, name, "SENDING TO HUB");
            ESP_LOGI(TAG, "Voice request: %s", name);
            queue_dashboard_log(name);
        }
    }
}

static void recognition_task(void *arg)
{
    (void)arg;
    char *model_name = esp_srmodel_filter(models, ESP_MN_PREFIX, ESP_MN_ENGLISH);
    assert(model_name);
    esp_mn_iface_t *multinet = esp_mn_handle_from_name(model_name);
    assert(multinet);
    model_iface_data_t *model_data = multinet->create(model_name, 6000);
    assert(model_data);

    ESP_ERROR_CHECK(esp_mn_commands_clear());
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_ON, "TURN ON THE LIGHT"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_ON, "LIGHTS ON"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_ON, "LIGHT ON"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_ON, "TURN LIGHT ON"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_OFF, "TURN OFF THE LIGHT"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_OFF, "LIGHTS OFF"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_OFF, "LIGHT OFF"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_LIGHT_OFF, "TURN LIGHT OFF"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_OPEN, "OPEN THE BIN"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_CLOSE, "CLOSE THE BIN"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_AUTO, "AUTOMATIC BIN"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_STATUS, "BIN STATUS"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_STATUS, "CHECK THE BIN"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_BIN_STATUS, "CHECK BIN"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_DOOR_STATUS, "DOOR STATUS"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_DOOR_STATUS, "CHECK THE DOOR"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_DOOR_STATUS, "CHECK DOOR"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_DOOR_STATUS, "DOOR STATE"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_WINDOW_STATUS, "WINDOW STATUS"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_WINDOW_STATUS, "CHECK THE WINDOW"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_WINDOW_STATUS, "CHECK WINDOW"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_ENV_STATUS, "GAS STATUS"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_ENV_STATUS, "CHECK THE GAS"));
    ESP_ERROR_CHECK(esp_mn_commands_add(COMMAND_ENV_STATUS, "GAS LEVEL"));
    assert(esp_mn_commands_update() == NULL);
    multinet->print_active_speech_commands(model_data);
    ESP_LOGI(TAG, "Say Hi ESP, wait, then say turn on the light or turn off the light.");
    awake = false;
    tft_show_message(0x001f, 0xffff, "SAY HI ESP", "READY");

    while (running) {
        afe_fetch_result_t *result = afe_handle->fetch(afe_data);
        if (!result || result->ret_value == ESP_FAIL) {
            ESP_LOGW(TAG, "AFE fetch error");
            continue;
        }
        if (result->wakeup_state == WAKENET_DETECTED) {
            afe_handle->disable_wakenet(afe_data);
            awake = true;
            multinet->clean(model_data);
            tft_show_message(0xffe0, 0x0000, "LISTEN", "SAY COMMAND");
            ESP_LOGI(TAG, "Wake word heard. Listening for command.");
        }
        if (!awake) {
            continue;
        }

        esp_mn_state_t state = multinet->detect(model_data, result->data);
        if (state == ESP_MN_STATE_DETECTED) {
            esp_mn_results_t *answer = multinet->get_results(model_data);
            if (answer->num > 0) {
                int command = answer->command_id[0];
                ESP_LOGI(TAG, "Recognized: %s (%.2f)", answer->string, answer->prob[0]);
                tft_show_recognized(answer->string);
                if (answer->prob[0] < 0.15f) {
                    ESP_LOGW(TAG, "Ignored low-confidence command.");
                    multinet->clean(model_data);
                    rearm_wakenet();
                    continue;
                }
                apply_light_command(command);
                multinet->clean(model_data);
                rearm_wakenet();
            }
        } else if (state == ESP_MN_STATE_TIMEOUT) {
            multinet->clean(model_data);
            rearm_wakenet();
            ESP_LOGI(TAG, "Command timeout. Say Hi ESP again.");
        }
    }
    multinet->destroy(model_data);
    vTaskDelete(NULL);
}

static bool wifi_has_ip(void)
{
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    esp_netif_ip_info_t info = {0};
    return netif && esp_netif_get_ip_info(netif, &info) == ESP_OK && info.ip.addr != 0;
}

static bool connect_wifi(void)
{
    if (WIFI_SSID[0] == '\0') return false;
    esp_err_t nvs = nvs_flash_init();
    if (nvs == ESP_ERR_NVS_NO_FREE_PAGES || nvs == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    } else {
        ESP_ERROR_CHECK(nvs);
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, WIFI_SSID, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, WIFI_PASSWORD, sizeof(config.sta.password));
    config.sta.threshold.authmode = WIFI_AUTH_OPEN;
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
    ESP_ERROR_CHECK(esp_wifi_start());
    // ESP-SR leaves very little internal RAM. Keeping the Wi-Fi PHY awake
    // avoids recreating its PLL timer after ESP-SR has consumed that RAM.
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_connect());

    tft_show_message(0x07ff, 0xffff, "CONNECTING", "WIFI");
    ESP_LOGI(TAG, "Trying Wi-Fi for hybrid mode...");
    for (int i = 0; i < 24; ++i) {
        if (wifi_has_ip()) {
            ESP_LOGI(TAG, "Wi-Fi connected. Dashboard logging is available.");
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    ESP_LOGW(TAG, "Wi-Fi unavailable. English offline mode will continue.");
    return false;
}

// Recognition never stops for Wi-Fi. This task simply reconnects in background.
static void wifi_retry_task(void *arg)
{
    (void)arg;
    if (WIFI_SSID[0] == '\0') {
        vTaskDelete(NULL);
        return;
    }
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(15000));
        if (!wifi_has_ip()) {
            ESP_LOGI(TAG, "Trying Wi-Fi again for dashboard...");
            esp_wifi_connect();
        }
    }
}

typedef struct {
    char text[512];
    size_t length;
} voice_reply_t;

static esp_err_t voice_log_http_event(esp_http_client_event_t *event)
{
    voice_reply_t *response = (voice_reply_t *)event->user_data;
    if (event->event_id == HTTP_EVENT_ON_DATA && response && event->data_len > 0) {
        size_t available = sizeof(response->text) - response->length - 1;
        size_t copy = (size_t)event->data_len < available ? (size_t)event->data_len : available;
        memcpy(response->text + response->length, event->data, copy);
        response->length += copy;
        response->text[response->length] = '\0';
    }
    return ESP_OK;
}

static void dashboard_log_task(void *arg)
{
    (void)arg;
    while (true) {
        command_log_t entry;
        xQueueReceive(command_log_queue, &entry, portMAX_DELAY);
        if (!wifi_has_ip()) {
            ESP_LOGW(TAG, "No Wi-Fi: command runs, but dashboard log waits in RAM.");
            vTaskDelay(pdMS_TO_TICKS(5000));
            xQueueSendToFront(command_log_queue, &entry, 0);
            continue;
        }
        char json[96];
        snprintf(json, sizeof(json), "{\"command\":\"%s\",\"sequence\":%lu}",
                 entry.command, (unsigned long)entry.sequence);
        voice_reply_t response = {0};
        esp_http_client_config_t config = {
            .url = DASHBOARD_LOG_URL,
            .event_handler = voice_log_http_event,
            .user_data = &response,
            .timeout_ms = 5000,
        };
        esp_http_client_handle_t client = esp_http_client_init(&config);
        esp_http_client_set_method(client, HTTP_METHOD_POST);
        esp_http_client_set_header(client, "Content-Type", "application/json");
        esp_http_client_set_post_field(client, json, strlen(json));
        esp_err_t result = esp_http_client_perform(client);
        int status = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "Dashboard log status: %d", status);
        esp_http_client_cleanup(client);
        if (result != ESP_OK || status != 200) {
            ESP_LOGW(TAG, "Dashboard unavailable: keeping command in queue.");
            vTaskDelay(pdMS_TO_TICKS(5000));
            xQueueSendToFront(command_log_queue, &entry, 0);
        } else if (strstr(entry.command, "_STATUS")) {
            char *display = strstr(response.text, "\"display\":\"");
            if (display) {
                display += strlen("\"display\":\"");
                char *end = strchr(display, '"');
                if (end && end - display < 48) {
                    *end = '\0';
                    tft_show_message(0x001f, 0xffff, display, "LATEST STATUS");
                    ESP_LOGI(TAG, "Device status: %s", display);
                }
            }
        }
    }
}

typedef struct {
    char text[64];
    size_t length;
} http_text_t;

static esp_err_t dashboard_http_event(esp_http_client_event_t *event)
{
    http_text_t *response = (http_text_t *)event->user_data;
    if (event->event_id == HTTP_EVENT_ON_DATA && response && event->data_len > 0) {
        size_t available = sizeof(response->text) - response->length - 1;
        size_t copy = (size_t)event->data_len < available ? (size_t)event->data_len : available;
        memcpy(response->text + response->length, event->data, copy);
        response->length += copy;
        response->text[response->length] = '\0';
    }
    return ESP_OK;
}

static void dashboard_control_task(void *arg)
{
    (void)arg;
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000));
        if (!wifi_has_ip()) continue;
        http_text_t response = {0};
        esp_http_client_config_t config = {
            .url = DASHBOARD_COMMAND_URL,
            .event_handler = dashboard_http_event,
            .user_data = &response,
            .timeout_ms = 2500,
        };
        esp_http_client_handle_t client = esp_http_client_init(&config);
        esp_err_t result = esp_http_client_perform(client);
        int status = esp_http_client_get_status_code(client);
        esp_http_client_cleanup(client);
        if (result != ESP_OK || status != 200) continue;
        if (strstr(response.text, "LIGHT_ON")) {
            ESP_LOGI(TAG, "Web command: LIGHT_ON");
            apply_light_command(COMMAND_LIGHT_ON);
        } else if (strstr(response.text, "LIGHT_OFF")) {
            ESP_LOGI(TAG, "Web command: LIGHT_OFF");
            apply_light_command(COMMAND_LIGHT_OFF);
        }
    }
}

void app_main(void)
{
    gpio_reset_pin(LED_GPIO);
    gpio_set_direction(LED_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_GPIO, 0);
    init_tft();
    init_microphone();
    init_speaker();

    bool wifi_connected = connect_wifi();
    if (wifi_connected) {
        // Let the Wi-Fi/PHY driver create its internal timers before ESP-SR
        // consumes most of internal RAM. Without this pause phy_track_pll_init
        // can fail with ESP_ERR_NO_MEM and reboot continuously.
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    models = esp_srmodel_init("model");
    assert(models);
    afe_config_t *config = afe_config_init("M", models, AFE_TYPE_SR, AFE_MODE_LOW_COST);
    assert(config);
    config->memory_alloc_mode = AFE_MEMORY_ALLOC_MORE_PSRAM;
    afe_handle = esp_afe_handle_from_config(config);
    assert(afe_handle);
    afe_data = afe_handle->create_from_config(config);
    assert(afe_data);
    int threshold_result = afe_handle->set_wakenet_threshold(
        afe_data, 1, WAKENET_THRESHOLD);
    ESP_LOGI(TAG, "WakeNet threshold %.2f, result %d",
             WAKENET_THRESHOLD, threshold_result);
    afe_config_free(config);

    command_log_queue = xQueueCreate(20, sizeof(command_log_t));
    assert(command_log_queue);
    xTaskCreatePinnedToCoreWithCaps(microphone_feed_task, "mic_feed", 8192,
                                    NULL, 5, NULL, 0, MALLOC_CAP_SPIRAM);
    xTaskCreatePinnedToCoreWithCaps(recognition_task, "recognition", 12288,
                                    NULL, 5, NULL, 1, MALLOC_CAP_SPIRAM);
    xTaskCreatePinnedToCoreWithCaps(dashboard_log_task, "dashboard_log", 4096,
                                    NULL, 2, NULL, 0, MALLOC_CAP_SPIRAM);
    xTaskCreatePinnedToCoreWithCaps(dashboard_control_task, "dashboard_control", 4096,
                                    NULL, 2, NULL, 0, MALLOC_CAP_SPIRAM);
    xTaskCreatePinnedToCoreWithCaps(wifi_retry_task, "wifi_retry", 3072,
                                    NULL, 2, NULL, 0, MALLOC_CAP_SPIRAM);
}



