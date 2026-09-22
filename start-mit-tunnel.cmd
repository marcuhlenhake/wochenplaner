@echo off
rem Startet den Wochenplaner und einen Cloudflare-Quick-Tunnel (Adresse aendert sich bei jedem Start).
cd /d "%~dp0"

findstr /r /b "ACCESS_TOKEN=." .env >nul 2>&1
if errorlevel 1 (
  echo ACCESS_TOKEN fehlt in .env. Ohne Zugangscode darf die App nicht ins Internet.
  pause
  exit /b 1
)
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared ist nicht installiert. Installation: winget install --id Cloudflare.cloudflared -e
  pause
  exit /b 1
)

start "Wochenplaner Server" cmd /k node server.mjs
timeout /t 2 /nobreak >nul
echo.
echo Suche in der Ausgabe unten nach der Adresse https://....trycloudflare.com
echo Diese Adresse am Handy in Chrome oeffnen. Fenster offen lassen, solange die App erreichbar sein soll.
echo.
cloudflared tunnel --url http://127.0.0.1:3000
