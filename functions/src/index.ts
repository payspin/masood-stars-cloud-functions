import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import cors from "cors";
import nodemailer from "nodemailer";
import { Request, Response } from "express";

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

exports.sendEmails = onRequest((req: Request, res: Response) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const mailOptions = {
        from: `Your Name <${gmailEmail}>`,
        to: 'eslamfaisal423@gmail.com', // Dynamic recipient email
        subject: "title",
        html: `<p>${'message'}</p>`,
      };

      await transporter.sendMail(mailOptions);
      logger.info("Email sent successfully.");
      res.status(200).send('Email sent successfully!');
    } catch (error) {
      logger.error('Error sending email:', error);
      res.status(500).send('Error sending email');
    }
  });
});
