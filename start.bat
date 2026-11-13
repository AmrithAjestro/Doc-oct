@echo off
setlocal
title Doctor Appointment System
cd /d "%~dp0"

echo ==================================================
echo   Doctor Appointment System - launcher
echo ==================================================

rem ---- 1. PostgreSQL ------------------------------------------------------
rem Portable install in %USERPROFILE%\pgsql (override with PG_HOME). If you use an
rem installed PostgreSQL service instead, this step is skipped automatically.
if not defined PG_HOME set "PG_HOME=%USERPROFILE%\pgsql"
if exist "%PG_HOME%\bin\pg_ctl.exe" (
  "%PG_HOME%\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 >nul 2>&1
  if errorlevel 1 (
    echo Starting PostgreSQL from %PG_HOME% ...
    "%PG_HOME%\bin\pg_ctl.exe" -D "%PG_HOME%\data" -l "%PG_HOME%\postgres.log" -o "-p 5432" start -w >nul
    if errorlevel 1 (
      echo [!] PostgreSQL did not start. See %PG_HOME%\postgres.log
      pause
      exit /b 1
    )
  ) else (
    echo PostgreSQL is already running.
  )
) else (
  echo Using your own PostgreSQL on 127.0.0.1:5432 - make sure it is running.
)

rem ---- 2. First-run setup ---------------------------------------------------
if not exist "server\node_modules" (
  echo Installing backend packages...
  pushd server && call npm install && popd
)
if not exist "client\node_modules" (
  echo Installing frontend packages...
  pushd client && call npm install && popd
)
if not exist "server\.env" (
  echo Creating server\.env and the database with demo data...
  pushd server
  copy /y .env.example .env >nul
  for /f %%s in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do (
    powershell -NoProfile -Command "(Get-Content .env) -replace '^JWT_SECRET=$','JWT_SECRET=%%s' | Set-Content -Encoding ascii .env"
  )
  call npm run db:setup
  if errorlevel 1 (
    popd
    echo [!] Database setup failed. Check DB_* settings in server\.env
    pause
    exit /b 1
  )
  popd
)

rem ---- 3. Start the apps ------------------------------------------------------
echo Starting Backend  (http://localhost:5000/api) ...
start "Backend - API" cmd /k "cd /d "%~dp0server" && npm run dev"

echo Starting Frontend (http://localhost:5173) ...
start "Frontend - React" cmd /k "cd /d "%~dp0client" && npm run dev"

rem Wait (up to 60 s) until the API answers, so the first page load does not fail.
set /a tries=0
:waitapi
curl -s -o nul http://localhost:5000/api/health && goto apiup
set /a tries+=1
if %tries% geq 30 (
  echo [!] The API did not start. Check the "Backend - API" window for the error.
  goto openapp
)
timeout /t 2 /nobreak >nul
goto waitapi
:apiup
echo API is up.
:openapp
timeout /t 2 /nobreak >nul
start "" http://localhost:5173

echo.
echo All applications started. Close their windows to stop them.
echo   Patient : demo@gmail.com              / Password@123
echo   Doctor  : doc@gmail.com               / Password@1234
echo   Admin   : amrithamrith2753@gmail.com  / Admin@1234
echo.
endlocal
