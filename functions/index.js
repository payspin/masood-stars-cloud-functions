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

        const {senderName, subject, message, email: recipientEmail, imageUrl} = req.body;

        const color = '#777777';
        const emptyStringColor = '    \n     '
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
                // html: `<p>${message}</p><img src="${imageUrl}" alt="Image"/>`,
                html: `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">

<p style="margin: 30px; color: #777777;">${message}</p>
<div style="padding: 20px; text-align: center; background-color: #f0f0f0;">

    <div style="margin: 20px auto; padding: 20px; background: linear-gradient(to right, #002F72, #A5B4CB); color: white; border-radius: 10px; width: 90%; max-width: 600px;">
        <h2>AI Masaood Stars Awards 2024</h2>
        <p>@ Abu Dhabi, ADNEC, Hall 11</p>
        <p>4:00pm - 9:00pm</p>
        <p>November 11, 2024</p>
        <div style="background-color: #ffffff; color: #000000; padding: 10px; margin-top: 20px; border-radius: 5px;">
            <p><strong>Name: </strong> Eslam Faisal</p>
            <p><strong>Employee Number: </strong> 01067457665</p>
            <div style="text-align: center; margin-top: 10px;">
                <strong>Color code: </strong>
                <span style="display: inline-block; width: 30px; height: 30px; background-color: #002F72; margin-left: 10px;"></span>
            </div>
            <p style="margin-top: 20px;">
                <img src="${imageUrl}"
                     alt="QRCode"/>
            </p>
        </div>
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
