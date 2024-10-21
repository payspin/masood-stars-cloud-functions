const {initializeApp} = require('firebase-admin/app');
const {onRequest} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const cors = require('cors');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const {writeFileSync} = require('fs');
const path = require("path");
const {getStorage} = require("firebase-admin/storage");
const {getFirestore} = require("firebase-admin/firestore");
const {v4: uuidv4} = require('uuid');
const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');
// Initialize Firebase app
initializeApp();

// Use CORS
const corsHandler = cors({origin: true});

// Upload QR code image and PDF to Firebase Storage
const bucket = getStorage().bucket();
// Get Firestore instance
const db = getFirestore();

// Gmail credentials
const gmailEmail = 'noreply@masaoodstarsevent.com';
const gmailPassword = 'vbwj vjhr wmor wkpo';

// Create a transporter object using nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', host: 'smtp.gmail.com', port: 465, auth: {
        user: gmailEmail, pass: gmailPassword,
    },
});

exports.sendCancelationEmail = onRequest(async (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const {senderName, subject, message, email: recipientEmail} = req.body;

        // Validate required fields
        if (!senderName || !subject || !message || !recipientEmail) {
            res.status(400).send('Bad Request: Missing senderName, subject, message, email.');
            return;
        }

        try {

            // Set up mail options with the QR code attached and embedded in HTML
            const mailOptions = {
                from: `${senderName} <${gmailEmail}>`,
                to: recipientEmail,
                subject: subject,
                html: '<p>' + message + '</p>'
            };

            // Send the email
            await transporter.sendMail(mailOptions);
            logger.info('Email sent successfully.');

            // Respond with success message and PDF URL
            res.status(200).send({
                message: 'Cancelation Email sent successfully',
            });

        } catch (error) {
            logger.error('Error sending email or generating PDF:', error);
            res.status(500).send('Error sending email or generating PDF');
        }
    });
});

