@echo off
title Smart Mistake Lab

echo.
echo === Smart Mistake Lab 一键启动 ===
echo.

:: 自动获取脚本所在目录
set "ROOT_DIR=%~dp0"
set "HOST_IP="

:: 解析可选 IP 参数：start.bat --ip 192.168.1.10
if /I "%~1"=="--ip" (
    set "HOST_IP=%~2"
)

if /I "%~1"=="--ip" if "%HOST_IP%"=="" (
    echo [错误] --ip 参数缺少值
    echo        用法: start.bat --ip 192.168.1.10
    pause
    exit /b 1
)

set "BACKEND_URL=http://127.0.0.1:8765"
set "FRONTEND_URL=http://localhost:5173"
set "BACKEND_HOST_ARG="

if not "%HOST_IP%"=="" (
    set "BACKEND_URL=http://%HOST_IP%:8765"
    set "FRONTEND_URL=http://%HOST_IP%:5173"
    set "BACKEND_HOST_ARG= --host %HOST_IP%"
)

:: 检测 Node.js 是否安装
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^>= 18
    echo        下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检测 npm 依赖是否已安装
if not exist "%ROOT_DIR%node_modules\" (
    echo [信息] 未检测到 node_modules，正在安装前端依赖 ...
    cd /d "%ROOT_DIR%"
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [错误] npm install 失败，请检查网络连接后重试
        pause
        exit /b 1
    )
    echo [信息] 前端依赖安装完成
    echo.
)

:: 检测 Python 依赖是否已安装（检查 .venv 是否存在）
if not exist "%ROOT_DIR%server\.venv\" (
    echo [信息] 未检测到 .venv，正在安装后端依赖 ...
    cd /d "%ROOT_DIR%server"
    call uv sync
    if %ERRORLEVEL% neq 0 (
        echo [警告] uv sync 失败，请进入 server 目录手动执行 uv sync
    ) else (
        echo [信息] 后端依赖安装完成
    )
    echo.
)

cd /d "%ROOT_DIR%"

echo 正在启动服务 ...
echo   后端 ^> 新窗口中启动 (%BACKEND_URL%)
echo   前端 ^> 当前窗口中启动 (%FRONTEND_URL%)
echo.
echo 提示: 请勿关闭此窗口，按 Ctrl+C 可停止前端服务
echo.

:: 启动后端（新窗口）
start "Smart Mistake Lab - Backend" powershell -NoExit -Command "cd '%ROOT_DIR%server'; uv run python server.py%BACKEND_HOST_ARG%"

:: 等几秒让后端先启动
timeout /t 3 /nobreak >nul

:: 启动前端（当前窗口）
if not "%HOST_IP%"=="" set "SMART_MISTAKE_LAB_HOST=%HOST_IP%"
npm run dev

:: 如果前端关闭，提示用户
echo.
echo 前端服务已停止。如需同时关闭后端，请关闭后端窗口。
pause
