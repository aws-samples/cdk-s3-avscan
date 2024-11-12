import { S3Client, GetObjectTaggingCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const handler = async (event) => {
  // Extract S3 bucket and key from the event
  const { bucket, object } = event.Records[0].s3;
  const key = decodeURI(object.key.replace("+","%20")).replace("%3A",":")

  // Create an S3 client
  const s3Client = new S3Client();

  // Prepare the parameters for the GetObjectTaggingCommand
  const params = {
    Bucket: bucket.name,
    Key: key,
  };
  console.log("Start processing object:",params);

  // Call the GetObjectTaggingCommand to retrieve tags
  const command = new GetObjectTaggingCommand(params);
  const response = await s3Client.send(command);

  // Extract and log the tags
  const tags = response.TagSet.map((tag) => ({ [tag.Key]: tag.Value }));
  console.log(tags);

  // Check if all scans are complete and determine result
  let result = "CLEAN";
  let resultCount = 0;
  const prefixesToCheck = process.env.PREFIXES.split(",");
  for (const prefix of prefixesToCheck) {
    // Check if the tags for this scanner exist and if the result is clean
    const scanCompleted =
      tags.find(
        (obj) =>
          obj.hasOwnProperty(prefix + "_STATUS") &&
          obj[prefix + "_STATUS"] == "COMPLETED"
      ) !== undefined;
    const isClean =
      tags.find(
        (obj) =>
          obj.hasOwnProperty(prefix + "_RESULT") &&
          obj[prefix + "_RESULT"] == "CLEAN"
      ) !== undefined;

    // Evaluate the results
    if (scanCompleted) resultCount += 1;
    if (scanCompleted && !isClean) result = "INFECTED";
  }

  // If all scans are completed, copy the object to the target bucket based on the scan result
  if (resultCount == prefixesToCheck.length) {
    let copyTarget;
    if (result == "CLEAN") copyTarget = process.env.CLEAN_BUCKET;
    if (result == "INFECTED") copyTarget = process.env.DIRTY_BUCKET;
    const copyParams = {
      Bucket: copyTarget,
      CopySource: `/${bucket.name}/${key}`,
      Key: key,
    };
    await s3Client.send(new CopyObjectCommand(copyParams));
    console.log("Copied object to " + copyTarget);
    // Remove Object from Input Bucket
    const deleteParams = {
        Bucket: bucket.name,
        Key: key,
    }
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    console.log("Delete object from input bucket.");
  } else {
    console.log("Not all scans completed");
  }
};
