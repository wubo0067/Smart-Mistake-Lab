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

$ErrorActionPreference = "Stop"

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    return $Name
}

function Join-NativeArgumentList {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    return ($Arguments | ForEach-Object {
            if ($_ -match '[\s"]') {
                '"{0}"' -f ($_ -replace '"', '\\"')
            }
            else {
                $_
            }
        }) -join ' '
}

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $RootDir "server"
$FrontendHost = if ($Ip) { $Ip } else { "localhost" }

$PowerShellExe = if (Test-Path "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe") {
    "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
}
else {
    Resolve-CommandPath -Name "powershell.exe"
}

$WTExe = Resolve-CommandPath -Name "wt.exe"
$UVExe = Resolve-CommandPath -Name "uv.exe"
$NpmExe = if (Test-Path "$env:ComSpec") {
    "npm.cmd"
}
else {
    Resolve-CommandPath -Name "npm"
}

$BackendCommand = "Set-Location '$($ServerDir -replace "'", "''")'; & '$($UVExe -replace "'", "''")' run python server.py"
if ($Ip) {
    $BackendCommand += " --host '$($Ip -replace "'", "''")'"
}

$BackendCmdOnly = "& '$($UVExe -replace "'", "''")' run python server.py"
if ($Ip) {
    $BackendCmdOnly += " --host '$($Ip -replace "'", "''")'"
}

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Smart Mistake Lab  启动脚本      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 启动后端 ────────────────────────────────────
if (-not $NoBackend) {
    Write-Host "▸ [1/2] 启动后端服务 (FastAPI) ..." -ForegroundColor Green
    # 构建 WT 参数：-w 0 (当前窗口) new-tab (新标签) -d (工作目录)
    $wtArgs = @(
        "-w", "0",
        "new-tab",
        "-d", $ServerDir,
        $PowerShellExe, "-NoExit", "-Command", "& { $BackendCmdOnly }"
    )

    try {
        Start-Process $WTExe -ArgumentList (Join-NativeArgumentList -Arguments $wtArgs) -ErrorAction Stop
        Write-Host "  ✓ 后端服务已在 Windows Terminal 新标签页中启动" -ForegroundColor DarkGreen
    }
    catch {
        # 如果用户没用 Windows Terminal，就尝试传统的 Start-Process 模式防止脚本崩溃
        Write-Warning "无法使用 Windows Terminal 启动新标签，正在尝试传统窗口模式..."
        $fallbackArgs = @("-NoExit", "-Command", $BackendCommand)
        Start-Process $PowerShellExe -ArgumentList (Join-NativeArgumentList -Arguments $fallbackArgs)
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
    # chrome 通常不在 PATH 中，需从注册表 App Paths 或常见安装位置解析
    $chromeExe = $null
    $chromeAppPath = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
    if ($chromeAppPath -and (Test-Path $chromeAppPath)) {
        $chromeExe = $chromeAppPath
    }
    else {
        foreach ($candidate in @(
                "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
            )) {
            if (Test-Path $candidate) {
                $chromeExe = $candidate
                break
            }
        }
    }

    try {
        if ($chromeExe) {
            Start-Process $chromeExe $FrontendUrl 2>$null
        }
        else {
            # 没找到 Chrome，用系统默认浏览器打开
            Start-Process $FrontendUrl 2>$null
        }
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
            & $NpmExe run dev -- --host $Ip
        }
        else {
            & $NpmExe run dev
        }
    }
    finally {
        Pop-Location
    }
}

