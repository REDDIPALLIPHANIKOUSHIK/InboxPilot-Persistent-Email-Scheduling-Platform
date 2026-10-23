import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;
let etherealUser = env.ETHEREAL_USER;
let etherealPassword = env.ETHEREAL_PASSWORD;

export async function getMailerTransporter(): Promise<Transporter> {
  if (transporter) {
    return transporter;
  }

  // If credentials are not provided in environment, automatically create an Ethereal test account
  if (!etherealUser || !etherealPassword) {
    logger.info('No Ethereal SMTP credentials provided in environment. Creating an ephemeral Ethereal test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      etherealUser = testAccount.user;
      etherealPassword = testAccount.pass;
      logger.info(`✅ Ephemeral Ethereal test account generated: ${testAccount.user}`);
    } catch (err: any) {
      logger.error('Failed to create ephemeral Ethereal test account:', err.message);
      throw err;
    }
  }

  transporter = nodemailer.createTransport({
    host: env.ETHEREAL_HOST,
    port: env.ETHEREAL_PORT,
    secure: env.ETHEREAL_PORT === 465,
    auth: {
      user: etherealUser,
      pass: etherealPassword,
    },
  });

  try {
    await transporter.verify();
    logger.info(`✅ Nodemailer connected and verified with Ethereal SMTP server (${env.ETHEREAL_HOST})`);
  } catch (err: any) {
    logger.warn(`Could not verify Ethereal SMTP connection on startup: ${err.message}. Sending will retry on demand.`);
  }

  return transporter;
}

export interface SendMailOptions {
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmailViaEthereal(options: SendMailOptions): Promise<SendMailResult> {
  const mailTransporter = await getMailerTransporter();

  // Support sender identity by setting friendly name and from email
  const fromFormatted = `"${options.fromName.replace(/"/g, '')}" <${etherealUser || options.fromEmail}>`;

  const info = await mailTransporter.sendMail({
    from: fromFormatted,
    replyTo: options.fromEmail,
    to: options.toEmail,
    subject: options.subject,
    text: options.body,
    html: options.body.replace(/\n/g, '<br/>'),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
