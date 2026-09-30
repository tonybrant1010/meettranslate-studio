@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title MeetTranslate Studio
set "URL=http://localhost:8000"

echo.
echo  ==============================================
echo    MeetTranslate Studio  -  Gemini Live Translate
echo  ==============================================
echo.

rem --- Python keresése (a "py" indítót részesítjük előnyben) ---
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo  [HIBA] Nem található Python.
  echo  Telepítsd innen: https://www.python.org/downloads/
  echo  A telepítőben pipáld be: "Add python.exe to PATH".
  echo.
  pause
  exit /b 1
)

rem --- API kulcs ---
if not exist "backend\.env" (
  copy /y "backend\.env.example" "backend\.env" >nul
  echo  Első indítás: megnyitom a backend\.env fájlt.
  echo  Írd be a Gemini API kulcsodat a GEMINI_API_KEY= után, mentsd el,
  echo  majd indítsd újra ezt a fájlt.
  echo.
  notepad "backend\.env"
  pause
  exit /b 0
)
findstr /r /c:"^GEMINI_API_KEY=ide_masold" "backend\.env" >nul && (
  echo  [FIGYELEM] A backend\.env fájlban még a minta kulcs szerepel.
  notepad "backend\.env"
  pause
  exit /b 0
)

rem --- Virtuális környezet + csomagok ---
if not exist "backend\.venv\Scripts\python.exe" (
  echo  Python környezet létrehozása ^(csak első alkalommal^)...
  %PY% -m venv "backend\.venv" || (echo  [HIBA] venv létrehozása sikertelen. & pause & exit /b 1)
)
echo  Csomagok ellenőrzése...
"backend\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "backend\requirements.txt" || (
  echo  [HIBA] A csomagok telepítése nem sikerült ^(van internet?^).
  pause
  exit /b 1
)

if not exist "frontend\build\index.html" (
  echo  [FIGYELEM] Hiányzik a frontend\build mappa - a felület nem fog betöltődni.
)

rem --- Chrome megnyitása, amint a szerver elindult ---
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; try { Start-Process chrome -ArgumentList '%URL%' -ErrorAction Stop } catch { Start-Process '%URL%' }"

echo.
echo  A fordító fut: %URL%
echo  Ezt az ablakot hagyd nyitva a hívás alatt. Leállítás: zárd be az ablakot.
echo.
"backend\.venv\Scripts\python.exe" "backend\server.py"
echo.
echo  A szerver leállt.
pause
