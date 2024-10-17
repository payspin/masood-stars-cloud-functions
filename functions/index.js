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
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase app
initializeApp();

// Use CORS
const corsHandler = cors({origin: true});

// Gmail credentials
const gmailEmail = 'noreply@masaoodstarsevent.com';
const gmailPassword = 'vbwj vjhr wmor wkpo';

// Create a transporter object using nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    auth: {
        user: gmailEmail,
        pass: gmailPassword,
    },
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

            // Upload QR code image and PDF to Firebase Storage
            const bucket = getStorage().bucket();
            const randomToken = uuidv4();  // Generate a random token

            const [file] = await bucket.upload(qrCodeFilePath, {
                destination: `qrCodes/${recipientEmail}_qrcode.png`,
                metadata: {
                    contentType: 'image/png',
                    metadata: {
                        firebaseStorageDownloadTokens: randomToken,  // Attach random token to the file
                    },
                },
                predefinedAcl: 'publicRead',  // Make the file publicly readable
            });

            https://firebasestorage.googleapis.com/v0/b/oozf-aaff4.appspot.com/o/qrCodes%2Feslamfaisal423%40gmail.com_qrcode.png?alt=media&token=c5d5dc43-22ba-4a00-96bc-839006eb7b55
            // Construct the public URL with the token
            const qrCodeUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${randomToken}`;

            // Get Firestore instance
            const db = getFirestore();

            // Query user document by email
            const userSnapshot = await db.collection('users').where('email', '==', recipientEmail).get();
            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                await userDoc.ref.update({ qrCodeUrl: qrCodeUrl });
            }

            // Set up mail options with the QR code attached and embedded in HTML
            const mailOptions = {
                from: `${senderName} <${gmailEmail}>`,
                to: recipientEmail,
                subject: subject,
                html: `<html lang="en">
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
    <p>Sunday 10 November 2024</p>
    <div style="background-color: #ffffff; color: #000000; padding: 10px; margin-top: 20px; border-radius: 5px;">
        <p><strong>Name: </strong>${userName}</p>
        <p style="margin-top: 20px;">
            <img src="cid:qrcode" alt="QRCode"/>
        </p>
    </div>
</div>
</body>
</html>`,
                attachments: [
                    {
                        filename: 'qrcode.png',
                        content: qrCodeBuffer,
                        cid: 'qrcode', // same cid as in the HTML content above
                    },
                ],
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
