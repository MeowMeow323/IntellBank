param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-ServiceWindow {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $escapedDir = $WorkingDirectory.Replace("'", "''")
    $escapedCmd = $Command.Replace("'", "''")
    $script = "Set-Location '$escapedDir'; $escapedCmd"

    Start-Process powershell -ArgumentList @('-NoExit', '-Command', $script) | Out-Null
    Write-Host "Started $Name"
}

Start-ServiceWindow -Name 'AI Service' -WorkingDirectory (Join-Path $root 'ai-service') -Command '.\\venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --port 8000'
Start-ServiceWindow -Name 'Backend' -WorkingDirectory (Join-Path $root 'backend') -Command '.\\mvnw spring-boot:run'
Start-ServiceWindow -Name 'Frontend' -WorkingDirectory (Join-Path $root 'frontend') -Command 'npm run dev'
