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
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        $BackendCommand
    ) -WindowStyle Normal
    Write-Host "  ✓ 后端服务窗口已创建 (http://$BackendHost`:8765)" -ForegroundColor DarkGreen
    Write-Host "  ✓ 后端日志将显示在独立窗口中" -ForegroundColor DarkGray
    Write-Host ""
    Start-Sleep 3
}

# ─── 启动前端 ────────────────────────────────────
if (-not $NoFrontend) {
    Write-Host "▸ [2/2] 启动前端服务 (Vite) ..." -ForegroundColor Green
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
