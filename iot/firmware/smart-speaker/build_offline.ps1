$ErrorActionPreference = "Stop"

$env:IDF_PATH = "C:\Espressif\frameworks\esp-idf-v5.5.5"
$env:IDF_TOOLS_PATH = "C:\Users\PhamDinhDong\.espressif"
$env:IDF_PYTHON_ENV_PATH = "C:\Users\PhamDinhDong\.espressif\python_env\idf5.5_py3.14_env"

. "$env:IDF_PATH\export.ps1"
$env:Path = "$env:IDF_PYTHON_ENV_PATH\Scripts;$env:Path"
Set-Location -LiteralPath $PSScriptRoot
# Separate build output for the group copy. Never reuse the original voice
# project's C:\iot_hybrid_build_ascii cache, which belongs to a different source.
$buildDir = "C:\iot_group_speaker_build_ascii"
$idfPy = "$env:IDF_PYTHON_ENV_PATH\Scripts\python.exe"
& $idfPy "$env:IDF_PATH\tools\idf.py" -B $buildDir build