exports.sendEmails = onRequest((req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const {senderName, subject, message, email: recipientEmail, userName} = req.body;

        // Validate required fields
        if (!senderName || !subject || !message || !recipientEmail) {
            res.status(400).send('Bad Request: Missing senderName, subject, message, or email.');
            return;
        }

        try {
            // Generate QR code from the recipient email
            const qrCodeDataURL = await QRCode.toDataURL(recipientEmail);

            // Convert base64 QR code to buffer for attachment
            const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

            // Save the QR code image to local filesystem as a PNG
            const qrCodeFilePath = path.join('/tmp', 'qrcode.png');
            writeFileSync(qrCodeFilePath, qrCodeBuffer);

            const randomToken = uuidv4();  // Generate a random token

            const [file] = await bucket.upload(qrCodeFilePath, {
                destination: `qrCodes/${recipientEmail}_qrcode.png`, metadata: {
                    contentType: 'image/png', metadata: {
                        firebaseStorageDownloadTokens: randomToken,  // Attach random token to the file
                    },
                }, predefinedAcl: 'publicRead',  // Make the file publicly readable
            });

            // Construct the public URL with the token
            const qrCodeUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${randomToken}`;


            // Query user document by email
            const userSnapshot = await db.collection('users').where('email', '==', recipientEmail).get();
            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                await userDoc.ref.update({qrCodeUrl: qrCodeUrl});
            }

            // Set up mail options with the QR code attached and embedded in HTML
            const mailOptions = {
                from: `${senderName} <${gmailEmail}>`, to: recipientEmail, subject: subject, html: `<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Event Invitation</title>
</head>
<body style="margin:16px auto; font-family: Arial, sans-serif;">

<p style="margin: 16px; color: #777777;">${message}</p>
<div style="padding: 36px; text-align: center; background: url('https://masaoodnas.com/video/bgimage.jpg') no-repeat center center; background-size: cover; color: white; border-radius: 10px; width: 90%; max-width: 600px;">
    <h2>Masaood Stars Awards</h2>
    <p>@ Abu Dhabi, ADNEC, Hall 11, Parking B</p>
    <p>Doors open at 2:15pm, Program Starts at 3:00pm</p>
    <p>Dress code: Smart Business and Modest.</p>
    <p>Sunday 10 November 2024</p>
    <div style="background-color: #ffffff; color: #000000; padding: 10px; margin-top: 20px; border-radius: 5px;">
        <p><strong>Name: </strong>${userName}</p>
        <p style="margin-top: 20px;">
            <img src="cid:qrcode" alt="QRCode"/>
        </p>
    </div>
</div>
</body>
</html>`, attachments: [{
                    filename: 'qrcode.png', content: qrCodeBuffer, cid: 'qrcode', // same cid as in the HTML content above
                },],
            };

            // Send the email
            await transporter.sendMail(mailOptions);
            logger.info('Email sent successfully.');
            res.status(200).send('Email sent successfully!');
        } catch (error) {
            logger.error('Error sending email:', error);
            res.status(500).send('Error sending email');
        }
    });
});

exports.convertHtmlToPdf = onRequest({
    memory: '512MiB',  // Increase memory limit to 512MiB or more
    timeoutSeconds: 120,  // Increase the timeout if needed
}, async (req, res) => {
    corsHandler(req, res, async () => {
        const {email, message, userName} = req.body;

        if (!email || !message || !userName) {
            return res.status(400).send("Missing required parameters: email, message, or userName");
        }

        try {
            // Generate QR code from the email
            const qrCodeDataURL = await QRCode.toDataURL(email);

            // Convert base64 QR code to buffer for attachment
            const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

            // Save the QR code image to local filesystem as a PNG
            const qrCodeFilePath = path.join('/tmp', 'qrcode.png');
            writeFileSync(qrCodeFilePath, qrCodeBuffer);

            const qrCodeToken = uuidv4();  // Generate a random token for QR code

            const [qrCodeFile] = await bucket.upload(qrCodeFilePath, {
                destination: `qrCodes/${email}_qrcode.png`, metadata: {
                    contentType: 'image/png', metadata: {
                        firebaseStorageDownloadTokens: qrCodeToken,  // Attach random token to the file
                    },
                }, predefinedAcl: 'publicRead',  // Make the file publicly readable
            });

            // Construct the public URL for QR code
            const qrCodeUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(qrCodeFile.name)}?alt=media&token=${qrCodeToken}`;

            // Generate the PDF buffer using Puppeteer
            const htmlContent = `<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Event Invitation</title>
</head>
<body style="margin:16px auto; font-family: Arial, sans-serif;">
<p style="margin: 16px; color: #777777;">${message}</p>
<div style="padding: 36px; text-align: center; background: url('https://firebasestorage.googleapis.com/v0/b/oozf-aaff4.appspot.com/o/WhatsApp%20Image%202024-10-07%20at%2023.13.18_32ed0e9b.jpg?alt=media&token=bcf9f30b-f443-4b44-afb9-5907b4d1e019') no-repeat center center; background-size: cover; color: white; border-radius: 10px; width: 90%; max-width: 600px;">
    <h2>Masaood Stars Awards</h2>
    <p>@ Abu Dhabi, ADNEC, Hall 11, Parking B</p>
    <p>Doors open at 2:15pm, Program starts at 3:00pm</p>
    <p>Dress code: Smart Business and Modest.</p>
    <p>Sunday 10 November 2024</p>
    <div style="background-color: #ffffff; color: #000000; padding: 10px; margin-top: 20px; border-radius: 5px;">
        <p><strong>Name: </strong>${userName}</p>
        <p style="margin-top: 20px;">
            <img src="${qrCodeDataURL}" alt="QRCode"/>
        </p>
    </div>
</div>
</body>
</html>`;

            // Launch Puppeteer using chrome-aws-lambda
            const browser = await puppeteer.launch({
                args: chrome.args, executablePath: await chrome.executablePath, headless: chrome.headless,
            });

            const page = await browser.newPage();

            // Set the HTML content for the PDF
            await page.setContent(htmlContent, {waitUntil: 'networkidle0'});

            // Generate the PDF as a buffer
            const pdfBuffer = await page.pdf({
                width: '19cm',     // Fixed width (A4 width)
                height: '19cm',    // Fixed height (A4 height)
                printBackground: true, margin: {
                    top: '1cm', right: '1cm', bottom: '1cm', left: '1cm',
                },
            });

            await browser.close();

            // Save the PDF to the local filesystem
            const pdfFilePath = path.join('/tmp', `${email}_invitation.pdf`);
            writeFileSync(pdfFilePath, pdfBuffer);

            // Upload the PDF to Firebase Storage
            const pdfToken = uuidv4();  // Generate a random token for the PDF file
            const [pdfFile] = await bucket.upload(pdfFilePath, {
                destination: `pdfs/${email}_invitation.pdf`, metadata: {
                    contentType: 'application/pdf', metadata: {
                        firebaseStorageDownloadTokens: pdfToken,  // Attach random token to the file
                    },
                }, predefinedAcl: 'publicRead',  // Make the file publicly readable
            });

            // Construct the public URL for the PDF
            const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pdfFile.name)}?alt=media&token=${pdfToken}`;

            // Query user document by email and update Firestore with the PDF URL
            const userSnapshot = await db.collection('users').where('email', '==', email).get();
            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                await userDoc.ref.update({
                    qrCodeUrl: qrCodeUrl,     // Update QR code URL
                    emailPdfUrl: pdfUrl,      // Save the PDF URL
                });
            }

            // Respond with success message and PDF URL
            res.status(200).send({
                message: 'PDF and QR code successfully generated and saved to Firestore',
                pdfUrl: pdfUrl,
                qrCodeUrl: qrCodeUrl,
            });

        } catch (error) {
            console.error('Error generating or uploading PDF', error);
            res.status(500).send('Failed to convert HTML to PDF and upload it');
        }
    });
});

