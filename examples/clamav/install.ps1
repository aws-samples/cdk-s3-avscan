# Define the download URL for ClamAV
$clamAVDownloadUrl = "https://www.clamav.net/downloads/production/clamav-1.2.1.win.x64.zip"

# Define the path to download
$clamAVInstallerPath = "$env:TEMP\clamav.zip"

# Download
Invoke-WebRequest -Uri $clamAVDownloadUrl -OutFile $clamAVInstallerPath

# Install
Expand-Archive "$env:TEMP\clamav.zip" $env:TEMP
Move-Item "$env:TEMP\clamav-1.2.1.win.x64\" "C:\Program Files\ClamAV\"

# Set the path for clamscan.exe in the environment variables
[Environment]::SetEnvironmentVariable("Path", "$env:Path;C:\Program Files\ClamAV\bin", [EnvironmentVariableTarget]::Machine)

# Display installation completion message
Write-Host "ClamAV has been successfully installed."

# Copy sample config files and remove the "Example" lines
$sourcePath = "C:\Program Files\ClamAV\conf_examples"
$destinationPath = "C:\Program Files\ClamAV"
$files = Get-ChildItem -Path $sourcePath
foreach ($file in $files) {
    $destinationFile = Join-Path -Path $destinationPath -ChildPath ($file.BaseName -replace '\.sample$')
    Copy-Item -Path $file.FullName -Destination $destinationFile -Force
    (Get-Content -Path $destinationFile) | Where-Object { $_ -notmatch "Example" } | Set-Content -Path $destinationFile
}
Write-Host "Example configuration applied."

# Update virus definitions
Start-Process -FilePath "C:\Program Files\ClamAV\freshclam.exe" -Wait
Write-Host "Database updated." 