import nodemailer from 'nodemailer';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { addLog, initDB } from './db.js';
import webpush from 'web-push';

dotenv.config();

// Telegram Setup
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot: TelegramBot | null = null;
if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

// Email Setup
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;

let transporter: nodemailer.Transporter | null = null;
if (EMAIL_HOST && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

export async function sendNotification(message: string) {
  if (!message) return;

  // Send via Telegram
  if (bot && TELEGRAM_CHAT_ID) {
    try {
      await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
      addLog('NOTIFICATION', 'Telegram message sent successfully');
    } catch (error: any) {
      console.error('Failed to send Telegram message:', error);
      addLog('ERROR', 'Failed to send Telegram message', error.message);
    }
  }

  // Send via Email
  if (transporter && EMAIL_TO) {
    try {
      await transporter.sendMail({
        from: `"JEE Main Tracker" <${EMAIL_USER}>`,
        to: EMAIL_TO,
        subject: '🚨 JEE Main Update Detected!',
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      addLog('NOTIFICATION', 'Email sent successfully');
    } catch (error: any) {
      console.error('Failed to send Email:', error);
      addLog('ERROR', 'Failed to send Email', error.message);
    }
  }

  // Send Web Push Notifications
  try {
    const db = initDB();
    const subscriptions = db.prepare('SELECT * FROM subscriptions').all() as any[];
    
    if (subscriptions.length > 0) {
      const payload = JSON.stringify({
        title: 'JEE Main Tracker Update',
        body: message.replace(/\*/g, ''), // Strip markdown for push notification
        icon: '/vite.svg'
      });

      let successCount = 0;
      let failCount = 0;

      for (const sub of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: JSON.parse(sub.keys)
          };
          await webpush.sendNotification(pushSubscription, payload);
          successCount++;
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription has expired or is no longer valid
            db.prepare('DELETE FROM subscriptions WHERE id = ?').run(sub.id);
          }
          failCount++;
        }
      }
      
      if (successCount > 0) {
        addLog('NOTIFICATION', `Web push sent to ${successCount} devices`);
      }
    }
  } catch (error: any) {
    console.error('Failed to send Web Push:', error);
    addLog('ERROR', 'Failed to send Web Push', error.message);
  }
}
