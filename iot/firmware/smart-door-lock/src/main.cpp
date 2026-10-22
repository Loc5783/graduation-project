#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <U8g2lib.h>
#include <MFRC522.h>
#include <Adafruit_Fingerprint.h>
#include <mbedtls/sha256.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

constexpr char FW_VERSION[]="SDL-FP-RETRY-20261022-C";
// All times use unsigned subtraction, safe across millis() rollover.
constexpr uint8_t CDS=1, EXIT=2, BUZZER=3, VIBRATION=4, DOOR=7, SERVO=8;
constexpr uint8_t ROWS[]={38,39,40,41}, COLS[]={42,47,21};
constexpr char KEYS[4][3]={{'1','2','3'},{'4','5','6'},{'7','8','9'},{'*','0','#'}};
constexpr bool ENABLE_SW420=false; // Unfitted: never read it for alarms.
constexpr uint16_t LOCK_US=570, UNLOCK_US=2425; // Swap ONLY if mechanism is reversed.
constexpr uint8_t SERVO_PWM_BITS=14; // ESP32-S3 LEDC maximum, unlike original ESP32.
constexpr uint32_t SERVO_PWM_STEPS=1UL<<SERVO_PWM_BITS;
static_assert(SERVO_PWM_BITS<=14,"ESP32-S3 LEDC supports at most 14 bits");
constexpr uint32_t OPEN_TIMEOUT=10000, CLOSE_DELAY=600, HELD_TIMEOUT=30000;
constexpr uint32_t ADMIN_MS=60000, LOCKOUT_MS=60000;
constexpr size_t MAX_CARDS=24, LOG_LIMIT=32768;
// U8g2 argument order: reset, CLOCK/SCL, DATA/SDA (not SDA,SCL).
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oledSSD(U8G2_R0,U8X8_PIN_NONE,6,5);
U8G2_SH1106_128X64_NONAME_F_HW_I2C oledSH(U8G2_R0,U8X8_PIN_NONE,6,5);
// 1.3-inch module: try SH1106, but allow selecting SSD1306 without recompiling.
bool useSH1106=true;
U8G2 *oled=&oledSH;
MFRC522 rfid(9,14);
HardwareSerial fingerSerial(1);
Adafruit_Fingerprint finger(&fingerSerial);
Preferences prefs;
bool storageOK=false, fsOK=false, pinSet=false, oledOK=false;
uint8_t oledAddress=0, oledProbe3C=255, oledProbe3D=255;
uint8_t oledPostInit=255;
uint32_t oledProbeAt=0;
bool oledRetry=true;
uint8_t salt[16], pinHash[32];
uint8_t fpAllowed[16]{}; // Only IDs explicitly enrolled by this firmware are trusted.
struct Cards { uint8_t count; uint8_t len[MAX_CARDS]; uint8_t uid[MAX_CARDS][10]; } cards{};

struct Debounce {
  uint8_t pin; bool raw=true, value=true; uint32_t changed=0;
  explicit Debounce(uint8_t p):pin(p) {}
  void begin() { pinMode(pin,INPUT_PULLUP); value=raw=digitalRead(pin); changed=millis(); }
  bool update(uint32_t now) {
    bool v=digitalRead(pin);
    if(v!=raw) {raw=v; changed=now;}
    if(v!=value && now-changed>=35) {value=v; return true;} return false;
  }
} door{DOOR}, exitButton{EXIT};
enum class Bolt { UNKNOWN, MOVING_LOCK, LOCKED, MOVING_UNLOCK, UNLOCKED };
Bolt bolt=Bolt::UNKNOWN;
bool pulseKnown=false, servoKnown=false;
bool servoReady=false;
uint16_t pulse=LOCK_US, target=LOCK_US;
uint32_t servoTick=0, settleAt=0;
bool settling=false, accessCycle=false, sawOpen=false, closePending=false;
bool forced=false, held=false;
uint32_t grantAt=0, closedAt=0, openedAt=0;
uint8_t failures=0;
bool lockedOut=false, admin=false, cardEnroll=false;
uint32_t lockoutAt=0, adminAt=0;
String pinInput, serialLine, status="STARTING";
enum class UI { HOME, ADMIN_PIN, NEW_PIN, CONFIRM_PIN, MENU, WAIT_CARD, WAIT_FINGER, INFO, FORMAT_CONFIRM };
UI ui=UI::HOME;
String newPIN;
bool firstPINFlow=false;
uint32_t setupArmedAt=0;
uint16_t enrollingID=0;
uint8_t fpStage=0;
uint32_t statusAt=0, lastDisplay=0, lastRFID=0;
String lastUID;
bool rfSeen=false;
uint32_t buzzerAt=0, buzzerDuration=0;
bool buzzerOn=false;

struct FPEvent { int16_t code; uint32_t at; uint16_t id; }; // positive: match, negative: status
QueueHandle_t fpEvents=nullptr, fpCommands=nullptr;
bool fpBusy=false, fpOnline=false;
bool fpWipeRequired=false;
// Revoking an ID during an in-flight enrollment must also reject its queued result.
bool fpEnrollmentRevoked=false;
bool resetArmed=false;
uint32_t resetArmedAt=0;
File logReader;

