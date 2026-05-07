# Sync-Solution.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$SolutionName,
    [string]$EnvironmentUrl
)

Write-Host "Syncing solution $SolutionName from $EnvironmentUrl..." -ForegroundColor Cyan

# Use the stable pac CLI path
$pacPath = "$HOME/bin/pac"

# Export solution
& $pacPath solution export --name $SolutionName --path ./Solutions/$SolutionName.zip --managed false

# Unpack solution
& $pacPath solution unpack --zipfile ./Solutions/$SolutionName.zip --folder ./Solutions/$SolutionName --allowDelete
