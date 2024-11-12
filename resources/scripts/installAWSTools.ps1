# Install AWS Tools
Install-PackageProvider -Name NuGet -Confirm:$false -Force  
Install-Module -Name AWS.Tools.Installer -Force -AllowClobber
Install-AWSToolsModule AWS.Tools.SQS,AWS.Tools.S3 -CleanUp  -Force -AllowClobber

# Install CloudWatch Logging
$cwagentDownloadUrl = "https://amazoncloudwatch-agent.s3.amazonaws.com/windows/amd64/latest/amazon-cloudwatch-agent.msi"
$cwagentInstallPath = "$env:TEMP\amazon-cloudwatch-agent.msi"
Invoke-WebRequest -Uri $cwagentDownloadUrl -OutFile $cwagentInstallPath
msiexec /q /i $env:TEMP\amazon-cloudwatch-agent.msi