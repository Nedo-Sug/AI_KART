@echo off
setlocal

if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)

start "AI KAPT Backend" cmd /k npm run dev:backend
start "AI KAPT Frontend" cmd /k npm run dev:frontend
