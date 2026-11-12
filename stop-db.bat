@echo off
rem Stops the portable PostgreSQL started by start.bat (close the Backend/Frontend windows separately).
if not defined PG_HOME set "PG_HOME=%USERPROFILE%\pgsql"
if exist "%PG_HOME%\bin\pg_ctl.exe" (
  "%PG_HOME%\bin\pg_ctl.exe" -D "%PG_HOME%\data" stop -m fast
) else (
  echo Portable PostgreSQL not found in %PG_HOME% - nothing to stop.
)
pause
