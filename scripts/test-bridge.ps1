param (
    [int]$Port = 27125
)

$BaseUrl = "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Obsidian Canvas Sync Bridge Listener Diagnostic" -ForegroundColor Cyan
Write-Host "  Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$Passed = 0
$Total = 2

# Test 1: GET /health
Write-Host "[1/$Total] Testing GET /health endpoint..." -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "    [OK] Status: 200 OK" -ForegroundColor Green
    Write-Host "    [OK] Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
    $Passed++
} catch {
    Write-Host "    [FAIL] Failed to connect to $BaseUrl/health : $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: OPTIONS /canvas-sync
Write-Host ""
Write-Host "[2/$Total] Testing OPTIONS /canvas-sync (CORS preflight)..." -ForegroundColor White
try {
    $headers = @{
        "Origin" = "chrome-extension://test-probe"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "Content-Type, X-Canvas-Sync-Client"
    }
    $optResponse = Invoke-WebRequest -Uri "$BaseUrl/canvas-sync" -Method Options -Headers $headers -TimeoutSec 3 -ErrorAction Stop
    Write-Host "    [OK] Status: $($optResponse.StatusCode)" -ForegroundColor Green
    Write-Host "    [OK] Access-Control-Allow-Origin: $($optResponse.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Green
    Write-Host "    [OK] Access-Control-Allow-Methods: $($optResponse.Headers['Access-Control-Allow-Methods'])" -ForegroundColor Green
    $Passed++
} catch {
    Write-Host "    [FAIL] Failed OPTIONS request to $BaseUrl/canvas-sync : $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "------------------------------------------------------" -ForegroundColor Cyan
if ($Passed -eq $Total) {
    Write-Host "SUCCESS: Canvas Sync Bridge is active and listening on port $Port!`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAILED: Bridge listener is not reachable on $BaseUrl.`n" -ForegroundColor Red
    Write-Host "Troubleshooting Steps:" -ForegroundColor Yellow
    Write-Host " 1. Ensure Obsidian is open on your computer." -ForegroundColor Yellow
    Write-Host " 2. In Obsidian Settings > Community Plugins, verify 'Canvas Sync Bridge' is enabled." -ForegroundColor Yellow
    Write-Host " 3. In Obsidian Settings > Canvas Sync Bridge, verify 'Enable Browser Bridge' is toggled ON." -ForegroundColor Yellow
    Write-Host " 4. Verify the port in settings matches ($Port)." -ForegroundColor Yellow
    Write-Host " 5. In Obsidian, open Command Palette (Ctrl+P / Cmd+P) and run:" -ForegroundColor Yellow
    Write-Host "    'Canvas Sync: Restart browser bridge listener'" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------`n" -ForegroundColor Cyan
    exit 1
}

