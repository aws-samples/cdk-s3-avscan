# Get the file to be scanned
$scanFile = $args[0] | Resolve-Path 

# Define Windows Defender Command
$commandPath = "C:\Program Files\Windows Defender\MpCmdRun.exe"
$parameters = @("-Scan", "-ScanType", "3", "-DisableRemediation", "-File", $scanFile)

# Create a temporary file to capture the output
$outputFile = [System.IO.Path]::GetTempFileName()

# Run the command and redirect the standard output to the temporary file
Start-Process -FilePath $commandPath -ArgumentList $parameters -Wait -NoNewWindow -RedirectStandardOutput $outputFile

# Read the contents of the output file
$outputContent = Get-Content -Path $outputFile

# Parse the output to check for infected files
$regexPattern = 'found (\d+|no) threats'
$matches = $outputContent | Select-String -Pattern $regexPattern -AllMatches

# Check if matches were found
if ($matches.Matches.Count -gt 0) {
    # Threats detected or "no threats"
    $threatCount = $matches.Matches.Groups[1].Value

    if ($threatCount -eq "no") {
        Write-Host "CLEAN"
    } else {
        Write-Host "INFECTED"
    }
} else {
    # Output doesn't match expected patterns
    Write-Host "ERROR"
}