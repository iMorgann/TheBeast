const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const async = require('async');
const _ = require('lodash');
const colors = require('ansi-colors');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ASCII Art for "The BEAST by root"
const banner = `
${colors.red.bold('  ████████╗██╗  ██╗███████╗    ██████╗ ███████╗ █████╗ ███████╗████████╗')}
${colors.red.bold('  ╚══██╔══╝██║  ██║██╔════╝    ██╔══██╗██╔════╝██╔══██╗██╔════╝╚══██╔══╝')}
${colors.red.bold('     ██║   ███████║█████╗      ██████╔╝█████╗  ███████║███████╗   ██║   ')}
${colors.red.bold('     ██║   ██╔══██║██╔══╝      ██╔══██╗██╔══╝  ██╔══██║╚════██║   ██║   ')}
${colors.red.bold('     ██║   ██║  ██║███████╗    ██████╔╝███████╗██║  ██║███████║   ██║   ')}
${colors.red.bold('     ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝   ')}
${colors.yellow('                by root (@rootbck) - Unleash the Power!                  ')}
`;

// Convert HTML to plain text
function htmlToPlainText(html) {
  return html
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')    // Collapse multiple spaces
    .trim();                 // Trim whitespace
}

// Load SendGrid API key
async function loadSendGridKey() {
  try {
    const key = (await fs.readFile('sendgrid.txt', 'utf-8')).trim();
    sgMail.setApiKey(key);
    console.log(colors.green('✔ SendGrid API key loaded successfully.'));
    return key;
  } catch (error) {
    console.error(colors.red('✘ Error loading SendGrid key:'), error.message);
    return null; // Return null instead of throwing
  }
}

// Identify port type for better configuration
function getPortType(port) {
  switch(port) {
    case 25:
      return 'SMTP';
    case 465:
      return 'SMTPS (SSL)';
    case 587:
      return 'SMTP (STARTTLS)';
    case 2525:
      return 'SMTP (Alternative)';
    default:
      return 'Custom';
  }
}

// Load custom SMTP configs with port validation
async function loadCustomSMTP() {
  try {
    const lines = (await fs.readFile('customsmtp.txt', 'utf-8')).split('\n').filter(Boolean);
    const smtpConfigs = lines.map((line) => {
      const [host, port, user, pass] = line.split('|');
      const parsedPort = parseInt(port);
      
      // Validate port number
      let validPort = parsedPort;
      if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        console.log(colors.yellow(`⚠ Invalid port ${port} for ${host}. Using default port 587.`));
        validPort = 587;
      }
      
      return { 
        host, 
        port: validPort, 
        user, 
        pass,
        portType: getPortType(validPort)
      };
    });
    
    console.log(colors.green(`✔ Loaded ${smtpConfigs.length} SMTP configurations.`));
    
    // Log the available port types
    const portTypes = smtpConfigs.map(config => config.portType);
    const uniquePortTypes = [...new Set(portTypes)];
    console.log(colors.green(`✔ SMTP port types: ${uniquePortTypes.join(', ')}`));
    
    return smtpConfigs;
  } catch (error) {
    console.error(colors.red('✘ Error loading SMTP config:'), error.message);
    return []; // Return empty array instead of throwing
  }
}

// Load templates from directory
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
    console.log(colors.green(`✔ Loaded ${Object.keys(templates).length} templates.`));
    return templates;
  } catch (error) {
    console.error(colors.red('✘ Error loading templates:'), error.message);
    // Create a default template as fallback
    return { 
      default: `<html><body><p>Hello [firstName],</p><p>This is a message from [fromName].</p><p>Regards,<br>[fromName]</p></body></html>` 
    };
  }
}

// Load attachments from directory
async function loadAttachments() {
  try {
    const attachmentDir = path.join(__dirname, 'attachments');
    const files = await fs.readdir(attachmentDir);
    const attachments = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(path.join(attachmentDir, file), { encoding: 'base64' });
        return { filename: file, content };
      })
    );
    console.log(colors.green(`✔ Loaded ${attachments.length} attachments.`));
    return attachments;
  } catch (error) {
    console.error(colors.red('✘ Error loading attachments:'), error.message);
    return []; // Return empty array instead of throwing error
  }
}

// Load placeholders with domain support
async function loadPlaceholders() {
  try {
    const lines = (await fs.readFile('placeholders.txt', 'utf-8')).split('\n').filter(Boolean);
    const placeholders = lines.reduce((acc, line) => {
      const [key, value] = line.split(':');
      if (!key || !value) return acc;  // Skip malformed lines
      
      acc[key] = (recipient) => {
        if (!recipient) return key; // Return key if recipient is undefined
        
        const [path, fallback] = value.split('||');
        try {
          if (path === "email.split('@')[1]" && recipient.email) {
            return recipient.email.split('@')[1] || fallback || path;
          }
          return _.get(recipient, path, fallback) || fallback || path;
        } catch (e) {
          return fallback || path;
        }
      };
      return acc;
    }, {});
    
    // Add date placeholder if not already present
    if (!placeholders['date']) {
      placeholders['date'] = () => new Date().toLocaleDateString();
    }
    
    console.log(colors.green(`✔ Loaded ${Object.keys(placeholders).length} placeholders.`));
    return placeholders;
  } catch (error) {
    console.error(colors.red('✘ Error loading placeholders:'), error.message);
    // Create basic placeholders as fallback
    return {
      firstName: (recipient) => recipient?.firstName || 'Valued Customer',
      lastName: (recipient) => recipient?.lastName || '',
      email: (recipient) => recipient?.email || '',
      company: (recipient) => recipient?.company || 'Your Company',
      date: () => new Date().toLocaleDateString()
    };
  }
}

