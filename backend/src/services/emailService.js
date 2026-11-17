import nodemailer from 'nodemailer';

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD && process.env.SMTP_FROM &&
    !process.env.SMTP_USER.startsWith('your-') && !process.env.SMTP_APP_PASSWORD.startsWith('your-'));
}

export async function sendEmail({ to, subject, text }) {
  if (!isEmailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
