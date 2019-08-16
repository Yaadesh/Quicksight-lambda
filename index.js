const AWS = require('aws-sdk');
const fs = require('fs')
AWS.config.update({
    region: 'us-east-1'
});

const sts = new AWS.STS();
const createResponse = (statusCode, bodyContent) => ({
    statusCode,
    body: JSON.stringify(bodyContent)
});

exports.handler = (event, context, callback) => {

    /* Here, we are getting the user name as RoleSessionName and dashboardId from Lambda event parameters */
    let roleSessionName, dashboardId;
    if (event.body !== null && event.body !== undefined) {
        roleSessionName = event.body.roleSessionName;
        dashboardId = event.body.dashboardId;
    }
    if (!roleSessionName || !dashboardId) {
        console.log('Error, missing roleSessionName or dashboardId', JSON.stringify(event));
        return callback(null, createResponse(500, 'Missing roleSessionName or dashboardId'));
    }
    const stsParams = {
        RoleArn: 'arn:aws:iam::<YOUR_ACCT_ID>:role/QuicksightEmbedRole',
        RoleSessionName: roleSessionName
    };


    /* Assuming the role 'QuicksightEmbedRole' with session name set to username of the READER */
    sts.assumeRole(stsParams, (err, data) => {
        if (err) {
            console.log(err, err.stack, JSON.stringify(stsParams));
            callback(null, createResponse(500, 'Error Assuming Role'));
        } else {
            console.log("Data:", JSON.stringify(data))
            const {
                AccessKeyId,
                SecretAccessKey,
                SessionToken
            } = data.Credentials;

            AWS.config.update({
                accessKeyId: AccessKeyId,
                secretAccessKey: SecretAccessKey,
                sessionToken: SessionToken,
                region: 'eu-west-1'
            }); // Region of the dashboard

            const quickSight = new AWS.QuickSight();

            const quickSightParams = {
                AwsAccountId: '<YOUR_ACCT_ID>',
                DashboardId: dashboardId,
                IdentityType: 'IAM',
            };

            /* Calling the API to get Embed URL for the dashboard */

            quickSight.getDashboardEmbedUrl(quickSightParams, (err, data) => {
                if (err) {
                    console.log(err, err.stack);
                    callback(null, createResponse(500, 'Error Requesting Dashboard'));
                } else {
                    var EmbedUrl = data.EmbedUrl;
                    console.log('EmbedUrlData', JSON.stringify(data))

                    const s3 = new AWS.S3();

                    /* Deleting previous version of the object*/
                    const deleteObjectParams = {
                        Bucket: '<YOUR_BUCKET_NAME>',
                        Key: 'index.html'
                    };

                    s3.deleteObject(deleteObjectParams, (err, data) => {
                        if (err) console.log(err, err.stack)
                        else {
                            console.log('File deleted succesfully!')
                            fs.readFile(__dirname + '/embed_html.html', function (err, data) {
                                if (data) {
                                    var new_file = data.toString().replace(/(https:\/\/){1}[\S]+(%3D%3D){1}/gi, EmbedUrl);

                                    /*Uploading new version with updated URL*/

                                    const PutObjectParams = {
                                        Body: new_file,
                                        Bucket: "<YOUR_BUCKET_NAME>",
                                        Key: "index.html",
                                        ContentType: "text/html",
                                        ACL: "public-read"
                                    }

                                    s3.putObject(PutObjectParams, (err, data) => {
                                        if (err) {
                                            callback(null, err, err.stack)
                                        } else {
                                            console.log('File uploaded succesfully!')

                                            callback(null, createResponse(200, 'File uploaded succesfully!'))
                                        }

                                    })
                                }

                            });
                        }

                    });


                }
            })

        }
    })
};