// Generic list loader
async function loadList(file, name) {
  try {
    const list = (await fs.readFile(file, 'utf-8')).split('\n').filter(Boolean);
    console.log(colors.green(`✔ Loaded ${list.length} ${name}.`));
    return list;
  } catch (error) {
    console.error(colors.red(`✘ Error loading ${name}:`), error.message);
    // Return default values based on what's being loaded
    if (name === 'from emails') return ['noreply@example.com'];
    if (name === 'from names') return ['The BEAST System'];
    if (name === 'subjects') return ['Important Information'];
    if (name === 'spam keywords') return ['viagra', 'casino', 'lottery', 'winner'];
    return [];
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
    const recipients = lines.map((line) => {
      const [email, firstName, lastName, company] = line.split(',');
      return { email, firstName: firstName || '', lastName: lastName || '', company: company || '' };
    });
    console.log(colors.green(`✔ Loaded ${recipients.length} recipients.`));
    return recipients;
  } catch (error) {
    console.error(colors.red('✘ Error parsing recipients:'), error.message);
    throw new Error('Failed to load recipients. Cannot continue without recipients.');
  }
}

// Replace placeholders in text
function replacePlaceholders(text, recipient, placeholders, isFilename = false) {
  if (!text) return '';
  
  let result = text;
  // Process each placeholder
  Object.keys(placeholders).forEach(key => {
    try {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      const replacement = placeholders[key](recipient) || '';
      result = result.replace(regex, replacement);
    } catch (err) {
      // If any placeholder fails, just leave it as is
      console.error(colors.yellow(`⚠ Placeholder [${key}] failed: ${err.message}`));
    }
  });
  
  if (isFilename) {
    result = result.replace(/[\r\n]/g, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  }
  return result;
}

// Check for spam triggers
function checkSpamTriggers(content, spamKeywords) {
  if (!content || !spamKeywords || !spamKeywords.length) {
    return { hasTriggers: false, triggers: [], score: 0 };
  }
  
  const lowerContent = content.toLowerCase();
  const triggers = spamKeywords.filter((keyword) => lowerContent.includes(keyword.toLowerCase()));
  return {
    hasTriggers: triggers.length > 0,
    triggers,
    score: triggers.length * 10,
  };
}


// Send email via SendGrid
async function sendDirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, attachments) {
  try {
    if (!recipient || !recipient.email) {
      return { status: 'error', error: 'Invalid recipient email' };
    }
    
    // If test mode is enabled and test email is provided, replace recipient
    const actualRecipient = config.testMode && config.testEmailAddress ? 
      { ...recipient, email: config.testEmailAddress } : recipient;
    
    // In test mode with test email, keep the original recipient in subject for tracking
    const displayRecipient = config.testMode && config.testEmailAddress ? 
      `${recipient.email} (TEST)` : recipient.email;

    const htmlContent = replacePlaceholders(template, recipient, placeholders);
    const plainTextContent = htmlToPlainText(htmlContent);
    const spamCheck = checkSpamTriggers(htmlContent, spamKeywords);

    if (spamCheck.hasTriggers && !config.testMode) {
      console.log(colors.yellow(`⚠ [${displayRecipient}] Spam triggers detected: ${spamCheck.triggers}`));
      return { status: 'skipped', reason: 'spam triggers', triggers: spamCheck.triggers };
    }

    const msg = {
      to: actualRecipient.email,
      from: { email: fromEmail, name: fromName },
      subject: config.testMode && config.testEmailAddress ? 
        `[TEST] ${replacePlaceholders(subject, recipient, placeholders)} (${recipient.email})` : 
        replacePlaceholders(subject, recipient, placeholders),
      text: plainTextContent,
      html: htmlContent,
    };

    if (config.useAttachments && attachments && attachments.length > 0) {
      msg.attachments = attachments.map((att) => ({
        content: att.content,
        filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
      }));
    }

    if (config.testMode) {
      console.log(colors.cyan(`🧪 [${recipient.email}] Test Mode (SendGrid):`), 
        JSON.stringify(_.omit(msg, ['text', 'html']), null, 2));
      return { status: 'test', msg: _.omit(msg, ['text', 'html']) };
    }

    const response = await sgMail.send(msg);
    console.log(colors.green(`✔ [${recipient.email}] Sent via SendGrid from "${fromName} <${fromEmail}>".`));
    return { status: 'success', messageId: response[0]?.messageId };
  } catch (error) {
    console.error(colors.red(`✘ [${recipient.email}] Failed via SendGrid: ${error.message}`));
    return { status: 'error', error: error.message };
  }
}


