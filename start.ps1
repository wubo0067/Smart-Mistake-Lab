[CmdletBinding()]
param(
    [string]$Ip,
    [switch]$NoFrontend,
    [switch]$NoBackend,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$rawLine = $MyInvocation.Line
if ($rawLine) {
    $ipMatch = [regex]::Match($rawLine, '(?<!\S)--ip\s+(?:"([^"]+)"|''([^'']+)''|(\S+))')
    if ($ipMatch.Success) {
        $Ip = @($ipMatch.Groups[1].Value, $ipMatch.Groups[2].Value, $ipMatch.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
    }
    if ($rawLine -match '(?<!\S)--no-frontend(?:\s|$)') {
        $NoFrontend = $true
    }
    if ($rawLine -match '(?<!\S)--no-backend(?:\s|$)') {
        $NoBackend = $true
    }
}

for ($index = 0; $index -lt $RemainingArgs.Count; $index++) {
    if ($RemainingArgs[$index] -notmatch '^-') {
        $Ip = $RemainingArgs[$index]
        continue
    }
    switch ($RemainingArgs[$index]) {
        '--ip' {
            if ($index + 1 -ge $RemainingArgs.Count) {
                throw '参数 --ip 缺少值'
            }
            $Ip = $RemainingArgs[$index + 1]
            $index++
        }
        '--no-frontend' {
            $NoFrontend = $true
        }
        '--no-backend' {
            $NoBackend = $true
        }
        default {
            throw "未知参数: $($RemainingArgs[$index])"
        }
    }
}

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $RootDir "server"
$BackendHost = if ($Ip) { $Ip } else { "127.0.0.1" }
$FrontendHost = if ($Ip) { $Ip } else { "localhost" }
$BackendCommand = if ($Ip) {
    "cd '$($ServerDir -replace "'", "''")'; uv run python server.py --host '$($Ip -replace "'", "''")'"
}
else {
    "cd '$($ServerDir -replace "'", "''")'; uv run python server.py"
}

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Smart Mistake Lab  启动脚本      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 启动后端 ────────────────────────────────────
if (-not $NoBackend) {
    Write-Host "▸ [1/2] 启动后端服务 (FastAPI) ..." -ForegroundColor Green
    $BackendCmdOnly = "uv run python server.py"
    if ($Ip) {
        $BackendCmdOnly += " --host '$Ip'"
    }

    # 构建 WT 参数：-w 0 (当前窗口) new-tab (新标签) -d (工作目录)
    $wtArgs = @(
        "-w", "0",
        "new-tab",
        "-d", $ServerDir,
        "powershell.exe", "-NoExit", "-Command", "& { $BackendCmdOnly }"
    )

    try {
        Start-Process wt -ArgumentList $wtArgs -ErrorAction Stop
        Write-Host "  ✓ 后端服务已在 Windows Terminal 新标签页中启动" -ForegroundColor DarkGreen
    }
    catch {
        # 如果用户没用 Windows Terminal，就尝试传统的 Start-Process 模式防止脚本崩溃
        Write-Warning "无法使用 Windows Terminal 启动新标签，正在尝试传统窗口模式..."
        Start-Process powershell -ArgumentList @("-NoExit", "-Command", $BackendCommand)
    }

    Write-Host ""
    Start-Sleep 3
}

# ─── 启动前端 ────────────────────────────────────
if (-not $NoFrontend) {
    Write-Host "▸ [2/2] 启动前端服务 (Vite) ..." -ForegroundColor Green

    # New: Open Chrome to the frontend URL
    $FrontendUrl = "http://$($FrontendHost):5173"
    Write-Host "  正在尝试打开浏览器访问: $FrontendUrl" -ForegroundColor Gray
    try {
        Start-Process chrome $FrontendUrl 2>$null
    }
    catch {
        # If Chrome fails, try to open the default browser with the URL
        Start-Process $FrontendUrl 2>$null
    }

    Write-Host ""
    Write-Host "  打开浏览器访问:" -ForegroundColor White
    Write-Host "  ┌─────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "  │  http://$FrontendHost`:5173               │" -ForegroundColor Cyan
    Write-Host "  └─────────────────────────────────────┘" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  按 Ctrl+C 可停止前端服务" -ForegroundColor Yellow
    Write-Host "  （后端服务请在独立窗口中关闭）" -ForegroundColor DarkGray
    Write-Host ""

    Push-Location $RootDir
    try {
        if ($Ip) {
            $env:SMART_MISTAKE_LAB_HOST = $Ip
            npm run dev -- --host $Ip
        }
        else {
            npm run dev
        }
    }
    finally {
        Pop-Location
    }
}

