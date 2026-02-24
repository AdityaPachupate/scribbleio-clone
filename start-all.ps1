# Startup script for scribbleio-clone

Write-Host "Starting Backend (scribble.API)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd scribble.API; dotnet run"

Write-Host "Starting Frontend (scribble-client)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd scribble-client; npm start"

Write-Host "Both processes started in new windows." -ForegroundColor Yellow
