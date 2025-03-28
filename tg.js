const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const async = require('async');
const _ = require('lodash');

// Replace with your actual Telegram Bot Token from @BotFather
const token = '7561346569:AAFdpDvGuXd2NCWLGfqDimK5LCWqTkdwSWA';
const bot = new TelegramBot(token, { polling: true });

// Bot state management and persistence
const userStates = new Map();
const STATE_FILE = 'bot_state.json';

// Updated banner design (Telegram-supported Markdown and emojis)
const banner = `
*┌──────────────────────────────┐*
*│     TELEGRAM BLAST BOT      │*
*├──────────────────────────────┤*
│  🚀 Unleash Email Power     │
│  📱 via Telegram Control    │
*└──────────────────────────────┘*
       _Created by root (@rootbck)_
`;

// Persistence functions
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    for (const [key, value] of Object.entries(state)) {
      userStates.set(key, value);
    }
  } catch (error) {
    console.log('Starting with fresh state');
  }
}

async function saveState() {
  try {
    const state = Object.fromEntries(userStates);
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving state:', error.message);
  }
}

// Convert HTML to plain text
function htmlToPlainText(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Load SendGrid API key
async function loadSendGridKey() {
  try {
    const key = (await fs.readFile('sendgrid.txt', 'utf-8')).trim();
    sgMail.setApiKey(key);
    return key;
  } catch (error) {
    throw new Error(`Failed to load SendGrid key: ${error.message}`);
  }
}

// Load custom SMTP configs
async function loadCustomSMTP() {
  try {
    const lines = (await fs.readFile('customsmtp.txt', 'utf-8')).split('\n').filter(Boolean);
    return lines.map((line) => {
      const [host, port, user, pass] = line.split('|');
      return { host, port: parseInt(port), user, pass };
    });
  } catch (error) {
    throw new Error(`Failed to load SMTP configs: ${error.message}`);
  }
}

// Load templates
async function loadTemplates() {
  try {
    const templateDir = path.join(__dirname, 'templates');
    const files = await fs.readdir(templateDir);
    const templates = {};
    for (const file of files) {
      if (file.endsWith('.html')) {
        const name = file.replace('.html', '');
        templates[name] = await fs.readFile(path.join(templateDir, file), 'utf-8');
      }
    }
    return templates;
  } catch (error) {
    throw new Error(`Failed to load templates: ${error.message}`);
  }
}

// Load attachments
async function loadAttachments() {
  try {
    const attachmentDir = path.join(__dirname, 'attachments');
    const files = await fs.readdir(attachmentDir);
    return await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(path.join(attachmentDir, file), { encoding: 'base64' });
        return { filename: file, content };
      })
    );
  } catch (error) {
    throw new Error(`Failed to load attachments: ${error.message}`);
  }
}

// Load placeholders
async function loadPlaceholders() {
  try {
    const lines = (await fs.readFile('placeholders.txt', 'utf-8')).split('\n').filter(Boolean);
    return lines.reduce((acc, line) => {
      const [key, value] = line.split(':');
      acc[key] = (recipient) => {
        const [path, fallback] = value.split('||');
        try {
          if (path === "email.split('@')[1]") {
            return recipient.email.split('@')[1] || fallback || path;
          }
          return _.get(recipient, path, fallback) || eval(path) || path;
        } catch (e) {
          return fallback || path;
        }
      };
      return acc;
    }, {});
  } catch (error) {
    throw new Error(`Failed to load placeholders: ${error.message}`);
  }
}

