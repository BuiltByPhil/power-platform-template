# Sync-Solution.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$SolutionName,
    [string]$EnvironmentUrl
)

Write-Host "Syncing solution $SolutionName from $EnvironmentUrl..." -ForegroundColor Cyan

# Use the stable pac CLI path
$pacPath = "$HOME/bin/pac"

# Build optional environment flag
$envFlag = if ($EnvironmentUrl) { @("--environment", $EnvironmentUrl) } else { @() }

# Export solution
& $pacPath solution export --name $SolutionName --path ./Solutions/$SolutionName.zip --managed false @envFlag
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Export failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

# Unpack solution
& $pacPath solution unpack --zipfile ./Solutions/$SolutionName.zip --folder ./Solutions/$SolutionName --allowDelete
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Unpack failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Sync complete." -ForegroundColor Green
