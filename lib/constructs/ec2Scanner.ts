import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3_assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sns_subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";

interface ec2ScannerProps {
  vpc: ec2.Vpc;
  inputTopic: sns.Topic;
  inputBucket: s3.Bucket;
  tagPrefix: String;
  avPath: String;
  instanceType?: ec2.InstanceType;
  machineImage?: ec2.IMachineImage;
}

export class ec2Scanner extends Construct {
  constructor(scope: Construct, id: string, props: ec2ScannerProps) {
    super(scope, id);

    // Create a queue for this scanner and subscribe to the SNS topic
    const inputQueue = new sqs.Queue(this, "InputQueue");
    props.inputTopic.addSubscription(
      new sns_subscriptions.SqsSubscription(inputQueue)
    );

    // Create AutoScalingGroup for scan instances
    const asg = new autoscaling.AutoScalingGroup(this, "ASG", {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      instanceType:
        props.instanceType ||
        ec2.InstanceType.of(
          ec2.InstanceClass.STANDARD6_AMD,
          ec2.InstanceSize.LARGE
        ),
      machineImage:
        props.machineImage ||
        new ec2.WindowsImage(
          ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE
        ),
      minCapacity: 0,
      keyName: 'windoof'
    });

    // Allow EC2s to write to CloudWatch Logs
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyArn(this,"CloudWatchPolicy","arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy")
    );

    // Define Assets to be deployed to the EC2s
    const assetInstallAWSTools = new s3_assets.Asset(this, "InstallAWSTools", {path:"./resources/scripts/installAWSTools.ps1"});
    const assetAvrunner = new s3_assets.Asset(this, "Avrunner", {path:"./resources/scripts/avrunner.ps1"});
    const assetInstall = new s3_assets.Asset(this, "Install", {path:props.avPath+"install.ps1"});
    const assetScan = new s3_assets.Asset(this, "Scan", {path:props.avPath+"scan.ps1"});
    const assetCWLogs = new s3_assets.Asset(this, "CWLogsConfig", {path:"./resources/cloudwatch/amazon-cloudwatch-agent.json"})

    // Build UserData for the EC2s
    asg.userData.addS3DownloadCommand({
      bucket:assetInstallAWSTools.bucket,
      bucketKey:assetInstallAWSTools.s3ObjectKey,
      localFile:"C:\\avrunner\\installAWSTools.ps1"
    });
    assetInstall.grantRead(asg);
    asg.userData.addS3DownloadCommand({
      bucket:assetAvrunner.bucket,
      bucketKey:assetAvrunner.s3ObjectKey,
      localFile:"C:\\avrunner\\avrunner.ps1"
    });
    assetAvrunner.grantRead(asg);
    asg.userData.addS3DownloadCommand({
      bucket:assetInstall.bucket,
      bucketKey:assetInstall.s3ObjectKey,
      localFile:"C:\\avrunner\\install.ps1"
    });
    assetInstall.grantRead(asg);
    asg.userData.addS3DownloadCommand({
      bucket:assetScan.bucket,
      bucketKey:assetScan.s3ObjectKey,
      localFile:"C:\\avrunner\\scan.ps1"
    });
    assetScan.grantRead(asg);
    asg.userData.addS3DownloadCommand({
      bucket:assetCWLogs.bucket,
      bucketKey:assetCWLogs.s3ObjectKey,
      localFile:"C:\\ProgramData\\Amazon\\AmazonCloudWatchAgent\\amazon-cloudwatch-agent.json"
    });
    assetCWLogs.grantRead(asg);
    asg.userData.addExecuteFileCommand({
      filePath: "C:\\avrunner\\installAWSTools.ps1",
    });
    asg.userData.addExecuteFileCommand({
      filePath: "C:\\avrunner\\install.ps1",
    })
    const configCommand = `
      \$configObject = @{
        "QueueUrl" = "${inputQueue.queueUrl}"
        "TagKeyResult" = "${props.tagPrefix + "_RESULT"}"
        "TagKeyStatus" = "${props.tagPrefix + "_STATUS"}"
      }
      \$configObject | ConvertTo-Json | Out-File -FilePath "C:\\avrunner\\config.json"
    `;
    asg.userData.addCommands(configCommand);
    asg.userData.addExecuteFileCommand({
      filePath: "C:\\avrunner\\avrunner.ps1",
    });
    
    // Add SSM Policy to the EC2s (optional, for debugging)
    asg.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMFullAccess")
    );

    // Grant permissions to the EC2s to access the queue and the bucket.
    inputQueue.grantConsumeMessages(asg);
    props.inputBucket.grantReadWrite(asg);

    // Configure autoscaling based on queue metric
    const metric = inputQueue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.seconds(60),
      statistic: "Average",
    });
    asg.scaleOnMetric("QueueMessagesVisibleScaling", {
      metric: metric,
      adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.seconds(300),
      scalingSteps: [
        { upper: 0, change: -1 },
        { lower: 1, change: +1 },
      ],
    });

  }
}
