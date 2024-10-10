const {onRequest} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const cors = require('cors');
const nodemailer = require('nodemailer');

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

        const {senderName, subject, message, email: recipientEmail, imageUrl, employeeNumber, userName, colorCode} = req.body;

        // Validate required fields
        if (!senderName || !subject || !message || !recipientEmail || !imageUrl) {
            res.status(400).send('Bad Request: Missing senderName, subject, message, email, or imageUrl.');
            return;
        }

        try {
            // Set up mail options with the image URL embedded in the HTML
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
    <h2>Masaood Stars Awards 2024</h2>
    <p>@ Abu Dhabi, ADNEC, Hall 11</p>
    <p>3:00pm - 9:00pm</p>
    <p>November 10, 2024</p>
    <div style="background-color: #ffffff; color: #000000; padding: 10px; margin-top: 20px; border-radius: 5px;">
        <p><strong>Name: </strong>${userName}</p>
        <p><strong>Employee Number: </strong> ${employeeNumber}</p>
        <div style="text-align: center; margin-top: 10px;">
            <strong  style="margin-bottom: 10px;">Color code: </strong>
            <span style="display: inline-block; width: 30px; height: 30px; background-color: ${colorCode}; margin-left: 10px; margin-bottom: -10px;"></span>
        </div>
        <p style="margin-top: 20px;">
            <img src="${imageUrl}"
                 alt="QRCode"/>
        </p>
    </div>
</div>
</body>
</html>`,
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
