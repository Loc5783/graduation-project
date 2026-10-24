#pragma once
#include <Arduino.h>

// Plain data copied from the control loop. The network task never reads actuator
// globals, accesses credentials, or calls grant()/moveBolt().
struct DoorSnapshot {
  uint32_t uptimeMs, vibrationCount, pinLockoutRemainingMs;
  uint16_t servoPulseUs;
  uint8_t doorRaw, cdsRaw, vibrationRaw, failedPinAttempts, rfidCards;
  uint8_t fingerprintCount, oledAddress, boltCommand;
  bool doorOpen, boltCommandCompleted, servoPwmReady, insidePressed;
  bool vibrationInstalled, vibrationCalibrated, vibrationActive;
  bool buzzerOn, forcedOpen, heldOpen, pinConfigured, pinLockout;
  bool adminActive, rfidDetected, fingerprintOnline, fingerprintBusy;
  bool oledDetected, sh1106, nvsReady, fsReady;
};

void realtimeBegin(const char *firmware);
void realtimeSnapshot(const DoorSnapshot &snapshot);
void realtimeEvent(const char *code);
