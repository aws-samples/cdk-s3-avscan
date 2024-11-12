import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import {
  IdentityPool,
  UserPoolAuthenticationProvider,
} from "@aws-cdk/aws-cognito-identitypool-alpha";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";
import { execSync } from "child_process";
import { cpSync } from "fs";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";

interface ec2ScannerProps {
  inputBucket: cdk.aws_s3.Bucket;
  cleanBucket: cdk.aws_s3.Bucket;
}

export class s3Frontend extends Construct {
  constructor(scope: Construct, id: string, props: ec2ScannerProps) {
    super(scope, id);

    // Cognito UserPool & Identity Pool
    const userPool = new UserPool(this, "userPool", {});
    const identityPool = new IdentityPool(this, "identityPool", {});
    const userPoolClient = identityPool.addUserPoolAuthentication(
      new UserPoolAuthenticationProvider({
        userPool,
      })
    );

    // Set permissions to allow authenticated users to upload, list and download files within their own prefix
    identityPool.authenticatedRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [
          props.inputBucket.bucketArn +
            "/private/${cognito-identity.amazonaws.com:sub}/*",
        ],
        effect: cdk.aws_iam.Effect.ALLOW,
      })
    );
    identityPool.authenticatedRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [props.cleanBucket.bucketArn],
        effect: cdk.aws_iam.Effect.ALLOW,
        conditions: {
          StringLike: {
            "s3:prefix": ["private/${cognito-identity.amazonaws.com:sub}/*"],
          },
        },
      })
    );
    identityPool.authenticatedRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [
          props.cleanBucket.bucketArn +
            "/private/${cognito-identity.amazonaws.com:sub}/*",
        ],
        effect: cdk.aws_iam.Effect.ALLOW,
      })
    );

    // Bundle and Deploy Frontend Application
    const bucket = new Bucket(this, "DeploymentBucket", {});
    let userPoolClientId: string | undefined;
    userPool.node.children.forEach((child) => {
      if (child instanceof UserPoolClient) {
        userPoolClientId = child.userPoolClientId;
      }
    });
    new BucketDeployment(this, "DeployMySite", {
      destinationBucket: bucket,
      sources: [
        Source.data(
          "config.js",
          `
        window.config = {
          region: "${cdk.Stack.of(this).region}",
          userPoolId: "${userPool.userPoolId}",
          userPoolClientId: "${userPoolClientId}",
          identityPoolId: "${identityPool.identityPoolId}",
          inputBucket: "${props.inputBucket.bucketName}",
          cleanBucket: "${props.cleanBucket.bucketName}"
        }`
        ),
        Source.asset(path.join(__dirname, "../../resources/frontend/"), {
          bundling: {
            image: cdk.DockerImage.fromRegistry("node:lts"),
            local: {
              tryBundle(outputDir: string) {
                try {
                  execSync("npm install && npm run build", {
                    cwd: path.join(__dirname, "../../resources/frontend/"),
                  });
                  cpSync(
                    path.join(__dirname, "../../resources/frontend/build/"),
                    outputDir,
                    {
                      recursive: true,
                    }
                  );
                  console.log("Local bundling ok.");
                  return true;
                } catch (e) {
                  console.log("Local bundling failed.", e);
                  return false;
                }
              },
            },
            command: [
              "bash",
              "-c",
              [
                "npm install",
                "npm run build",
                "cp -r /asset-input/build/* /asset-output/",
              ].join(" && "),
            ],
          },
        }),
      ],
    });
    const dist = new Distribution(this, "FrontendDist", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new S3Origin(bucket),
      },
    });
    new cdk.CfnOutput(this, "FrontendURL", {value: dist.domainName})
  }
}
