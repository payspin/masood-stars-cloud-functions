const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const cors = require('cors');
const nodemailer = require('nodemailer');

// Use CORS
const corsHandler = cors({ origin: true });

// Gmail credentials
const gmailEmail = 'eslam.faisal.ef@gmail.com';
const gmailPassword = 'bbwl hzbv locf qzbk';

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

        const { senderName, subject, message, email: recipientEmail, imageUrl } = req.body;

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
                html: `<p>${message}</p><img src="${imageUrl}" alt="Image"/>`,
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
