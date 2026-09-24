@echo off
setlocal
set "RESUME_FILL_CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%RESUME_FILL_CSC%" set "RESUME_FILL_CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%RESUME_FILL_CSC%" (
  echo .NET Framework compiler was not found. Install Microsoft .NET Framework 4.8 and retry.
  pause
  exit /b 1
)
set "RESUME_FILL_INSTALLER=%TEMP%\resume-fill-installer-%RANDOM%-%RANDOM%.exe"
"%RESUME_FILL_CSC%" /nologo /target:exe /reference:System.Web.Extensions.dll /out:"%RESUME_FILL_INSTALLER%" "%~dp0Host.cs"
if errorlevel 1 (
  echo Build failed. Keep the message above for diagnosis.
  pause
  exit /b 1
)
"%RESUME_FILL_INSTALLER%" --install %*
set "RESUME_FILL_RESULT=%ERRORLEVEL%"
del "%RESUME_FILL_INSTALLER%" >nul 2>&1
if not "%RESUME_FILL_RESULT%"=="0" echo Installation failed. Keep the message above for diagnosis.
pause
exit /b %RESUME_FILL_RESULT%
