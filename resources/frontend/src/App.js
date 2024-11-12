import * as React from "react";

import "@cloudscape-design/global-styles/index.css";
import "./App.css";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { Authenticator, withAuthenticator } from "@aws-amplify/ui-react";
import { uploadData, list } from "aws-amplify/storage";
import "@aws-amplify/ui-react/styles.css";
import AppLayout from "@cloudscape-design/components/app-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FileUpload from "@cloudscape-design/components/file-upload";
import Button from "@cloudscape-design/components/button";
import Form from "@cloudscape-design/components/form";
import Table from "@cloudscape-design/components/table";
import { listFiles, getDownloadUrl } from "./lib/s3helper";

// Default values for local testing
Amplify.configure({
  Auth: {
    Cognito: {
      region: window.config ? window.config.region : "eu-central-1",
      userPoolClientId: window.config
        ? window.config.userPoolClientId
        : "",
      userPoolId: window.config
        ? window.config.userPoolId
        : "",
      identityPoolId: window.config
        ? window.config.identityPoolId
        : "",
      identityPoolRegion: window.config ? window.config.region : "eu-central-1",
    },
  },
  Storage: {
    S3: {
      bucket: window.config
        ? window.config.inputBucket
        : "",
      region: window.config ? window.config.region : "eu-central-1",
    },
  },
});

function App({ signOut, user }) {
  const [files, setFiles] = React.useState([]);
  const [fileList, setFileList] = React.useState([]);
  const handleUpload = async () => {
    try {
      const result = await uploadData({
        key: files[0].name,
        data: files[0],
        options: {
          accessLevel: "private",
        },
      }).result;
      alert("File uploaded successfully.");
      setFiles([]);
    } catch (e) {
      alert("An error occured uploading the file.");
    }
    console.log(user);
  };

  const refreshFiles = async () => {
    console.log(getCurrentUser());
    const result = await listFiles(
      Amplify.getConfig(),
      window.config ? window.config.cleanBucket :
        "",
      "public/" + user.userId + "/"
    );
    console.log(typeof result, result);
    setFileList(result);
  };

  return (
    <AppLayout
      contentType="dashboard"
      navigationHide={true}
      content={
        <ContentLayout header={<Header variant="h1">S3 AV Scanner</Header>}>
          <SpaceBetween size="l">
            <Container
              header={
                <Header
                  variant="h2"
                  description="Upload your files here and they will undergo thorough scanning by multiple antivirus solutions."
                >
                  File Upload
                </Header>
              }
            >
              <form onSubmit={(event) => event.preventDefault()}>
                <Form
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        data-testid="create"
                        variant="primary"
                        disabled={files.length === 0}
                        onClick={handleUpload}
                      >
                        Upload
                      </Button>
                    </SpaceBetween>
                  }
                  errorIconAriaLabel="Error"
                >
                  <FileUpload
                    onChange={({ detail }) => setFiles(detail.value)}
                    value={files}
                    i18nStrings={{
                      uploadButtonText: (e) =>
                        e ? "Choose files" : "Choose file",
                      dropzoneText: (e) =>
                        e ? "Drop files to upload" : "Drop file to upload",
                      removeFileAriaLabel: (e) => `Remove file ${e + 1}`,
                      limitShowFewer: "Show fewer files",
                      limitShowMore: "Show more files",
                      errorIconAriaLabel: "Error",
                    }}
                    showFileLastModified
                    showFileSize
                    showFileThumbnail
                    tokenLimit={3}
                    constraintText="The following characters are not allowed in the file name: ; / \ ? : @ & = + $ , # < > | “ *"
                  />
                </Form>
              </form>
            </Container>
            <Container
              header={
                <Header
                  variant="h2"
                  description="Find you scanned files here, if they are not infected. Scanning may take several minutes."
                >
                  Clean Files
                </Header>
              }
            >
              <Table
                variant="borderless"
                columnDefinitions={[
                  {
                    id: "filename",
                    header: "File Name",
                    cell: (item) => item.Key.match(/\/([^/]+)$/)[1],
                    isRowHeader: true,
                  },
                  {
                    id: "lastmodified",
                    header: "Scanned at",
                    cell: (item) => item.LastModified.toISOString(),
                  },
                  {
                    id: "size",
                    header: "File Size (bytes)",
                    cell: (item) => item.Size,
                  },
                  {
                    id: "actions",
                    header: "Actions",
                    cell: (item) => (
                      <Button
                        onClick={async () => {
                          window.open(
                            await getDownloadUrl(
                              Amplify.getConfig(),
                              window.config ? window.config.cleanBucket : "",
                              item.Key
                            ),
                            "_blank"
                          );
                        }}
                      >
                        Download
                      </Button>
                    ),
                  },
                ]}
                items={fileList}
                loadingText="Loading..."
                sortingDisabled
              />
              <Button onClick={refreshFiles}>Refresh</Button>
            </Container>
          </SpaceBetween>
        </ContentLayout>
      }
    >
      <></>
    </AppLayout>
  );
}

export default withAuthenticator(App);