// Send email via SMTP
async function sendIndirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, smtpConfig, attachments) {
  try {
    if (!recipient || !recipient.email) {
      return { status: 'error', error: 'Invalid recipient email' };
    }

    if (!smtpConfig || !smtpConfig.host) {
      return { status: 'error', error: 'Invalid SMTP configuration' };
    }
    
    // If test mode is enabled and test email is provided, replace recipient
    const actualRecipient = config.testMode && config.testEmailAddress ? 
      { ...recipient, email: config.testEmailAddress } : recipient;

    // Create transporter with error handling
    let transporter;
    try {
      const port = parseInt(smtpConfig.port) || 587;
      
      // Configure SMTP transport with port-specific settings
      const transportConfig = {
        host: smtpConfig.host,
        port: port,
        auth: { 
          user: smtpConfig.user, 
          pass: smtpConfig.pass 
        },
        connectionTimeout: 15000, // 15 seconds timeout
        greetingTimeout: 15000,
        socketTimeout: 20000
      };
      
      // Configure security settings based on port
      if (port === 465) {
        // Port 465 typically uses implicit TLS (SSL)
        transportConfig.secure = true;
      } else if (port === 587) {
        // Port 587 typically uses STARTTLS
        transportConfig.secure = false;
        transportConfig.tls = {
          rejectUnauthorized: false, // Only use in development
          ciphers: 'SSLv3'
        };
      } else if (port === 25) {
        // Port 25 (standard SMTP) might need special handling
        transportConfig.secure = false;
        transportConfig.ignoreTLS = true; // Don't require TLS
      } else if (port === 2525) {
        // Alternative port often used when 25, 465, 587 are blocked
        transportConfig.secure = false;
      } else {
        // For custom ports, try without security options
        transportConfig.secure = false;
        transportConfig.tls = {
          rejectUnauthorized: false
        };
      }
      
      transporter = nodemailer.createTransport(transportConfig);
    } catch (err) {
      console.error(colors.red(`✘ SMTP Transport Error: ${err.message}`));
      return { status: 'error', error: `SMTP configuration error: ${err.message}` };
    }

    // Verify connection
    try {
      await transporter.verify();
    } catch (err) {
      console.error(colors.red(`✘ SMTP Connection Verification Failed: ${err.message}`));
      return { status: 'error', error: `SMTP connection failed: ${err.message}` };
    }

    const htmlContent = replacePlaceholders(template, recipient, placeholders);
    const plainTextContent = htmlToPlainText(htmlContent);
    const spamCheck = checkSpamTriggers(htmlContent, spamKeywords);

    if (spamCheck.hasTriggers && !config.testMode) {
      console.log(colors.yellow(`⚠ [${recipient.email}] Spam triggers detected: ${spamCheck.triggers}`));
      return { status: 'skipped', reason: 'spam triggers', triggers: spamCheck.triggers };
    }

    const msg = {
      to: actualRecipient.email,
      from: `${fromName} <${fromEmail}>`,
      subject: config.testMode && config.testEmailAddress ? 
        `[TEST] ${replacePlaceholders(subject, recipient, placeholders)} (${recipient.email})` : 
        replacePlaceholders(subject, recipient, placeholders),
      text: plainTextContent,
      html: htmlContent,
      headers: {
        'X-Generated-By': 'The-BEAST',
        'X-Mailer': 'The-BEAST/1.0'
      }
    };

    if (config.useAttachments && attachments && attachments.length > 0) {
      msg.attachments = attachments.map((att) => ({
        content: Buffer.from(att.content, 'base64'),
        filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
      }));
    }

    if (config.testMode) {
      console.log(colors.cyan(`🧪 [${recipient.email}] Test Mode (SMTP):`), 
        JSON.stringify(_.omit(msg, ['text', 'html']), null, 2));
      return { status: 'test', msg: _.omit(msg, ['text', 'html']) };
    }

    try {
      const info = await transporter.sendMail(msg);
      console.log(colors.green(`✔ [${recipient.email}] Sent via SMTP (${smtpConfig.host}) from "${fromName} <${fromEmail}>".`));
      return { status: 'success', messageId: info.messageId };
    } catch (sendError) {
      console.error(colors.red(`✘ [${recipient.email}] Failed via SMTP: ${sendError.message}`));
      // Check for specific SMTP errors and provide clearer messages
      if (sendError.message.includes('authentication failed')) {
        return { 
          status: 'error', 
          error: `SMTP authentication failed for ${smtpConfig.user}@${smtpConfig.host}. Please check credentials.` 
        };
      }
      if (sendError.message.includes('connection refused')) {
        return { 
          status: 'error', 
          error: `SMTP connection refused to ${smtpConfig.host}:${smtpConfig.port}. Server may be blocking connections.` 
        };
      }
      return { status: 'error', error: sendError.message };
    }
  } catch (error) {
    console.error(colors.red(`✘ [${recipient.email}] Failed via SMTP with unexpected error: ${error.message}`));
    return { status: 'error', error: error.message };
  }
}

