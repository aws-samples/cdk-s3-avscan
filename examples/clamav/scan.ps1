# Get the file to be scanned
$scanFile = $args[0]

# Run clamscan.exe with the provided parameter
$clamScanOutput = & " C:\Program Files\ClamAV\clamscan.exe" $scanFile

# Parse the output to check for infected files
$infectedFilesMatch = $clamScanOutput | Select-String "Infected Files: (\d+)"
if ($infectedFilesMatch) {
    $infectedFilesCount = [int]$infectedFilesMatch.Matches.Groups[1].Value
    if ($infectedFilesCount -eq 0) {
        Write-Host "CLEAN"
    } else {
        Write-Host "INFECTED"
    }
} else {
    Write-Host "ERROR"
} 