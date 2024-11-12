import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const getId = async (config) => {
    const client = new CognitoIdentityClient({ region: config.Auth.Cognito.region,
        credentials: fromCognitoIdentityPool({
            client: new CognitoIdentityClient({ region: config.Auth.Cognito.region }),
            identityPoolId: config.Auth.Cognito.identityPoolId,
            logins: {
              ["cognito-idp." +
              config.Auth.Cognito.region +
              ".amazonaws.com/" +
              config.Auth.Cognito.userPoolId]: localStorage.getItem(
                Object.keys(localStorage).filter((k) => k.match("idToken"))[0]
              ),
            },
          }),
    });
  const command = new GetIdCommand({
    IdentityPoolId: config.Auth.Cognito.identityPoolId,
    Logins: {
        [`cognito-idp.${config.Auth.Cognito.region}.amazonaws.com/${config.Auth.Cognito.userPoolId}`]: localStorage.getItem(
            Object.keys(localStorage).filter((k) => k.match("idToken"))[0]
          ),
    },
  });
  const id = await client.send(command);



  console.log(id.IdentityId)
  return id.IdentityId;
}

const getS3Client = (config) => {
  // Initialize s3 with temporary credentials from cognito
  return new S3Client({
    region: config.Auth.Cognito.region,
    credentials: fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: config.Auth.Cognito.region }),
      identityPoolId: config.Auth.Cognito.identityPoolId,
      logins: {
        ["cognito-idp." +
        config.Auth.Cognito.region +
        ".amazonaws.com/" +
        config.Auth.Cognito.userPoolId]: localStorage.getItem(
          Object.keys(localStorage).filter((k) => k.match("idToken"))[0]
        ),
      },
    }),
  });
};

export const listFiles = async (config, Bucket) => {
  const s3 = getS3Client(config);

  // List Objects
  const listObjectsCommand = new ListObjectsV2Command({ Bucket, Prefix: "private/" + await getId(config)+"/" });
  const files = await s3.send(listObjectsCommand);
  return files.Contents;
};

export const getDownloadUrl = async (config, Bucket, Key) => {
  const s3 = getS3Client(config);

  // Generate Pre-Signed URL for download
  console.log(Bucket, Key)
  const getObjectCommand = new GetObjectCommand({ Bucket, Key });
  console.log(getObjectCommand)
  const url = await getSignedUrl(s3, getObjectCommand, { expiresIn: 60 * 60 });
  console.log(url)
  return url;
};