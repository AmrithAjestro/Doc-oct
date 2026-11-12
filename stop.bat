@echo off
rem Stops everything start.bat started: the API and app windows, then the portable PostgreSQL.
taskkill /FI "WINDOWTITLE eq Backend - API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend - React*" /T /F >nul 2>&1
echo Closed the Backend and Frontend windows (if they were open).
if not defined PG_HOME set "PG_HOME=%USERPROFILE%\pgsql"
if exist "%PG_HOME%\bin\pg_ctl.exe" (
  "%PG_HOME%\bin\pg_ctl.exe" -D "%PG_HOME%\data" stop -m fast
) else (
  echo Portable PostgreSQL not found in %PG_HOME% - nothing to stop.
)
pause
