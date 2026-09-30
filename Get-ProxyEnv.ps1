$userProxy = [Environment]::GetEnvironmentVariable('HTTPS_PROXY', 'User')
$sysProxy = [Environment]::GetEnvironmentVariable('HTTPS_PROXY', 'Machine')
$currProxy = $env:HTTPS_PROXY

Write-Host "=========================================" -ForegroundColor Gray
Write-Host "👤 用户级 HTTPS_PROXY : " -NoNewline -ForegroundColor Cyan
Write-Host $(if ($userProxy) { $userProxy } else { "(未设置)" }) -ForegroundColor White

Write-Host "💻 系统级 HTTPS_PROXY : " -NoNewline -ForegroundColor Yellow
Write-Host $(if ($sysProxy) { $sysProxy } else { "(未设置)" }) -ForegroundColor White

Write-Host "⚙️  当前进程实际生效  : " -NoNewline -ForegroundColor Green
Write-Host $(if ($currProxy) { $currProxy } else { "(未设置)" }) -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Gray