void note(const String &s) {status=s; statusAt=millis(); Serial.println(s);}
void logEvent(const String &s) {
  // Never log PINs, hashes, or admin command lines. Two bounded files, <= ~64 KiB.
  if(!fsOK) return;
  File f=LittleFS.open("/access.log","r"); size_t n=f ? f.size() : 0; f.close();
  if(n>=LOG_LIMIT) {
    logReader.close();
    LittleFS.remove("/access.old");
    if(!LittleFS.rename("/access.log","/access.old")) return;
  }
  f=LittleFS.open("/access.log","a");
  if(f) {f.printf("%lu %s\n",(unsigned long)millis(),s.c_str()); f.close();}
}
void beep(uint32_t ms=90) {buzzerOn=true; buzzerAt=millis(); buzzerDuration=ms; digitalWrite(BUZZER,LOW);}
void buzzTick(uint32_t now) {
  if(buzzerOn && now-buzzerAt>=buzzerDuration) {buzzerOn=false; digitalWrite(BUZZER,HIGH);}
  if((forced || held) && !buzzerOn && now-buzzerAt>=1000) beep(160);
}
void pwm(uint16_t us) {
  if(servoReady) ledcWrite(0,(uint32_t(us)*SERVO_PWM_STEPS+10000UL)/20000UL);
}
void moveBolt(bool unlock) {
  if(!servoReady) {servoKnown=false; note("SERVO PWM ERROR"); return;}
  if(!unlock && (door.value || digitalRead(DOOR) || !digitalRead(EXIT))) return;
  target=unlock?UNLOCK_US:LOCK_US;
  Bolt moving=unlock?Bolt::MOVING_UNLOCK:Bolt::MOVING_LOCK;
  Bolt done=unlock?Bolt::UNLOCKED:Bolt::LOCKED;
  if(bolt==moving || bolt==done) return;
  servoKnown=false; bolt=moving; settling=false;
  // At boot there is no feedback: apply safe endpoint, never pretend we know position.
  if(!pulseKnown) {pulse=target; pulseKnown=true; pwm(pulse);}
  servoTick=millis();
}
void servoUpdate(uint32_t now) {
  if(bolt!=Bolt::MOVING_LOCK && bolt!=Bolt::MOVING_UNLOCK) return;
  if(now-servoTick<20) return;
  servoTick=now;
  int delta=int(target)-int(pulse);
  if(delta) {pulse+=constrain(delta,-35,35); pwm(pulse); settling=false;}
  else if(!settling) {settling=true; settleAt=now;}
  else if(now-settleAt>=700) {
    bolt=target==LOCK_US?Bolt::LOCKED:Bolt::UNLOCKED;
    servoKnown=true;
    logEvent(bolt==Bolt::LOCKED?"LOCK_COMMANDED":"UNLOCK_COMMANDED");
  }
}
void grant(const char *source) {
  accessCycle=true; sawOpen=door.value; grantAt=millis(); closePending=false;
  if(door.value) openedAt=grantAt;
  forced=false; held=false; moveBolt(true); note(String("ACCESS ")+source); beep(); logEvent(status);
}
bool validPIN(const String &s) {
  if(s.length()<6 || s.length()>8) return false;
  for(size_t i=0;i<s.length();++i) if(s[i]<'0'||s[i]>'9') return false;
  return true;
}
void digest(const String &s,uint8_t out[32]) {
  mbedtls_sha256_context c; mbedtls_sha256_init(&c);
  mbedtls_sha256_starts_ret(&c,0); mbedtls_sha256_update_ret(&c,salt,sizeof(salt));
  mbedtls_sha256_update_ret(&c,(const uint8_t*)s.c_str(),s.length());
  mbedtls_sha256_finish_ret(&c,out); mbedtls_sha256_free(&c);
}
bool checkPIN(const String &s) {
  if(!storageOK||!pinSet||!validPIN(s)) return false;
  uint8_t h[32], diff=0; digest(s,h);
  for(size_t i=0;i<32;++i) diff|=h[i]^pinHash[i]; return diff==0;
}
bool savePIN(const String &s) {
  if(!storageOK||!validPIN(s)) return false;
  uint8_t h[32]; digest(s,h);
  if(prefs.putBytes("pin",h,32)!=32) return false;
  memcpy(pinHash,h,32); pinSet=true; return true;
}
void rejectPIN() {
  beep(220); note("PIN REJECTED"); logEvent("PIN_FAIL");
  ++failures;
  if(storageOK) prefs.putUChar("fails",failures);
  if(failures>=5) {lockedOut=true; lockoutAt=millis(); admin=false; cardEnroll=false; note("PIN LOCKOUT 60s");}
}
void resetFailures() {if(failures && storageOK) prefs.putUChar("fails",0); failures=0;}
void closeUI() {
  ui=UI::HOME; pinInput=""; newPIN=""; firstPINFlow=false;
  admin=false; cardEnroll=false;
}
void menuUI() {ui=UI::MENU; pinInput=""; newPIN=""; firstPINFlow=false;}
bool beginFingerEnroll(uint16_t id) {
  if(!admin || lockedOut || !storageOK || !pinSet) {note("ADMIN REQUIRED"); return false;}
  if(id<1 || id>127 || !fpCommands || !fpOnline || fpBusy) {note("FP OFFLINE/BUSY/ID"); return false;}
  // Replacing a trusted template first could grant the new finger if NVS later fails.
  if(fpAllowed[id/8] & (1U<<(id%8))) {note("REVOKE FINGER FIRST"); return false;}
  fpBusy=xQueueSend(fpCommands,&id,0)==pdTRUE;
  if(fpBusy) {enrollingID=id; fpEnrollmentRevoked=false; fpStage=1; adminAt=millis(); note("PLACE FINGER (20s)");}
  else note("FP BUSY");
  return fpBusy;
}
uint16_t freeFingerID() {
  for(uint16_t id=1;id<=127;++id) if(!(fpAllowed[id/8] & (1U<<(id%8)))) return id;
  return 0;
}
void serialCommand(String cmd);
void keypadKey(char key,uint32_t now) {
  if(!storageOK) {note("NVS ERROR"); return;}
  if(lockedOut) {note("PIN LOCKOUT 60s"); return;}
  if(ui==UI::MENU) {
    if(!admin) {closeUI(); return;}
    if(key=='*' || key=='0') {closeUI(); note("ADMIN ENDED"); return;}
    adminAt=now;
    if(key=='1') {cardEnroll=true; rfSeen=false; ui=UI::WAIT_CARD; note("TAP NEW CARD");}
    else if(key=='2') {
      uint16_t id=freeFingerID();
      if(!id) note("FINGER LIST FULL");
      else if(beginFingerEnroll(id)) ui=UI::WAIT_FINGER;
    } else if(key=='3') {firstPINFlow=false; ui=UI::NEW_PIN; pinInput=""; note("ENTER NEW PIN");}
    else if(key=='4') ui=UI::INFO;
    else if(key=='5') ui=UI::FORMAT_CONFIRM;
    return;
  }
  if(ui==UI::INFO) {if(key=='*' || key=='#') menuUI(); return;}
  if(ui==UI::FORMAT_CONFIRM) {
    if(key=='*') menuUI();
    else if(key=='#') {serialCommand("FORMATFS"); menuUI();}
    return;
  }
  if(ui==UI::WAIT_CARD || ui==UI::WAIT_FINGER) {
    if(key=='*') {
      cardEnroll=false; menuUI();
      // A fingerprint operation already authorized continues in the worker.
      if(fpBusy) note("FP STILL RUNNING");
    }
    return;
  }
  if(!pinSet && ui==UI::HOME) {
    if(key=='#' && !exitButton.value && !digitalRead(EXIT)) {
      firstPINFlow=true; setupArmedAt=now; ui=UI::NEW_PIN;
      pinInput=""; note("RELEASE INSIDE; PIN");
    } else note("HOLD INSIDE + #");
    return;
  }
  if(key=='*') {
    if(pinInput.length()) pinInput="";
    else if(admin) menuUI(); else closeUI();
    return;
  }
  if(key!='#') {
    if(pinInput.length()<8) pinInput+=key;
    else {
      pinInput="";
      if(ui==UI::HOME || ui==UI::ADMIN_PIN) rejectPIN(); else note("MAX 8 DIGITS");
    }
    return;
  }
  if(ui==UI::HOME && pinInput.length()==0) {
    if(admin) menuUI(); else {ui=UI::ADMIN_PIN; note("ENTER ADMIN PIN");}
    return;
  }
  if(ui==UI::HOME || ui==UI::ADMIN_PIN) {
    bool wantsAdmin=ui==UI::ADMIN_PIN;
    if(checkPIN(pinInput)) {
      resetFailures();
      if(wantsAdmin) {admin=true; adminAt=now; menuUI(); note("ADMIN MENU");}
      else grant("PIN");
    } else rejectPIN();
    pinInput=""; return;
  }
  if(ui==UI::NEW_PIN) {
    if(validPIN(pinInput)) {newPIN=pinInput; pinInput=""; ui=UI::CONFIRM_PIN; note("REPEAT NEW PIN");}
    else {pinInput=""; note("NEED 6-8 DIGITS");}
    return;
  }
  if(ui==UI::CONFIRM_PIN) {
    bool allowed=firstPINFlow?(!pinSet && now-setupArmedAt<ADMIN_MS):admin;
    if(!allowed) {closeUI(); note("SETUP EXPIRED"); return;}
    if(pinInput!=newPIN) {pinInput=""; newPIN=""; ui=UI::NEW_PIN; note("MISMATCH; TRY AGAIN"); return;}
    bool fresh=firstPINFlow;
    if(savePIN(pinInput)) {
      resetFailures(); admin=true; adminAt=now; menuUI(); beep();
      note(fresh?"PIN CREATED":"PIN CHANGED"); logEvent(fresh?"PROVISIONED":"PIN_CHANGED");
    } else {pinInput=""; note("PIN SAVE FAILED");}
  }
}
String uidText(const uint8_t *p,uint8_t n) {
  String s; char b[3]; for(uint8_t i=0;i<n;++i) {snprintf(b,sizeof(b),"%02X",p[i]); s+=b;} return s;
}
bool sameCard(uint8_t i,const uint8_t *p,uint8_t n) {return cards.len[i]==n && memcmp(cards.uid[i],p,n)==0;}
bool persistCards(const Cards &next) {
  if(!storageOK || prefs.putBytes("cards",&next,sizeof(next))!=sizeof(next)) return false;
  cards=next; return true;
}
void rfidTick(uint32_t now) {
  if(now-lastRFID<80) return; lastRFID=now;
  if(!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  String uid=uidText(rfid.uid.uidByte,rfid.uid.size);
  // Wake/halt behavior differs between cards: reject duplicate UID until 2s quiet.
  static uint32_t seenAt=0;
  bool duplicate=rfSeen && uid==lastUID && now-seenAt<2000;
  rfSeen=true; lastUID=uid; seenAt=now;
  uint8_t n=rfid.uid.size; uint8_t bytes[10]; memcpy(bytes,rfid.uid.uidByte,n);
  rfid.PICC_HaltA(); rfid.PCD_StopCrypto1();
  if(duplicate) return;
  int found=-1; for(uint8_t i=0;i<cards.count;++i) if(sameCard(i,bytes,n)) found=i;
  if(cardEnroll && admin) {
    cardEnroll=false;
    if(ui==UI::WAIT_CARD) menuUI();
    if(found>=0) {note("CARD ALREADY SAVED"); return;}
    if(cards.count>=MAX_CARDS) {note("CARD LIST FULL"); return;}
    Cards next=cards; uint8_t i=next.count++; next.len[i]=n; memcpy(next.uid[i],bytes,n);
    note(persistCards(next)?"CARD ENROLLED":"NVS WRITE FAILED"); logEvent(status); return;
  }
  if(found>=0 && storageOK && pinSet) grant("RFID");
  else {note("UNKNOWN CARD "+uid); beep(200); logEvent("RFID_UNKNOWN");}
}

// Scanner drives one row LOW, all other rows high impedance (no output contention).
void keypadTick(uint32_t now) {
  static uint32_t lastScan=0, changed=0, inputAt=0;
  static char raw=0, stable=0;
  if(pinInput.length() && now-inputAt>15000) pinInput="";
  if(now-lastScan<10) return; lastScan=now;
  char key=0; uint8_t count=0;
  for(uint8_t r=0;r<4;++r) {
    digitalWrite(ROWS[r],LOW); pinMode(ROWS[r],OUTPUT);
    delayMicroseconds(5);
    for(uint8_t c=0;c<3;++c) if(!digitalRead(COLS[c])) {key=KEYS[r][c]; ++count;}
    pinMode(ROWS[r],INPUT);
  }
  if(count>1) key=0; // Reject chords/ghosting.
  if(key!=raw) {raw=key; changed=now;}
  if(raw==stable || now-changed<35) return; stable=raw;
  if(!stable) return;
  inputAt=now;
  keypadKey(stable,now);
}
void doorTick(uint32_t now) {
  if(door.update(now)) {
    if(door.value) {
      openedAt=now; closePending=false;
      if(accessCycle) sawOpen=true;
      else {forced=true; logEvent("FORCED_OPEN"); note("FORCED OPEN");}
      // Retract immediately if contact opens while bolt is advancing.
      if(bolt==Bolt::MOVING_LOCK) moveBolt(true);
    } else {
      forced=false; held=false; closedAt=now; closePending=true;
      logEvent("DOOR_CLOSED");
    }
  }
  if(door.value && now-openedAt>=HELD_TIMEOUT && !held) {held=true; logEvent("DOOR_HELD");}
  if(!door.value && !digitalRead(DOOR) && digitalRead(EXIT) && closePending && now-closedAt>=CLOSE_DELAY) {
    closePending=false;
    if(!accessCycle || sawOpen) {accessCycle=false; moveBolt(false);}
  }
  if(accessCycle && !sawOpen && !door.value && !digitalRead(DOOR) && digitalRead(EXIT) && now-grantAt>=OPEN_TIMEOUT) {
    accessCycle=false; moveBolt(false); note("OPEN TIMEOUT");
  }
}

void fpSend(int16_t code,uint16_t id=0) {FPEvent e{code,millis(),id}; xQueueSend(fpEvents,&e,0);}
bool fpWaitImage(uint8_t expected,uint32_t timeout) {
  uint32_t at=millis();
  while(millis()-at<timeout) {if(finger.getImage()==expected) return true; vTaskDelay(pdMS_TO_TICKS(60));}
  return false;
}
void fingerprintTask(void*) {
  finger.begin(57600);
  // AS608 may boot after the ESP32 or be reconnected while the door stays powered.
  // Keep retrying in this separate task; local unlock and inside button remain live.
  vTaskDelay(pdMS_TO_TICKS(1000));
  bool offlineReported=false;
  while(!finger.verifyPassword()) {
    if(!offlineReported) {fpSend(-2); offlineReported=true;}
    vTaskDelay(pdMS_TO_TICKS(2000));
  }
  if(fpWipeRequired) {
    // This flag is set only by a confirmed local recovery command.
    if(finger.emptyDatabase()!=FINGERPRINT_OK) {fpSend(-9); vTaskDelete(nullptr); return;}
    fpSend(-8);
  }
  fpSend(-6);
  bool latched=false;
  for(;;) {
    uint16_t id;
    if(xQueueReceive(fpCommands,&id,0)==pdTRUE) {
      // Blocking sensor exchanges are confined to this task. Main loop remains live.
      bool ok=fpWaitImage(FINGERPRINT_OK,20000) && finger.image2Tz(1)==FINGERPRINT_OK;
      if(ok) {fpSend(-5); ok=fpWaitImage(FINGERPRINT_NOFINGER,10000); if(ok) fpSend(-7);}
      if(ok) ok=fpWaitImage(FINGERPRINT_OK,20000) && finger.image2Tz(2)==FINGERPRINT_OK;
      if(ok) ok=finger.createModel()==FINGERPRINT_OK && finger.storeModel(id)==FINGERPRINT_OK;
      fpSend(ok?-3:-4,id); latched=true;
    } else {
      uint8_t p=finger.getImage();
      if(p==FINGERPRINT_NOFINGER) latched=false;
      if(p==FINGERPRINT_OK && !latched) {
        latched=true;
        if(finger.image2Tz()==FINGERPRINT_OK && finger.fingerFastSearch()==FINGERPRINT_OK)
          fpSend(finger.fingerID);
        else fpSend(-1);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(70));
  }
}
void serialCommand(String cmd) {
  cmd.trim();
  if(cmd=="VERSION") {Serial.println(FW_VERSION); return;}
  if(cmd=="RESET AUTH") {
    if(!storageOK || exitButton.value || digitalRead(EXIT)) {
      resetArmed=false; note("HOLD INSIDE TO RESET");
    } else {
      resetArmed=true; resetArmedAt=millis(); note("CONFIRM RESET AUTH 15s");
    }
    return;
  }
  if(cmd=="CONFIRM RESET AUTH") {
    if(!resetArmed || millis()-resetArmedAt>=15000 || !storageOK || exitButton.value || digitalRead(EXIT)) {
      resetArmed=false; note("RESET DENIED"); return;
    }
    resetArmed=false;
    if(!prefs.clear()) {storageOK=false; note("RESET NVS FAILED"); return;}
    // Fail closed even if the following marker write fails.
    pinSet=false; cards={}; memset(fpAllowed,0,sizeof(fpAllowed)); admin=false; cardEnroll=false;
    if(prefs.putBool("fpwipe",true)!=1) {
      storageOK=false; note("RESET NVS FAILED; CHECK NVS"); return;
    }
    note("AUTH CLEARED; RESTARTING"); Serial.flush(); ESP.restart(); return;
  }
  if(cmd.startsWith("SETUP ")) {
    // First boot only; physical inside button must remain held through commit.
    if(!pinSet && !exitButton.value && !digitalRead(EXIT) && savePIN(cmd.substring(6))) {
      note("PIN CREATED"); logEvent("PROVISIONED");
    } else note("SETUP DENIED"); return;
  }
  if(cmd.startsWith("ADMIN ")) {
    if(lockedOut) {note("PIN LOCKOUT"); return;}
    if(checkPIN(cmd.substring(6))) {admin=true; adminAt=millis(); resetFailures(); note("ADMIN 60s");}
    else rejectPIN(); return;
  }
  if(cmd=="STATUS") {
    Serial.printf("door=%s bolt=%u known=%u PWM=%u PIN=%u cards=%u FS=%u NVS=%u\n",
      door.value?"OPEN":"CLOSED",unsigned(bolt),servoKnown,servoReady,pinSet,cards.count,fsOK,storageOK);
    Serial.printf("FP=%u wipePending=%u busy=%u\n",fpOnline,fpWipeRequired,fpBusy);
    Serial.printf("OLED=%u addr=0x%02X probe3C=%u probe3D=%u SDA=5 SCL=6 I2C=100k\n",
      oledOK,oledAddress,oledProbe3C,oledProbe3D);
    Serial.printf("driver=%s postInit=%u\n",useSH1106?"SH1106":"SSD1306",oledPostInit); return;
  }
  if(cmd=="OLED SH1106" || cmd=="OLED SSD1306") {
    useSH1106=cmd=="OLED SH1106";
    oled=useSH1106?static_cast<U8G2*>(&oledSH):static_cast<U8G2*>(&oledSSD);
    oledOK=false; oledRetry=true; note(useSH1106?"TRY SH1106":"TRY SSD1306"); return;
  }
  if(cmd=="OLEDINIT") {oledOK=false; oledRetry=true; note("OLED RETRY REQUESTED"); return;}
  if(cmd=="END") {closeUI(); note("ADMIN ENDED"); return;}
  if(!admin || lockedOut) {note("ADMIN REQUIRED"); return;}
  if(cmd=="ADDCARD") {cardEnroll=true; rfSeen=false; ui=UI::WAIT_CARD; note("TAP NEW CARD");}
  else if(cmd.startsWith("SETPIN ")) {note(savePIN(cmd.substring(7))?"PIN CHANGED":"PIN SAVE FAILED"); closeUI();}
  else if(cmd.startsWith("DELCARD ")) {
    String uid=cmd.substring(8); uid.toUpperCase(); Cards next=cards; bool found=false;
    for(uint8_t i=0;i<next.count;++i) if(uidText(next.uid[i],next.len[i])==uid) {
      --next.count; next.len[i]=next.len[next.count]; memcpy(next.uid[i],next.uid[next.count],10); found=true; break;
    }
    note(found && persistCards(next)?"CARD DELETED":"CARD DELETE FAILED");
  } else if(cmd=="CARDS") {
    for(uint8_t i=0;i<cards.count;++i) Serial.println(uidText(cards.uid[i],cards.len[i]));
  } else if(cmd.startsWith("ENROLL ")) {
    String s=cmd.substring(7); bool digits=s.length()>0;
    for(size_t i=0;i<s.length();++i) if(!isDigit(s[i])) digits=false;
    int n=s.toInt();
    // IDs 1..127 fit common AS608; trusted IDs must be revoked before replacement.
    if(digits && n>=1 && n<=127) {if(beginFingerEnroll(n)) ui=UI::WAIT_FINGER;}
    else note("BAD FP ID");
  } else if(cmd=="FORMATFS" && !exitButton.value && !digitalRead(EXIT)) {
    // Explicit admin plus physical presence; never format automatically at boot.
    logReader.close(); LittleFS.end(); fsOK=LittleFS.format() && LittleFS.begin(false);
    note(fsOK?"FS READY":"FS FORMAT FAILED"); logEvent("FS_INITIALIZED");
  } else if(cmd.startsWith("REVOKEFINGER ")) {
    String s=cmd.substring(13); bool digits=s.length()>0;
    for(size_t i=0;i<s.length();++i) if(!isDigit(s[i])) digits=false;
    int id=s.toInt();
    if(digits && id>=1 && id<=127) {
      if(fpBusy && enrollingID==id) fpEnrollmentRevoked=true;
      uint8_t next[16]; memcpy(next,fpAllowed,16); next[id/8]&=~(1U<<(id%8));
      if(prefs.putBytes("fpallow",next,16)==16) {memcpy(fpAllowed,next,16); note("FINGER REVOKED");}
      else note("NVS WRITE FAILED");
    } else note("BAD FP ID");
  } else if(cmd=="LOG") {
    logReader.close();
    if(fsOK) {logReader=LittleFS.open("/access.log","r");
      if(logReader) logReader.seek(logReader.size()>2048?logReader.size()-2048:0);}
    note("LOG: last <=2048 bytes");
  } else note("UNKNOWN COMMAND");
}
void serialTick() {
  static bool overflow=false;
  // Bounded parser, no readStringUntil(), no serial echo of secrets.
  for(uint8_t i=0;i<32 && Serial.available();++i) {
    char c=Serial.read(); if(c=='\r') continue;
    if(c=='\n') {if(!overflow) serialCommand(serialLine); serialLine=""; overflow=false;}
    else if(serialLine.length()<80 && !overflow) serialLine+=c;
    else {overflow=true; serialLine="";}
  }
  if(logReader) {
    if(!admin || !logReader.available()) logReader.close();
    else if(Serial.availableForWrite()>=64) {
      uint8_t b[64]; size_t n=logReader.read(b,sizeof(b)); Serial.write(b,n);
    }
  }
}
uint8_t probeOLED(uint8_t addr) {
  Wire.beginTransmission(addr); return Wire.endTransmission();
}
void oledService(uint32_t now) {
  if(!oledRetry && now-oledProbeAt<2000) return;
  oledRetry=false; oledProbeAt=now;
  if(oledOK && probeOLED(oledAddress)==0) return;
  oledOK=false;
  // Only two short probes; never scan all 126 addresses in the door loop.
  oledProbe3C=probeOLED(0x3C); oledProbe3D=probeOLED(0x3D);
  oledAddress=oledProbe3C==0?0x3C:oledProbe3D==0?0x3D:0;
  if(!oledAddress) return; // Retry later without waiting for the module.
  // U8g2 GPIO init changes SDA/SCL pin modes. A running Wire.begin() returns
  // early on Arduino 2.0.17, leaving the peripheral disconnected from pins.
  // End the probe bus first so U8g2's own Wire.begin(5,6) fully reattaches it.
  Wire.end();
  oled->setI2CAddress(oledAddress<<1); // U8g2 uses 8-bit address.
  oled->setBusClock(100000); oled->begin();
  Wire.setTimeOut(20);
  oled->setPowerSave(0); oled->setContrast(180);
  oledPostInit=probeOLED(oledAddress); oledOK=oledPostInit==0;
  if(oledOK) {
    oled->clearBuffer(); oled->setFont(u8g2_font_6x10_tf);
    oled->drawStr(0,12,"SMART DOOR LOCK");
    oled->drawStr(0,28,"OLED I2C OK"); oled->sendBuffer();
    Serial.printf("OLED READY 0x%02X SDA=5 SCL=6\n",oledAddress);
  }
}
void displayTick(uint32_t now) {
  if(!oledOK || now-lastDisplay<150) return; lastDisplay=now;
  oled->clearBuffer(); oled->setFont(u8g2_font_6x10_tf);
  if(!storageOK || lockedOut || ui!=UI::HOME || !pinSet) {
    String lines[6];
    if(!storageOK) {lines[0]="STORAGE ERROR"; lines[2]="Inside exit available";}
    else if(lockedOut) {
      lines[0]="PIN LOCKOUT";
      lines[2]="Wait "+String((LOCKOUT_MS-(now-lockoutAt)+999)/1000)+" seconds";
      lines[4]="Inside exit available";
    } else if(!pinSet && ui==UI::HOME) {
      lines[0]="FIRST SETUP"; lines[1]="No PIN saved";
      lines[2]="Hold INSIDE button"; lines[3]="then press #";
      lines[5]="No default PIN";
    } else if(ui==UI::NEW_PIN || ui==UI::CONFIRM_PIN || ui==UI::ADMIN_PIN) {
      lines[0]=ui==UI::ADMIN_PIN?"ADMIN LOGIN":ui==UI::NEW_PIN?"NEW PIN (6-8 digits)":"REPEAT NEW PIN";
      lines[1]=""; for(size_t i=0;i<pinInput.length();++i) lines[1]+='*';
      lines[2]="# Confirm  * Clear";
      lines[3]=firstPINFlow?"Release INSIDE now":"";
      lines[4]="Empty + * = Cancel";
      lines[5]=status.substring(0,21);
    } else if(ui==UI::MENU) {
      lines[0]="ADMIN: 1 Add RFID"; lines[1]="2 Add fingerprint";
      lines[2]="3 Change PIN  4 Info"; lines[3]="5 Init/erase LOG";
      lines[4]="0 or * Exit";
      lines[5]=now-statusAt<6000?status.substring(0,21):"Session: 60s idle";
    } else if(ui==UI::WAIT_CARD) {
      lines[0]="REGISTER RFID"; lines[2]="Tap ONE new card";
      lines[3]="Only during admin"; lines[5]="* Cancel";
    } else if(ui==UI::WAIT_FINGER) {
      lines[0]="REGISTER FINGER "+String(enrollingID);
      lines[2]=fpStage==2?"REMOVE finger":fpStage==3?"PLACE SAME finger":"PLACE finger";
      lines[3]=fpStage==2?"Within 10 seconds":"Within 20 seconds";
      lines[5]="* Back (job continues)";
    } else if(ui==UI::INFO) {
      uint8_t count=0; for(uint16_t id=1;id<=127;++id) if(fpAllowed[id/8] & (1U<<(id%8))) ++count;
      lines[0]="PIN: SAVED"; lines[1]="RFID: "+String(cards.count)+" / 24";
      lines[2]="Fingers: "+String(count)+" / 127";
      lines[3]=fsOK?"LOG: READY":"LOG: NOT READY (menu5)";
      lines[4]=fpOnline?"AS608: ONLINE":"AS608: OFFLINE"; lines[5]="* or # Back";
    } else if(ui==UI::FORMAT_CONFIRM) {
      lines[0]="ERASE ALL LOG FILES?";
      lines[1]="Bench maintenance only"; lines[2]="Hold INSIDE + #";
      lines[3]="Flash format may pause"; lines[5]="* Cancel";
    }
    // Alarms remain visible even in setup; credentials never appear as digits.
    if(forced || held) lines[5]=forced?"ALARM: FORCED OPEN":"ALARM: DOOR HELD";
    for(uint8_t i=0;i<6;++i) oled->drawStr(0,10+i*10,lines[i].substring(0,21).c_str());
    oled->sendBuffer(); return;
  }
  oled->drawStr(0,10,door.value?"DOOR: OPEN":"DOOR: CLOSED");
  const char *b=!servoReady?"SERVO PWM ERROR":bolt==Bolt::LOCKED?"LOCKED (command)":bolt==Bolt::UNLOCKED?"UNLOCKED (command)":bolt==Bolt::UNKNOWN?"BOLT UNKNOWN":"SERVO MOVING";
  oled->drawStr(0,22,b);
  String line=forced?"ALARM: FORCED":held?"ALARM: HELD":!pinSet?"SETUP VIA SERIAL":lockedOut?"PIN LOCKOUT":status;
  oled->drawStr(0,34,line.substring(0,21).c_str());
  String stars="PIN: "; for(size_t i=0;i<pinInput.length();++i) stars+='*';
  oled->drawStr(0,46,stars.c_str());
  oled->drawStr(0,58,"Empty # = ADMIN MENU"); oled->sendBuffer();
}
void setup() {
  digitalWrite(BUZZER,HIGH); pinMode(BUZZER,OUTPUT);
  pinMode(CDS,INPUT); pinMode(VIBRATION,INPUT); // SW-420 deliberately inactive.
  door.begin(); exitButton.begin();
  for(uint8_t p:ROWS) pinMode(p,INPUT);
  for(uint8_t p:COLS) pinMode(p,INPUT_PULLUP);
  // CH343 USB-to-UART port: ESP32-S3 UART0 RX44 / TX43.
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.begin(115200); Serial.setTxTimeoutMs(0);
#else
  Serial.begin(115200,SERIAL_8N1,44,43);
#endif
  Serial.println(FW_VERSION);
  servoReady=ledcSetup(0,50,SERVO_PWM_BITS)>0;
  if(servoReady) {ledcAttachPin(SERVO,0); ledcWrite(0,0);}
  Wire.begin(5,6); Wire.setClock(100000); Wire.setTimeOut(20);
  // Init/retry in loop, after exit input and door state have been serviced.
  SPI.begin(12,13,11,9); rfid.PCD_Init();
  storageOK=prefs.begin("doorlock",false);
  if(storageOK) {
    fpWipeRequired=prefs.getBool("fpwipe",false);
    size_t sn=prefs.isKey("salt")?prefs.getBytesLength("salt"):0;
    size_t pn=prefs.isKey("pin")?prefs.getBytesLength("pin"):0;
    if(sn==0 && pn==0) {esp_fill_random(salt,sizeof(salt)); storageOK=prefs.putBytes("salt",salt,sizeof(salt))==sizeof(salt);}
    else if(sn==sizeof(salt)) prefs.getBytes("salt",salt,sizeof(salt));
    else storageOK=false; // Corruption: do not silently reset admin credentials.
    if(storageOK && pn==32) {prefs.getBytes("pin",pinHash,32); pinSet=true;}
    else if(pn!=0) storageOK=false;
    size_t fn=prefs.isKey("fpallow")?prefs.getBytesLength("fpallow"):0;
    if(storageOK && fn==16) prefs.getBytes("fpallow",fpAllowed,16);
    else if(fn!=0) storageOK=false;
    failures=prefs.getUChar("fails",0);
    if(failures>=5) {failures=5; lockedOut=true; lockoutAt=millis();}
    size_t cn=prefs.isKey("cards")?prefs.getBytesLength("cards"):0;
    if(storageOK && cn!=0 && cn!=sizeof(cards)) storageOK=false;
    if(storageOK && cn==sizeof(cards)) {
      prefs.getBytes("cards",&cards,sizeof(cards)); bool ok=cards.count<=MAX_CARDS;
      if(ok) for(uint8_t i=0;i<cards.count;++i) if(cards.len[i]!=4 && cards.len[i]!=7 && cards.len[i]!=10) ok=false;
      if(!ok) {cards={}; storageOK=false;}
    }
  }
  fsOK=LittleFS.begin(false); // Never auto-format on a mount failure.
  // Fresh device needs one deliberate LittleFS initialization, see README.
  fpEvents=xQueueCreate(8,sizeof(FPEvent)); fpCommands=xQueueCreate(1,sizeof(uint16_t));
  fingerSerial.begin(57600,SERIAL_8N1,18,17);
  if(fpEvents && fpCommands && xTaskCreatePinnedToCore(fingerprintTask,"finger",4096,nullptr,1,nullptr,0)!=pdPASS)
    note("FP TASK FAILED");
  openedAt=millis(); closedAt=millis(); closePending=!door.value;
  note(!servoReady?"SERVO PWM ERROR":storageOK?"READY":"NVS ERROR"); logEvent("BOOT");
  if(!exitButton.value) grant("INSIDE");
}
void loop() {
  uint32_t now=millis();
  // Highest priority input; can reverse a lock sweep immediately after debounce.
  if(exitButton.update(now) && !exitButton.value) grant("INSIDE");
  if(lockedOut && now-lockoutAt>=LOCKOUT_MS) {lockedOut=false; resetFailures();}
  if(resetArmed && now-resetArmedAt>=15000) resetArmed=false;
  if(admin && now-adminAt>=ADMIN_MS) {closeUI(); note("ADMIN EXPIRED");}
  if(lockedOut && ui!=UI::HOME) closeUI();
  if(firstPINFlow && (pinSet || now-setupArmedAt>=ADMIN_MS)) {closeUI(); note("SETUP EXPIRED");}
  doorTick(now); servoUpdate(now); buzzTick(now);
  keypadTick(now); serialTick(); rfidTick(now);
  FPEvent e;
  if(fpEvents && xQueueReceive(fpEvents,&e,0)==pdTRUE) {
    if(e.code>0 && millis()-e.at<1500 && pinSet && storageOK) {
      if(e.code<=127 && (fpAllowed[e.code/8] & (1U<<(e.code%8)))) grant("FINGERPRINT");
      else {note("FINGER NOT AUTHORIZED"); logEvent("FP_NOT_AUTHORIZED");}
    }
    else if(e.code==-2) {fpOnline=false; note("FP OFFLINE");}
    else if(e.code==-8) {
      if(storageOK && prefs.putBool("fpwipe",false)==1) {
        fpWipeRequired=false; note("OLD FINGERS CLEARED"); logEvent("FP_RESET_CONFIRMED");
      } else {fpOnline=false; note("FP WIPE NVS FAILED");}
    }
    else if(e.code==-9) {fpOnline=false; note("FP CLEAR FAILED");}
    else if(e.code==-6) {fpOnline=!fpWipeRequired; note(fpOnline?"FP READY":"FP RESET INCOMPLETE");}
    else if(e.code==-3) {
      fpBusy=false; fpStage=0;
      if(ui==UI::WAIT_FINGER) {if(admin) menuUI(); else closeUI();}
      if(fpEnrollmentRevoked || !storageOK || e.id!=enrollingID || e.id<1 || e.id>127) {
        note("FINGER NOT AUTHORIZED"); logEvent("FP_ENROLL_CANCELLED");
      } else {
        uint8_t next[16]; memcpy(next,fpAllowed,16); next[e.id/8]|=1U<<(e.id%8);
        if(prefs.putBytes("fpallow",next,16)==16) {memcpy(fpAllowed,next,16); note("FINGER ENROLLED"); logEvent("FP_ENROLLED");}
        else note("FP NVS SAVE FAILED");
      }
      fpEnrollmentRevoked=false;
    }
    else if(e.code==-4) {
      fpBusy=false; fpStage=0;
      if(ui==UI::WAIT_FINGER) {if(admin) menuUI(); else closeUI();}
      fpEnrollmentRevoked=false;
      note("FP ENROLL FAILED");
    }
    else if(e.code==-5) {fpStage=2; note("REMOVE FINGER");}
    else if(e.code==-7) {fpStage=3; note("PLACE SAME FINGER");}
    else if(e.code==-1) {note("FINGER REJECTED"); logEvent("FP_FAIL");}
  }
  oledService(now); displayTick(now); delay(1);
}