// Get user config input
async function getConfigInput() {
  const ask = (question) => new Promise((resolve) => readline.question(colors.blue(question), resolve));

  const method = (await ask('Use SendGrid (s) or Custom SMTP (c)? (s/c): ')).toLowerCase() === 'c' ? 'indirect' : 'direct';
  const maxThreads = parseInt(await ask('Enter number of threads (default 10): ') || 10);
  const coolingTime = parseInt(await ask('Enter cooling time in ms (default 1000): ') || 1000);
  const rateLimit = parseInt(await ask('Enter rate limit (emails per minute, default 100): ') || 100);
  const testMode = (await ask('Enable test mode? (y/n, default n): ')).toLowerCase() === 'y';

  // Get test email address if test mode is enabled
  let testEmailAddress = null;
  if (testMode) {
    testEmailAddress = await ask('Enter test email address to receive all test emails: ');
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      console.log(colors.yellow('⚠ Invalid test email. Test emails will be logged but not actually sent.'));
      testEmailAddress = null;
    } else {
      console.log(colors.green(`✔ Test emails will be sent to: ${testEmailAddress}`));
    }
  }
  
  const useAttachments = (await ask('Include attachments? (y/n, default n): ')).toLowerCase() === 'y';
  
  // Validate inputs
  const validatedThreads = maxThreads > 0 && maxThreads <= 100 ? maxThreads : 10;
  const validatedCoolingTime = coolingTime >= 0 ? coolingTime : 1000;
  const validatedRateLimit = rateLimit > 0 ? rateLimit : 100;
  
  if (validatedThreads !== maxThreads) {
    console.log(colors.yellow(`⚠ Invalid thread count. Using ${validatedThreads} threads.`));
  }
  
  return { 
    method, 
    maxThreads: validatedThreads, 
    coolingTime: validatedCoolingTime, 
    rateLimit: validatedRateLimit, 
    testMode,
    testEmailAddress,
    useAttachments 
  };
}

// Error analysis function
function analyzeError(error) {
  if (!error) return 'Unknown error';
  
  const errorMsg = error.toString();
  
  if (errorMsg.includes('authentication')) {
    return 'SMTP authentication failed. Check username and password.';
  }
  if (errorMsg.includes('connection')) {
    return 'Connection issue. Server may be unavailable or blocking connections.';
  }
  if (errorMsg.includes('timeout')) {
    return 'Connection timed out. Server may be slow or unresponsive.';
  }
  if (errorMsg.includes('550') || errorMsg.includes('554')) {
    return 'Message rejected. Recipient may be invalid or server policy rejection.';
  }
  if (errorMsg.includes('421')) {
    return 'Service not available. Server may be blocking due to rate limits.';
  }
  
  return errorMsg;
}


