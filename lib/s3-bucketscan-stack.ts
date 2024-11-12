import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_notifications from "aws-cdk-lib/aws-s3-notifications";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as sns from "aws-cdk-lib/aws-sns";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { ec2Scanner } from "./constructs/ec2Scanner";
import { s3Frontend } from "./constructs/s3Frontend";

export class S3BucketscanStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Buckets for Input, Clean and Dirty data
    const inputBucket = new s3.Bucket(this, "InputBucket", { cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: ["*"], allowedHeaders:["*"] }] });
    const cleanBucket = new s3.Bucket(this, "CleanBucket", {cors: [{ allowedMethods: [s3.HttpMethods.GET], allowedOrigins: ["*"], allowedHeaders:["*"] }]});
    const dirtyBucket = new s3.Bucket(this, "DirtyBucket", {});

    // Send events for new files in Input bucket to SNS topic
    const inputTopic = new sns.Topic(this, "InputTopic", {});
    inputBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3_notifications.SnsDestination(inputTopic)
    );

    // VPC for scan instances
    const vpc = new ec2.Vpc(this, "VPC", { natGateways: 0 });

    // First AV Scanner
    const firstScanner = new ec2Scanner(this, "FirstScanner", {
      vpc,
      inputTopic,
      inputBucket,
      tagPrefix: "FIRST_SCANNER",
      avPath: "./examples/clamav/",
    });

    // Second AV Scanner
    const seconScanner = new ec2Scanner(this, "SecondScanner", {
      vpc,
      inputTopic,
      inputBucket,
      tagPrefix: "SECOND_SCANNER",
      avPath: "./examples/windows-defender/",
    });

    // Lambda function to aggregate the results and copy the files to clean/dirty buckets
    const aggregateFunction = new lambda.Function(this, "AggregateFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("./resources/aggregator"),
      environment: {
        CLEAN_BUCKET: cleanBucket.bucketName,
        DIRTY_BUCKET: dirtyBucket.bucketName,
        PREFIXES: "FIRST_SCANNER,SECOND_SCANNER", // Add your prefixes here
      },
    });
    inputBucket.grantReadWrite(aggregateFunction);
    cleanBucket.grantWrite(aggregateFunction);
    dirtyBucket.grantWrite(aggregateFunction);
    inputBucket.addEventNotification(
      s3.EventType.OBJECT_TAGGING_PUT,
      new s3_notifications.LambdaDestination(aggregateFunction)
    );

    // Frontend
    const frontend = new s3Frontend(this, "S3Frontend", { inputBucket, cleanBucket });
    
  }
}
