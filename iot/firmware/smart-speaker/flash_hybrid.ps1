param([string]$Port = "COM6")
$ErrorActionPreference = "Stop"

$env:IDF_PATH = "C:\Espressif\frameworks\esp-idf-v5.5.5"
$env:IDF_TOOLS_PATH = "C:\Users\PhamDinhDong\.espressif"
$env:IDF_PYTHON_ENV_PATH = "C:\Users\PhamDinhDong\.espressif\python_env\idf5.5_py3.14_env"

. "$env:IDF_PATH\export.ps1"
$env:Path = "$env:IDF_PYTHON_ENV_PATH\Scripts;$env:Path"
Set-Location -LiteralPath $PSScriptRoot
& "$env:IDF_PYTHON_ENV_PATH\Scripts\python.exe" `
  "$env:IDF_PATH\tools\idf.py" -B "C:\iot_group_speaker_build_ascii" `
  -p $Port flash monitor
