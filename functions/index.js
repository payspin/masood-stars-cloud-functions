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


exports.sendCancelationEmail = onRequest({
    memory: '1GiB',  // Increase the memory if needed
    timeoutSeconds: 500,  // Increase the timeout if needed
}, async (req, res) => {
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

exports.reGenerateEmails = onRequest({
    memory: '8GiB',  // Increase the memory if needed
    timeoutSeconds: 3600,  // Increase the timeout if needed
}, async (req, res) => {
    corsHandler(req, res, async () => {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            console.log('No users found.');
            return res.status(200).send('No users found.');
        }

        var eMailsSend = 0;
        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const {email, display_name, emailPdfUrl, qrCodeUrl} = userData;

            if (!emailPdfUrl || !qrCodeUrl) {
                const message = 'Thank you for signing up to attend our upcoming Masaood Stars Ceremony & Union Day Celebration. The event is taking place on Sunday 10 November 2024 at ADNEC, Hall 11. Use Parking B. Doors open at 2:15pm and the show starts at 3:00pm sharp until 8:00pm. Food will be served at 5:00pm. This event is for Al Masaood Employees ONLY. Family & friends will not be permitted. Please show your QR code at the door.';

                await convertHtmlToPdf(email, message, display_name);

                logger.info('Email sent successfully.' + email);
                console.info('Email sent successfully.' + email);
                eMailsSend = eMailsSend + 1;
            }
        }
        if (eMailsSend === 0) {
            return res.status(200).send('No emails sent.');
        }
       return res.status(200).send(eMailsSend);
    });
});

exports.sendEmails = onRequest({
    memory: '1GiB',  // Increase the memory if needed
    timeoutSeconds: 500,  // Increase the timeout if needed
}, async (req, res) => {
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

            const emailBuffer = await curveImageBuffer(await convertHtmlToPNGBuffer(recipientEmail, message, userName));

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
 <img src="cid:email" alt="email"/>
</body>
</html>`, attachments: [{
                    filename: 'email.jpg', content: emailBuffer, cid: 'email',
                },],
            };

            // Send the email
            await transporter.sendMail(mailOptions);
            logger.info('Email sent successfully.');
            await convertHtmlToPdf(recipientEmail, message, userName);
            res.status(200).send('Email sent successfully!');
        } catch (error) {
            logger.error('Error sending email:', error);
            res.status(500).send('Error sending email');
        }
    });
});

async function convertHtmlToPdf(email, message, userName) {
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
    <p>Abu Dhabi, ADNEC, Hall 11, Parking B</p>
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
    } catch (error) {
        console.error('Error generating or uploading PDF', error);
    }
}

async function convertHtmlToPNGBuffer(email, message, userName) {
    try {
        // Generate QR code from the email
        const qrCodeDataURL = await QRCode.toDataURL(email);

        // Generate the HTML content
        const htmlContent = `<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Event Invitation</title>
</head>
<body style="font-family: Arial, sans-serif;   border-radius: 10px;  background: url('https://firebasestorage.googleapis.com/v0/b/oozf-aaff4.appspot.com/o/WhatsApp%20Image%202024-10-07%20at%2023.13.18_32ed0e9b.jpg?alt=media&token=bcf9f30b-f443-4b44-afb9-5907b4d1e019') no-repeat center center; background-size: cover; ">
<div style="padding: 5%; text-align: center; color: white;">
    <h2>Masaood Stars Awards</h2>
    <p>Abu Dhabi, ADNEC, Hall 11, Parking B</p>
    <p>Doors open at 2:15pm, Program starts at 3:00pm</p>
    <p>Dress code: Smart Business and Modest.</p>
    <p>Sunday 10 November 2024</p>
    <div style="background-color: #ffffff; color: #000000; padding: 10px; margin: 20px 50px;border-radius: 5px;">
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
        await page.setViewport({width: 550, height: 520, deviceScaleFactor: 1,});
        // Set the HTML content for the PNG
        await page.setContent(htmlContent, {waitUntil: 'networkidle0'});

        // Capture the screenshot as a buffer
        const pngBuffer = await page.screenshot({
            fullPage: false, type: 'png',
        });

        await browser.close();

        return pngBuffer;
    } catch (error) {
        console.error('Error generating or uploading PNG', error);
    }
}

const sharp = require('sharp');

async function curveImageBuffer(imageBuffer) {
    const {width, height} = await sharp(imageBuffer).metadata(); // Get image dimensions

    // Create a rounded rectangle SVG mask with 10px radius
    const roundedCorners = Buffer.from(`
    <svg>
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" ry="10"/>
    </svg>
  `);

    // Apply the rounded corners mask using sharp
     // Return as buffer
    return await sharp(imageBuffer)
        .composite([{
            input: roundedCorners, blend: 'dest-in'
        }])
        .toBuffer();
}

const {onDocumentCreated} = require('firebase-functions/v2/firestore');
exports.checkUserCountAndAddItem = onDocumentCreated('users/{docId}', async (event) => {
    try {
        // Get the count of documents in the users collection
        const usersSnapshot = await db.collection('users').get();
        const userCount = usersSnapshot.size;

        logger.info('userCount = ' + userCount);
        if (userCount >= 1310) {
            // Delete the new item if user count is 1310
            await db.collection('users').doc(event.data.id).delete().then(() => {
                logger.info('New item deleted because user count is.' + userCount);
            });
            logger.info('New item deleted because user count is 1310.');
        } else {
            logger.info('New item added because user count is less than 1310.');
        }
    } catch (error) {
        logger.error('Error checking user count or deleting new item:', error);
    }
});

exports.checTestCollection = onDocumentCreated('testCollection/{docId}', async (event) => {
    try {
        // Get the count of documents in the users collection
        const usersSnapshot = await db.collection('testCollection').get();
        const userCount = usersSnapshot.size;
        logger.info('New item id = .' + event.data.id);
        if (userCount >= 3) {
            // Delete the new item if user count is 1310
            await db.collection('testCollection').doc(event.data.id).delete().then(() => {
                logger.info('New item deleted because user count is.' + userCount);
            });
        } else {
            logger.info('New item added because user count is less than.' + userCount);
        }
    } catch (error) {
        logger.error('Error checking user count or deleting new item:', error);
    }
});