// Format duration in a human-readable format
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Display startup animation
async function displayStartupAnimation() {
  console.clear();
  const frames = [
    '🔄 Starting The BEAST...',
    '⚡ Powering up The BEAST...',
    '🔌 Initializing The BEAST...',
    '🧠 Loading The BEAST AI...',
    '🔥 The BEAST is coming alive...',
    '🚀 The BEAST is ready!'
  ];
  
  for (const frame of frames) {
    console.clear();
    console.log(banner);
    console.log(colors.cyan(frame));
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Keep the banner after animation completes
  console.clear();
  console.log(banner);
}


// Main bulk email function
async function sendBulkEmails() {
  console.log(banner);

  const runCampaign = async () => {
    try {
      // Display animated loading banner
      await displayStartupAnimation();
      
      const startTime = Date.now();
      const config = await getConfigInput();
      
      // Keep the banner visible
      console.clear();
      console.log(banner);
      
      console.log(colors.blue('--- Configuration ---'));
      console.log(colors.blue(`Method: ${config.method === 'direct' ? 'SendGrid' : 'Custom SMTP'}`));
      console.log(colors.blue(`Threads: ${config.maxThreads}`));
      console.log(colors.blue(`Cooling time: ${config.coolingTime}ms`));
      console.log(colors.blue(`Rate limit: ${config.rateLimit} emails/minute`));
      console.log(colors.blue(`Test mode: ${config.testMode ? 'Enabled' : 'Disabled'}`));
      if (config.testMode && config.testEmailAddress) {
        console.log(colors.blue(`Test email destination: ${config.testEmailAddress}`));
      }
      console.log(colors.blue(`Attachments: ${config.useAttachments ? 'Included' : 'Not included'}`));
      console.log(colors.blue('--------------------'));

      let sendGridKey = null;
      let smtpConfigs = [];

      if (config.method === 'direct') {
        sendGridKey = await loadSendGridKey();
        if (!sendGridKey) {
          console.error(colors.red('✘ SendGrid API key not loaded. Cannot continue with SendGrid method.'));
          return false;
        }
      } else {
        smtpConfigs = await loadCustomSMTP();
        if (!smtpConfigs.length) {
          console.error(colors.red('✘ No SMTP configurations loaded. Cannot continue with SMTP method.'));
          return false;
        }
      }

      const templates = await loadTemplates();
      const attachments = config.useAttachments ? await loadAttachments() : [];
      const placeholders = await loadPlaceholders();
      const fromEmails = await loadList('frommail.txt', 'from emails');
      const fromNames = await loadFromNames();
      const subjects = await loadList('subject.txt', 'subjects');
      const recipients = await loadRecipients();
      const spamKeywords = await loadList('spamKeywords.txt', 'spam keywords');

      if (!recipients.length) {
        console.error(colors.red('✘ No recipients loaded. Cannot continue.'));
        return false;
      }

      if (!Object.keys(templates).length) {
        console.error(colors.red('✘ No templates loaded. Cannot continue.'));
        return false;
      }

      // Function to display detailed configuration info
      const displayConfigurationDetails = () => {
        console.log(colors.blue('\n--- DETAILED CONFIGURATION ---'));
        
        // Create a configuration table
        const configTable = [
          `┌${'─'.repeat(74)}┐`,
          `│ ${colors.bold('THE BEAST CONFIGURATION DETAILS')}${' '.repeat(41)}│`,
          `├${'─'.repeat(35)}┬${'─'.repeat(38)}┤`,
          `│ ${colors.cyan('Method')}${' '.repeat(29)}│ ${config.method === 'direct' ? 'SendGrid' : 'Custom SMTP'}${' '.repeat(28 - (config.method === 'direct' ? 8 : 11))}│`,
          `│ ${colors.cyan('Threads')}${' '.repeat(28)}│ ${config.maxThreads}${' '.repeat(37 - config.maxThreads.toString().length)}│`,
          `│ ${colors.cyan('Cooling Time')}${' '.repeat(23)}│ ${config.coolingTime}ms${' '.repeat(35 - config.coolingTime.toString().length - 2)}│`,
          `│ ${colors.cyan('Rate Limit')}${' '.repeat(25)}│ ${config.rateLimit} emails/minute${' '.repeat(37 - config.rateLimit.toString().length - 14)}│`,
          `│ ${colors.cyan('Test Mode')}${' '.repeat(26)}│ ${config.testMode ? 'Enabled' : 'Disabled'}${' '.repeat(30 - (config.testMode ? 7 : 8))}│`
        ];
        
        if (config.testMode && config.testEmailAddress) {
          configTable.push(`│ ${colors.cyan('Test Email')}${' '.repeat(25)}│ ${config.testEmailAddress}${' '.repeat(38 - config.testEmailAddress.length)}│`);
        }
        
        configTable.push(`│ ${colors.cyan('Attachments')}${' '.repeat(24)}│ ${config.useAttachments ? 'Included' : 'Not included'}${' '.repeat(38 - (config.useAttachments ? 8 : 12))}│`);
        configTable.push(`├${'─'.repeat(35)}┴${'─'.repeat(38)}┤`);
        configTable.push(`│ ${colors.bold('LOADED RESOURCES')}${' '.repeat(59)}│`);
        configTable.push(`├${'─'.repeat(74)}┤`);
        configTable.push(`│ ${colors.green('✓')} SMTP Configurations: ${smtpConfigs.length.toString().padStart(3)}${' '.repeat(46 - smtpConfigs.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} Email Templates: ${Object.keys(templates).length.toString().padStart(3)}${' '.repeat(51 - Object.keys(templates).length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} From Emails: ${fromEmails.length.toString().padStart(3)}${' '.repeat(55 - fromEmails.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} From Names: ${fromNames.length.toString().padStart(3)}${' '.repeat(56 - fromNames.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} Subjects: ${subjects.length.toString().padStart(3)}${' '.repeat(58 - subjects.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} Recipients: ${recipients.length.toString().padStart(5)}${' '.repeat(56 - recipients.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} Spam Keywords: ${spamKeywords.length.toString().padStart(3)}${' '.repeat(53 - spamKeywords.length.toString().length)}│`);
        configTable.push(`│ ${colors.green('✓')} Attachments: ${attachments.length.toString().padStart(3)}${' '.repeat(55 - attachments.length.toString().length)}│`);
        configTable.push(`└${'─'.repeat(74)}┘`);
        
        console.log(configTable.join('\n'));
      };
      
      // Call the function to display configuration details
      displayConfigurationDetails();

      // Set up rate limiting
      const MINUTE = 60 * 1000; // 60 seconds in milliseconds
      const SECOND = 1000; // 1 second in milliseconds
      const emailsPerBatch = config.rateLimit > 0 ? config.rateLimit : 1;
      
      // Progress tracking
      const total = recipients.length;
      let processed = 0;
      let successful = 0;
      let failed = 0;
      let skipped = 0;
      let emailsInCurrentMinute = 0;
      let lastRateLimitReset = Date.now();
      let currentThreadEmails = [];  // Track emails in current thread
      let currentThreadIndex = 1;    // Current thread number
      
      const coolEmojis = ['❄️', '🧊', '🥶', '⛄', '🌡️', '🔥', '💤', '⏱️', '⏳', '🕒'];
      
      // Create a table for displaying progress
      const createProgressTable = () => {
        const percent = Math.floor((processed / total) * 100);
        const progressBar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
        
        const table = [
          `┌${'─'.repeat(60)}┐`,
          `│ ${colors.bold('THE BEAST')} Email Campaign ${coolEmojis[Math.floor(Math.random() * coolEmojis.length)]}${' '.repeat(34)}│`,
          `├${'─'.repeat(60)}┤`,
          `│ Progress: [${colors.cyan(progressBar)}] ${percent.toString().padStart(3)}%${' '.repeat(14)}│`,
          `│ Emails: ${colors.green(processed.toString().padStart(5))} / ${total.toString().padStart(5)} ${' '.repeat(35)}│`,
          `│ ${colors.green('✓')} Success: ${successful.toString().padStart(5)} │ ${colors.red('✗')} Failed: ${failed.toString().padStart(5)} │ ${colors.yellow('⚠')} Skipped: ${skipped.toString().padStart(5)} │`,
          `│ Thread: ${currentThreadIndex}/${config.maxThreads} │ Batch: ${emailsInCurrentMinute}/${emailsPerBatch} per min${' '.repeat(14)}│`,
          `└${'─'.repeat(60)}┘`
        ].join('\n');
        
        return table;
      };

      // Alternative table display function for thread emails
      const createThreadEmailsTable = () => {
        if (currentThreadEmails.length === 0) return '';
        
        // Use a simpler table format that's less prone to spacing issues
        let table = colors.bold(`\nTHREAD #${currentThreadIndex} EMAILS:\n`);
        table += colors.cyan('┌─────────────────────────────────────────────────────────────────────────────┐\n');
        
        // Add each email as a block
        currentThreadEmails.forEach((email, idx) => {
          const statusColor = email.status === 'success' ? colors.green : 
                            email.status === 'error' ? colors.red : colors.yellow;
          
          table += colors.cyan(`│ ${(idx+1).toString().padStart(2)}. `);
          table += `Email: ${colors.white(email.recipient)} \n`;
          table += colors.cyan(`│    `);
          table += `From: ${colors.white(email.from)} \n`;
          table += colors.cyan(`│    `);
          table += `Template: ${colors.white(email.template)} \n`;
          table += colors.cyan(`│    `);
          table += `Status: ${statusColor(email.status)} \n`;
          
          if (idx < currentThreadEmails.length - 1) {
            table += colors.cyan('│     ' + '─'.repeat(70) + '\n');
          }
        });
        
        table += colors.cyan('└─────────────────────────────────────────────────────────────────────────────┘');
        
        return table;
      };
      
      // const updateProgress = () => {
      //   console.clear(); // Clear the console for a cleaner display
      //   console.log(banner); // Keep the banner
      //   console.log(createProgressTable());
      //   console.log(createThreadEmailsTable());
      // };


      // Function to handle cooling down when rate limit is reached
      const coolDown = async () => {
        const coolingTimeInSeconds = Math.ceil(config.coolingTime / 1000);
        const emoji = coolEmojis[Math.floor(Math.random() * coolEmojis.length)];
        
        // Show thread completion message with current thread emails
        console.clear();
        // Show banner only once at the top
        console.log(banner);
        console.log(createProgressTable());
        console.log(createThreadEmailsTable());
        
        // Display thread completion message
        console.log(colors.green(`\n✓ Thread #${currentThreadIndex} completed processing ${currentThreadEmails.length} emails.`));
        
        console.log(colors.blue(`\n${emoji} The BEAST is cooling down for ${coolingTimeInSeconds} seconds ${emoji}`));
        console.log(colors.blue('┌' + '─'.repeat(30) + '┐'));
        
        for (let i = coolingTimeInSeconds; i > 0; i--) {
          const countdownEmoji = coolEmojis[Math.floor(Math.random() * coolEmojis.length)];
          // Use \r to overwrite the same line instead of creating new lines
          process.stdout.write(`\r${colors.blue(`│ ${countdownEmoji} Cooling: ${i.toString().padStart(2)}s remaining... ${' '.repeat(5)}│`)}  `);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`\n${colors.blue('└' + '─'.repeat(30) + '┘')}`);
        console.log(colors.green('🔥 The BEAST is back online and ready to continue! 🔥'));
        
        // Reset rate limit counter and prepare for next thread
        emailsInCurrentMinute = 0;
        lastRateLimitReset = Date.now();
        currentThreadEmails = []; // Clear thread emails
        currentThreadIndex++;     // Move to next thread
        
        // Just update the progress without clearing the entire console
        updateProgress();
      };

      // Also update the updateProgress function to be more conservative with clearing the screen
      const updateProgress = () => {
        console.clear(); // Clear the console for a cleaner display
        // Show banner only once
        console.log(banner); 
        console.log(createProgressTable());
        console.log(createThreadEmailsTable());
      };

      // Create process queue with proper error handling
      const queue = async.queue(async (task) => {
        return new Promise(async (resolve) => {
          const { recipient, index } = task;
          
          try {
            // Check if we need to enforce rate limiting and cooling down
            const now = Date.now();
            if (emailsInCurrentMinute >= emailsPerBatch) {
              // Check if a minute has passed since last reset
              if (now - lastRateLimitReset < MINUTE) {
                // Need to cool down - rate limit reached
                await coolDown();
              } else {
                // Minute has passed, reset counter
                emailsInCurrentMinute = 0;
                lastRateLimitReset = now;
              }
            } else if (now - lastRateLimitReset >= MINUTE) {
              // Minute has passed, reset counter
              emailsInCurrentMinute = 0;
              lastRateLimitReset = now;
            }
            
            // Update progress display
            updateProgress();
            
            // Log processing in a more structured way
            const processingMessage = `\n${colors.cyan(`▶ [${index+1}/${total}] Processing: ${recipient.email}`)}`;
            console.log(processingMessage);
            
            // Increment emails sent in current minute
            emailsInCurrentMinute++;

            // Get random template, subject, from name and email
            const templateValues = Object.values(templates);
            const templateIndex = Math.floor(Math.random() * templateValues.length);
            const templateNames = Object.keys(templates);
            const template = templateValues[templateIndex];
            const templateName = templateNames[templateIndex] || 'default';
            
            const subject = _.sample(subjects) || 'Important Information';
            const fromEmail = _.sample(fromEmails) || 'noreply@example.com';
            const fromName = _.sample(fromNames) || 'The BEAST System';
            
            let result;
            let smtpConfig = null;
            
            if (config.method === 'direct') {
              result = await sendDirectEmail(
                recipient,
                template,
                subject,
                fromEmail,
                fromName,
                placeholders,
                spamKeywords,
                config,
                attachments
              );
            } else {
              // Choose random SMTP config
              smtpConfig = _.sample(smtpConfigs);
              
              if (!smtpConfig) {
                console.error(colors.red(`✘ [${recipient.email}] No valid SMTP configuration available.`));
                result = { status: 'error', error: 'No valid SMTP configuration' };
              } else {
                result = await sendIndirectEmail(
                  recipient,
                  template,
                  subject,
                  fromEmail,
                  fromName,
                  placeholders,
                  spamKeywords,
                  config,
                  smtpConfig,
                  attachments
                );
              }
            }

            // Add to current thread emails
            currentThreadEmails.push({
              recipient: recipient.email,
              from: fromEmail,
              fromName: fromName,
              subject: subject,
              template: templateName,
              smtpHost: smtpConfig ? smtpConfig.host : 'SendGrid',
              status: result.status,
              error: result.error || '',
              timestamp: new Date().toISOString()
            });
            
            // Update statistics
            processed++;
            if (result.status === 'success') {
              successful++;
              console.log(colors.green(`✓ [${recipient.email}] Email sent successfully`));
            } else if (result.status === 'error') {
              failed++;
              console.log(colors.red(`✗ [${recipient.email}] Failed: ${result.error}`));
            } else if (result.status === 'skipped') {
              skipped++;
              console.log(colors.yellow(`⚠ [${recipient.email}] Skipped: ${result.reason || 'Unknown reason'}`));
            }
            
            updateProgress();
            
            // Small pause between emails for individual throttling
            setTimeout(() => {
              resolve(result);
            }, 500); // Small pause between individual emails

            } catch (error) {
            // Handle any unexpected errors
            console.error(colors.red(`✘ [${recipient.email}] Unexpected error: ${error.message}`));
            processed++;
            failed++;
            
            // Add to current thread emails even if error occurred
            currentThreadEmails.push({
              recipient: recipient.email,
              from: 'Error',
              fromName: 'Error',
              subject: 'Error',
              template: 'Error',
              smtpHost: 'Error',
              status: 'error',
              error: error.message,
              timestamp: new Date().toISOString()
            });
            
            updateProgress();
            
            setTimeout(() => {
              resolve({ status: 'error', error: error.message });
            }, 500);
          }
        });
      }, config.maxThreads);
      
      queue.error((err, task) => {
        if (task && task.recipient) {
          console.error(colors.red(`✘ [${task.recipient.email}] Queue error: ${err}`));
        } else {
          console.error(colors.red(`✘ Queue error: ${err}`));
        }
      });

      // Process all recipients
      const results = [];
      
      // Add all recipients to the queue with their index
      recipients.forEach((recipient, index) => {
        queue.push({ recipient, index });
      });
      
      // Wait for all emails to be processed
      await new Promise((resolve) => {
        queue.drain(() => {
          // Process the final thread display
          console.clear();
          console.log(banner);
          console.log(createProgressTable());
          console.log(createThreadEmailsTable());
          
          // Show thread completion message
          console.log(colors.green(`\n✓ Thread #${currentThreadIndex} completed processing ${currentThreadEmails.length} emails.`));
          console.log(colors.green(`✓ All email threads completed.`));
          
          // If in test mode with a test email, show a special message
          if (config.testMode && config.testEmailAddress) {
            console.log(colors.cyan(`\n🧪 Test mode completed. All test emails were sent to: ${config.testEmailAddress}`));
          }
          resolve();
        });
      });

      console.clear();
      console.log(banner);
      
      // Final summary in a beautiful table
      const summaryTable = [
        `┌${'─'.repeat(74)}┐`,
        `│ ${colors.bold.green('🎉 EMAIL CAMPAIGN COMPLETED 🎉')}${' '.repeat(45)}│`,
        `├${'─'.repeat(74)}┤`,
        `│ ${colors.bold('SUMMARY STATISTICS')}${' '.repeat(55)}│`,
        `├${'─'.repeat(35)}┬${'─'.repeat(38)}┤`,
        `│ ${colors.cyan('Total Recipients')}${' '.repeat(19)}│ ${total.toString().padStart(36)} │`,
        `│ ${colors.green('Successfully Sent')}${' '.repeat(18)}│ ${colors.green(successful.toString().padStart(36))} │`,
        `│ ${colors.red('Failed Deliveries')}${' '.repeat(18)}│ ${colors.red(failed.toString().padStart(36))} │`,
        `│ ${colors.yellow('Skipped Emails')}${' '.repeat(20)}│ ${colors.yellow(skipped.toString().padStart(36))} │`,
        `├${'─'.repeat(35)}┼${'─'.repeat(38)}┤`,
        `│ ${colors.cyan('Success Rate')}${' '.repeat(23)}│ ${colors.green(Math.round((successful / total) * 100) + '%').padStart(36)} │`,
        `│ ${colors.cyan('Campaign Duration')}${' '.repeat(18)}│ ${formatDuration(Date.now() - startTime).padStart(36)} │`,
        `│ ${colors.cyan('Emails Per Minute (avg)')}${' '.repeat(13)}│ ${Math.round(processed / ((Date.now() - startTime) / MINUTE)).toString().padStart(36)} │`,
        `│ ${colors.cyan('Threads Used')}${' '.repeat(23)}│ ${config.maxThreads.toString().padStart(36)} │`,
        `│ ${colors.cyan('Cooling Periods')}${' '.repeat(20)}│ ${Math.floor(currentThreadIndex - 1).toString().padStart(36)} │`,
        `└${'─'.repeat(35)}┴${'─'.repeat(38)}┘`,
      ].join('\n');
      
      console.log(summaryTable);

      // Add a detailed status breakdown
      const statusBreakdown = [
        `┌${'─'.repeat(74)}┐`,
        `│ ${colors.bold('DETAILED STATUS BREAKDOWN')}${' '.repeat(49)}│`,
        `├${'─'.repeat(35)}┬${'─'.repeat(38)}┤`,
        `│ ${colors.green('Success Rate')}${' '.repeat(23)}│ ${(Math.round((successful / total) * 10000) / 100).toFixed(2) + '%'.padStart(36 - 4)} │`,
        `│ ${colors.red('Failure Rate')}${' '.repeat(23)}│ ${(Math.round((failed / total) * 10000) / 100).toFixed(2) + '%'.padStart(36 - 4)} │`,
        `│ ${colors.yellow('Skip Rate')}${' '.repeat(25)}│ ${(Math.round((skipped / total) * 10000) / 100).toFixed(2) + '%'.padStart(36 - 4)} │`,
        `└${'─'.repeat(35)}┴${'─'.repeat(38)}┘`,
      ].join('\n');
      
      console.log(statusBreakdown);
      
      // Add a nice completion message
      const completionEmojis = ['🚀', '✨', '🎯', '🏆', '🔥', '⚡', '💯', '🔄'];
      const randomEmoji = completionEmojis[Math.floor(Math.random() * completionEmojis.length)];
      const randomEmoji2 = completionEmojis[Math.floor(Math.random() * completionEmojis.length)];
      console.log(`\n${randomEmoji} ${colors.bold.green('The BEAST has completed its mission successfully!')} ${randomEmoji2}`);
      console.log(`${colors.cyan('Campaign finished in')} ${colors.bold.cyan(formatDuration(Date.now() - startTime))}`);
      console.log(`${colors.yellow('Thank you for using THE BEAST email system!')}`);
      console.log(colors.bold.yellow('©2025 root (@rootbck)'));
      
      return true;
    } catch (error) {
      console.error(colors.red('\n✘ Fatal error in The BEAST:'), error.message);
      return false;
    }
  };

  const continueRunning = async () => {
    const success = await runCampaign();
    
    readline.question(colors.blue('\nRun another campaign? (y/n): '), (answer) => {
      if (answer.toLowerCase() === 'y') {
        continueRunning();
      } else {
        console.log(colors.yellow('👋 Goodbye from The BEAST by root!'));
        readline.close();
        process.exit(0);
      }
    });
  };

  continueRunning();
}

// Start the script
sendBulkEmails();