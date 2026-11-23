@echo off
REM Sube el proyecto al repositorio de GitHub (solo la primera vez)
cd /d "%~dp0"
REM El workflow viene en ci\main.yml; se coloca en .github\workflows
if exist ci\main.yml (
  if not exist .github\workflows mkdir .github\workflows
  move /Y ci\main.yml .github\workflows\main.yml >nul
  rmdir ci 2>nul
)
if not exist .git git init -b main
git config user.name >nul 2>&1 || git config user.name "Edgar Tinajero Moreno"
git config user.email >nul 2>&1 || git config user.email "2023371115-rgb@users.noreply.github.com"
git add -A
git commit -m "Proyecto final: frontend, Playwright, OpenTelemetry y OpenObserve"
git remote get-url origin >nul 2>&1 || git remote add origin https://github.com/2023371115-rgb/taskmanager-observabilidad.git
git branch -M main
git push -u origin main
echo.
echo Listo. Revisa la pestana Actions del repositorio.
pause
