param(
  [int]$Port = 1883,
  [string]$MosquittoDirectory = 'C:\Program Files\mosquitto'
)
$ErrorActionPreference = 'Stop'
$brokerExecutable = Join-Path $MosquittoDirectory 'mosquitto.exe'
$passwordExecutable = Join-Path $MosquittoDirectory 'mosquitto_passwd.exe'
if (!(Test-Path -LiteralPath $brokerExecutable) -or !(Test-Path -LiteralPath $passwordExecutable)) {
  throw 'Install Eclipse Mosquitto for Windows first, or pass -MosquittoDirectory.'
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Use a port from 1024 to 65535.' }
$localDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.local'
New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
$passwordPath = Join-Path $localDirectory 'passwords'
if (!(Test-Path -LiteralPath $passwordPath)) {
  Write-Host 'Create the MQTT password for the ESP32 account (not the door PIN).'
  & $passwordExecutable -c $passwordPath 'smart-door-lock'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the device MQTT account.' }
}
# Prompt only if the second account is absent, including after an interrupted setup.
if (!(Select-String -LiteralPath $passwordPath -Pattern '^smart-door-web:' -Quiet)) {
  Write-Host 'Create a different MQTT password for the backend account.'
  & $passwordExecutable $passwordPath 'smart-door-web'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the backend MQTT account.' }
}
$aclPath = Join-Path $localDirectory 'acl'
@'
user smart-door-lock
topic write home/smart-door-lock/status
topic write home/smart-door-lock/telemetry

user smart-door-web
topic read home/smart-door-lock/status
topic read home/smart-door-lock/telemetry
'@ | Set-Content -LiteralPath $aclPath -Encoding ascii
$brokerConfig = Join-Path $localDirectory 'mosquitto.conf'
$passwordConfigPath = $passwordPath.Replace('\', '/')
$aclConfigPath = $aclPath.Replace('\', '/')
@"
listener $Port 0.0.0.0
allow_anonymous false
password_file $passwordConfigPath
acl_file $aclConfigPath
persistence false
log_dest stdout
"@ | Set-Content -LiteralPath $brokerConfig -Encoding ascii
Write-Host "Starting the LAN broker on port $Port. Leave this terminal open; Ctrl+C stops it."
& $brokerExecutable -c $brokerConfig -v
if ($LASTEXITCODE -ne 0) { throw 'Broker stopped with an error. Check whether another broker already uses this port.' }
