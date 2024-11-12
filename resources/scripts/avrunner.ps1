# Logging
Start-Transcript -Path "C:\avrunner\logs\avrunner.log"

# Disable Windows Defender
Set-MpPreference -DisableRealtimeMonitoring $true 
Write "Windows Defender Realtime Monitoring disabled."

# Start CloudWatch Logs agent
. "C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1" -a fetch-config -m ec2 -c file:C:\ProgramData\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent.json
& "C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1" -a start

# Read Config
$configFilePath = "C:\avrunner\config.json"
$config = Get-Content -Path $configFilePath | Out-String | ConvertFrom-Json
$QueueUrl = $config.QueueUrl
$TagKeyResult = $config.TagKeyResult
$TagKeyStatus = $config.TagKeyStatus


# Processing lopp
while ($true) {

    # Get SQS Message from Queue
    $SQSMessage = Receive-SQSMessage -QueueUrl $QueueUrl -WaitTimeInSeconds 20  -MessageCount 1 

    # Process result
    if ($null -eq $SQSMessage)
    {
        Write "No messages found in queue"
    }
    else
    {
        # Process Message
        $MessageBodyObjectSNS = $($SQSMessage.Body) | ConvertFrom-Json
        $MessageBodyObjectS3 = $($MessageBodyObjectSNS.Message) | ConvertFrom-Json
        $props = @{
            MessageId = $SQSMessage.MessageId
            ReceiptHandle = $SQSMessage.ReceiptHandle
        }
        Write "Start processing message $($props.MessageId)"

        # If the property "Records" exists, it is not a test message
        if([bool]($MessageBodyObjectS3.PSobject.Properties.name -match "Records")) {

            $s3bucket = $MessageBodyObjectS3.Records[0].s3.bucket.name
            $s3object = [System.Web.HttpUtility]::UrlDecode($MessageBodyObjectS3.Records[0].s3.object.key)
            $filename = ( -join ((0x30..0x39) + ( 0x41..0x5A) + ( 0x61..0x7A) | Get-Random -Count 16  | % {[char]$_}) )

            # Download File from S3
            Copy-S3Object -BucketName $s3bucket -Key $s3object -LocalFile "$env:TEMP\$filename"

            # Scan file
            $scanfile = "$env:TEMP\$filename"
            $result = & C:\avrunner\scan.ps1 $scanfile *>&1 | Out-String
            $result = $result -replace "`n","" -replace "`r",""
            if ($result -eq "CLEAN") {
                Write-Host "File is not infected."
            } elseif ($result -eq "INFECTED") {
                Write-Host "File is infected."
            }

            # Set Tags in S3
            $tags = Get-S3ObjectTagSet -BucketName $s3bucket -Key $s3object
            if($tags -eq $null) {
                $tags = @([Amazon.S3.Model.Tag]@{ Key = $TagKeyStatus; Value = "COMPLETED"},[Amazon.S3.Model.Tag]@{ Key = $TagKeyResult; Value = $result})
            } else { # if there are existing tags, keep them
                [System.Collections.ArrayList] $tags = $tags
                $tags.Add([Amazon.S3.Model.Tag]@{ Key = $TagKeyStatus; Value = "COMPLETED"})
                $tags.Add([Amazon.S3.Model.Tag]@{ Key = $TagKeyResult; Value = $result})
            }
            [Amazon.S3.Model.Tag[]] $tags =  $tags
            Write-S3ObjectTagSet -BucketName $s3bucket -Key $s3object -Tagging_TagSet $tags 

            # Delete Temporary File
            Remove-Item -Path "$env:TEMP\$filename"

        } else {
            Write-Host "Received S3 Bucket Notification Test Message."
        }

        # Delete Message from queue
        Remove-SQSMessage -QueueUrl $QueueUrl -ReceiptHandle $props.ReceiptHandle -Force

        Write "Completed processing message $($props.MessageId)"

    }

} 