// Generic list loader
async function loadList(file, name) {
  try {
    return (await fs.readFile(file, 'utf-8')).split('\n').filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to load ${name}: ${error.message}`);
  }
}

// Load from names
async function loadFromNames() {
  return await loadList('fromname.txt', 'from names');
}

// Load recipients
async function loadRecipients() {
  try {
    const lines = await loadList('recipient.txt', 'recipients');
    return lines.map((line) => {
      const [email, firstName, lastName, company] = line.split(',');
      return { email, firstName, lastName, company };
    });
  } catch (error) {
    throw error;
  }
}

// Replace placeholders
function replacePlaceholders(text, recipient, placeholders, isFilename = false) {
  let result = Object.keys(placeholders).reduce((res, key) => {
    const regex = new RegExp(`\\[${key}\\]`, 'g');
    return res.replace(regex, placeholders[key](recipient));
  }, text);
  if (isFilename) {
    result = result.replace(/[\r\n]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  }
  return result;
}

// Check spam triggers
function checkSpamTriggers(content, spamKeywords) {
  const lowerContent = content.toLowerCase();
  const triggers = spamKeywords.filter((keyword) => lowerContent.includes(keyword));
  return {
    hasTriggers: triggers.length > 0,
    triggers,
    score: triggers.length * 10,
  };
}

// Send email via SendGrid
async function sendDirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, attachments) {
  const htmlContent = replacePlaceholders(template, recipient, placeholders);
  const plainTextContent = htmlToPlainText(htmlContent);
  const spamCheck = checkSpamTriggers(htmlContent, spamKeywords);

  if (spamCheck.hasTriggers && !config.testMode) {
    return { status: 'skipped', reason: 'spam triggers' };
  }

  const msg = {
    to: recipient.email,
    from: { email: fromEmail, name: fromName },
    subject: replacePlaceholders(subject, recipient, placeholders),
    text: plainTextContent,
    html: htmlContent,
  };

  if (config.useAttachments && attachments.length > 0) {
    msg.attachments = attachments.map((att) => ({
      content: att.content,
      filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
    }));
  }

  if (config.testMode) {
    return { status: 'test', msg };
  }

  try {
    const response = await sgMail.send(msg);
    return { status: 'success', response };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

// Send email via SMTP
async function sendIndirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, smtpConfig, attachments) {
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });

  const htmlContent = replacePlaceholders(template, recipient, placeholders);
  const plainTextContent = htmlToPlainText(htmlContent);
  const spamCheck = checkSpamTriggers(htmlContent, spamKeywords);

  if (spamCheck.hasTriggers && !config.testMode) {
    return { status: 'skipped', reason: 'spam triggers' };
  }

  const msg = {
    to: recipient.email,
    from: `${fromName} <${fromEmail}>`,
    subject: replacePlaceholders(subject, recipient, placeholders),
    text: plainTextContent,
    html: htmlContent,
  };

  if (config.useAttachments && attachments.length > 0) {
    msg.attachments = attachments.map((att) => ({
      content: Buffer.from(att.content, 'base64'),
      filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
    }));
  }

  if (config.testMode) {
    return { status: 'test', msg };
  }

  try {
    const info = await transporter.sendMail(msg);
    return { status: 'success', info };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

// Get config from user
async function getConfigFromUser(chatId) {
  const config = {};
  
  await bot.sendMessage(chatId, "Let's configure your email campaign:");
  
  await bot.sendMessage(chatId, "Choose sending method:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "SendGrid", callback_data: "method_direct" }],
        [{ text: "Custom SMTP", callback_data: "method_indirect" }]
      ]
    }
  });
  
  return new Promise((resolve) => {
    userStates.set(chatId, { step: 'method', config });
    saveState();
    
    bot.once('callback_query', async (query) => {
      if (query.message.chat.id !== chatId) return;
      
      config.method = query.data === 'method_direct' ? 'direct' : 'indirect';
      await bot.answerCallbackQuery(query.id);
      
      const questions = [
        { key: 'maxThreads', text: 'Enter number of threads (default 10):', default: 10, type: 'number' },
        { key: 'coolingTime', text: 'Enter cooling time in ms (default 1000):', default: 1000, type: 'number' },
        { key: 'rateLimit', text: 'Enter rate limit (emails/min, default 100):', default: 100, type: 'number' },
        { key: 'testMode', text: 'Enable test mode? (yes/no, default no):', default: false, type: 'boolean' },
        { key: 'useAttachments', text: 'Include attachments? (yes/no, default no):', default: false, type: 'boolean' }
      ];

      let currentQuestion = 0;
      
      const askNextQuestion = async () => {
        if (currentQuestion >= questions.length) {
          userStates.delete(chatId);
          saveState();
          resolve(config);
          return;
        }
        const q = questions[currentQuestion];
        await bot.sendMessage(chatId, q.text);
        userStates.set(chatId, { step: q.key, config });
        saveState();
      };

      bot.on('message', async (msg) => {
        if (msg.chat.id !== chatId || !userStates.has(chatId)) return;
        const state = userStates.get(chatId);
        
        if (state.step !== 'method') {
          const q = questions[currentQuestion];
          let value = msg.text.trim();
          
          if (q.type === 'number') {
            value = parseInt(value) || q.default;
          } else if (q.type === 'boolean') {
            value = value.toLowerCase() === 'yes' || value.toLowerCase() === 'y';
          }
          
          state.config[state.step] = value;
          currentQuestion++;
          askNextQuestion();
        }
      });

      askNextQuestion();
    });
  });
}

// Main campaign function with rate limiting and error handling
async function runTelegramCampaign(chatId) {
  try {
    await loadState();
    await bot.sendMessage(chatId, banner, { parse_mode: 'Markdown' });
    const config = await getConfigFromUser(chatId);

    let smtpConfigs = [];
    let templates = {};
    let attachments = [];
    let placeholders = {};
    let fromEmails = [];
    let fromNames = [];
    let subjects = [];
    let recipients = [];
    let spamKeywords = [];

    // Load resources with error handling
    try {
      if (config.method === 'direct') await loadSendGridKey();
      smtpConfigs = config.method === 'indirect' ? await loadCustomSMTP() : [];
      templates = await loadTemplates();
      attachments = config.useAttachments ? await loadAttachments() : [];
      placeholders = await loadPlaceholders();
      fromEmails = await loadList('frommail.txt', 'from emails');
      fromNames = await loadFromNames();
      subjects = await loadList('subject.txt', 'subjects');
      recipients = await loadRecipients();
      spamKeywords = await loadList('spamKeywords.txt', 'spam keywords');
    } catch (error) {
      await bot.sendMessage(chatId, `Error loading resources: ${error.message}. Proceeding with available data.`);
    }

    if (recipients.length === 0) {
      await bot.sendMessage(chatId, 'No recipients found. Campaign aborted.');
      return;
    }

    await bot.sendMessage(chatId, `Campaign starting with ${recipients.length} recipients...`);

    // Rate limiting: Calculate delay per task based on rateLimit (emails/min)
    const rateLimitDelay = config.rateLimit > 0 ? (60 * 1000) / config.rateLimit : 0; // ms per email

    const queue = async.queue(async (task, callback) => {
      const { recipient } = task;
      const template = _.sample(Object.values(templates)) || '<p>No template available</p>';
      const subject = _.sample(subjects) || 'No Subject';
      const fromEmail = _.sample(fromEmails) || 'default@example.com';
      const fromName = _.sample(fromNames) || 'Default Sender';
      let result;

      try {
        await bot.sendMessage(chatId, `Processing: ${recipient.email}`);
        if (config.method === 'direct') {
          result = await sendDirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, attachments);
        } else {
          const smtpConfig = _.sample(smtpConfigs) || { host: 'localhost', port: 25, user: '', pass: '' };
          result = await sendIndirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, smtpConfig, attachments);
        }
      } catch (error) {
        result = { status: 'error', error: error.message };
      }

      await bot.sendMessage(chatId, `${recipient.email}: ${result.status}${result.error ? ' - ' + result.error : ''}`);
      
      // Apply coolingTime delay before calling callback
      setTimeout(() => {
        callback(null, result);
      }, Math.max(config.coolingTime, rateLimitDelay)); // Use the greater of coolingTime or rateLimit delay
    }, config.maxThreads || 1); // Default to 1 thread if maxThreads is invalid

    const results = [];
    recipients.forEach((recipient) => {
      queue.push({ recipient }, (err, result) => {
        if (err) {
          console.error(`Queue error for ${recipient.email}: ${err.message}`);
          results.push({ email: recipient.email, status: 'error', details: { error: err.message } });
        } else if (result) {
          results.push({ email: recipient.email, status: result.status, details: result });
        }
      });
    });

    await new Promise((resolve) => {
      queue.drain(async () => {
        try {
          await bot.sendMessage(chatId, 'Campaign completed! Summary:');
          const summary = results.map(r => 
            `${r.email}: ${r.status}${r.details.error ? ' - ' + r.details.error : ''}`
          ).join('\n');
          await bot.sendMessage(chatId, summary || 'No results to display.');

          // Prompt user to reload or not
          await bot.sendMessage(chatId, 'Would you like to start another campaign?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Reload', callback_data: 'reload_yes' }],
                [{ text: 'No', callback_data: 'reload_no' }]
              ]
            }
          });

          bot.once('callback_query', async (query) => {
            if (query.message.chat.id !== chatId) return;
            
            await bot.answerCallbackQuery(query.id);
            if (query.data === 'reload_yes') {
              await bot.sendMessage(chatId, 'Starting a new campaign...');
              runTelegramCampaign(chatId); // Recursively start a new campaign
            } else {
              await bot.sendMessage(chatId, 'Campaign ended. Use /send to start a new one manually.');
            }
            await saveState();
            resolve();
          });
        } catch (error) {
          await bot.sendMessage(chatId, `Error during campaign completion: ${error.message}`);
          resolve(); // Continue even if summary fails
        }
      });
    });

  } catch (error) {
    await bot.sendMessage(chatId, `Campaign error: ${error.message}`);
  }
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to The BEAST Telegram Bot! Use /send to start an email campaign.");
});

bot.onText(/\/send/, (msg) => {
  runTelegramCampaign(msg.chat.id);
});

// Handle process termination
process.on('SIGINT', async () => {
  await saveState();
  console.log('Bot state saved. Shutting down...');
  process.exit(0);
});

console.log('Telegram Bot is running...');