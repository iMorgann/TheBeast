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

// Identify if local machine can send directly
async function checkLocalSendCapability() {
  try {
    // Try to resolve local hostname
    const os = require('os');
    const hostname = os.hostname();
    const interfaces = os.networkInterfaces();
    
    // Get all IPv4 addresses from the interfaces
    const ipAddresses = [];
    Object.keys(interfaces).forEach(ifaceName => {
      interfaces[ifaceName].forEach(iface => {
        if (iface.family === 'IPv4' || iface.family === 4) {
          ipAddresses.push(iface.address);
        }
      });
    });
    
    console.log(colors.green(`✔ Found ${ipAddresses.length} local IP addresses that may be used for direct sending.`));
    
    return {
      hostname,
      ipAddresses,
      canSendDirectly: ipAddresses.length > 0
    };
  } catch (error) {
    console.error(colors.red('✘ Error checking local send capability:'), error.message);
    return {
      hostname: 'unknown',
      ipAddresses: [],
      canSendDirectly: false
    };
  }
}

// Load IP addresses for direct sending
async function loadSendIPs() {
  try {
    const lines = (await fs.readFile('sendIP.txt', 'utf-8')).split('\n').filter(Boolean);
    const ipConfigs = lines.map((line) => {
      const [ip, port] = line.split(':');
      return { 
        ip, 
        port: parseInt(port) || 25,
        type: 'direct-ip'
      };
    });
    
    console.log(colors.green(`✔ Loaded ${ipConfigs.length} direct IP configurations.`));
    return ipConfigs;
  } catch (error) {
    console.error(colors.red('✘ Error loading direct IP config:'), error.message);
    return []; // Return empty array instead of throwing
  }
}

// Get user config input with direct IP options
async function getConfigInput() {
  const ask = (question) => new Promise((resolve) => readline.question(colors.blue(question), resolve));

  // Check local send capability with error handling
  let localSendCapability;
  try {
    localSendCapability = await checkLocalSendCapability();
  } catch (error) {
    console.log(colors.yellow(`⚠ Could not check local send capability: ${error.message}`));
    localSendCapability = {
      hostname: 'unknown',
      ipAddresses: [],
      canSendDirectly: false
    };
  }
  
  // Check IP configs with error handling
  let ipConfigs = [];
  try {
    ipConfigs = await loadSendIPs();
  } catch (error) {
    console.log(colors.yellow(`⚠ Could not load IP configurations: ${error.message}`));
    ipConfigs = [];
  }
  
  console.log(colors.cyan('--- Available Sending Methods ---'));
  console.log('1) SendGrid (API based)');
  console.log('2) Custom SMTP (server based)');
  
  if (localSendCapability.canSendDirectly) {
    console.log('3) Direct from local machine ' + colors.green('(available)'));
  } else {
    console.log('3) Direct from local machine ' + colors.red('(not available)'));
  }
  
  if (ipConfigs.length > 0) {
    console.log(`4) Direct via IP rotation (${ipConfigs.length} IPs available)`);
  } else {
    console.log('4) Direct via IP rotation ' + colors.red('(no IPs configured)'));
  }
  
  let methodChoice;
  do {
    methodChoice = await ask('Choose sending method (1-4): ');
    methodChoice = parseInt(methodChoice);
  } while (isNaN(methodChoice) || methodChoice < 1 || methodChoice > 4);
  
  let method;
  switch (methodChoice) {
    case 1: method = 'direct'; break;    // SendGrid
    case 2: method = 'indirect'; break;  // SMTP
    case 3: method = 'local'; break;     // Direct from local
    case 4: method = 'ipRotation'; break;// IP rotation
    default: method = 'indirect';        // Default to SMTP
  }
  
  // If chosen method is not available, warn user but allow them to continue
  if ((method === 'local' && !localSendCapability.canSendDirectly) || 
      (method === 'ipRotation' && ipConfigs.length === 0)) {
    const warning = method === 'local' 
      ? "⚠ Direct local sending may not be available on your system." 
      : "⚠ No IP configurations found for IP rotation.";
    console.log(colors.yellow(warning));
    
    const confirmChoice = await ask('Continue with this method anyway? (y/n, default: n): ');
    if (confirmChoice.toLowerCase() !== 'y') {
      console.log(colors.yellow('Switching to Custom SMTP method instead.'));
      method = 'indirect';
    } else {
      console.log(colors.yellow('Continuing with selected method, but it may not work properly.'));
    }
  }

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
    useAttachments,
    localSendCapability,
    ipConfigs
  };
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

// Send email directly from local machine
async function sendLocalDirectEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, attachments) {
  try {
    if (!recipient || !recipient.email) {
      return { status: 'error', error: 'Invalid recipient email' };
    }
    
    if (!config.localSendCapability || !config.localSendCapability.canSendDirectly) {
      return { status: 'error', error: 'Local machine cannot send directly' };
    }
    
    // If test mode is enabled and test email is provided, replace recipient
    const actualRecipient = config.testMode && config.testEmailAddress ? 
      { ...recipient, email: config.testEmailAddress } : recipient;
    
    // Choose a local IP to send from
    const localIP = _.sample(config.localSendCapability.ipAddresses);
    
    // Create a transporter that sends directly
    const transporter = nodemailer.createTransport({
      direct: true,
      name: config.localSendCapability.hostname,
      host: localIP,
      port: 25, // Standard SMTP port
      secure: false,
      ignoreTLS: true,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000
    });
    
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
        'X-Mailer': 'The-BEAST/1.0',
        'X-Originating-IP': localIP
      }
    };

    if (config.useAttachments && attachments && attachments.length > 0) {
      msg.attachments = attachments.map((att) => ({
        content: Buffer.from(att.content, 'base64'),
        filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
      }));
    }

    if (config.testMode) {
      console.log(colors.cyan(`🧪 [${recipient.email}] Test Mode (Direct Local):`) + 
        ` Using ${localIP}`);
      return { status: 'test', msg: _.omit(msg, ['text', 'html']) };
    }

    const info = await transporter.sendMail(msg);
    console.log(colors.green(`✔ [${recipient.email}] Sent directly from ${localIP} as "${fromName} <${fromEmail}>".`));
    return { status: 'success', messageId: info.messageId, ip: localIP };
  } catch (error) {
    console.error(colors.red(`✘ [${recipient.email}] Failed direct local send: ${error.message}`));
    return { status: 'error', error: error.message };
  }
}

// Send email via IP rotation
async function sendIPRotationEmail(recipient, template, subject, fromEmail, fromName, placeholders, spamKeywords, config, attachments) {
  try {
    if (!recipient || !recipient.email) {
      return { status: 'error', error: 'Invalid recipient email' };
    }
    
    if (!config.ipConfigs || config.ipConfigs.length === 0) {
      return { status: 'error', error: 'No IP configurations available for rotation' };
    }
    
    // Choose random IP config
    const ipConfig = _.sample(config.ipConfigs);
    
    // If test mode is enabled and test email is provided, replace recipient
    const actualRecipient = config.testMode && config.testEmailAddress ? 
      { ...recipient, email: config.testEmailAddress } : recipient;
    
    // Create a transporter for the specific IP
    const transporter = nodemailer.createTransport({
      direct: true,
      host: ipConfig.ip,
      port: ipConfig.port || 25,
      secure: false,
      ignoreTLS: true,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000
    });

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
        'X-Mailer': 'The-BEAST/1.0',
        'X-Originating-IP': ipConfig.ip
      }
    };

    if (config.useAttachments && attachments && attachments.length > 0) {
      msg.attachments = attachments.map((att) => ({
        content: Buffer.from(att.content, 'base64'),
        filename: replacePlaceholders(`attachment_[firstName]_[date]_${att.filename}`, recipient, placeholders, true),
      }));
    }

    if (config.testMode) {
      console.log(colors.cyan(`🧪 [${recipient.email}] Test Mode (IP Rotation):`) + 
        ` Using ${ipConfig.ip}:${ipConfig.port}`);
      return { status: 'test', msg: _.omit(msg, ['text', 'html']) };
    }

    const info = await transporter.sendMail(msg);
    console.log(colors.green(`✔ [${recipient.email}] Sent via IP ${ipConfig.ip}:${ipConfig.port} as "${fromName} <${fromEmail}>".`));
    return { status: 'success', messageId: info.messageId, ip: `${ipConfig.ip}:${ipConfig.port}` };
  } catch (error) {
    console.error(colors.red(`✘ [${recipient.email}] Failed IP rotation send: ${error.message}`));
    return { status: 'error', error: error.message };
  }
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
      let methodString;
      switch(config.method) {
        case 'direct': methodString = 'SendGrid API'; break;
        case 'indirect': methodString = 'Custom SMTP'; break;
        case 'local': methodString = 'Direct from Local Machine'; break;
        case 'ipRotation': methodString = 'IP Rotation'; break;
        default: methodString = config.method; break;
      }
      
      console.log(colors.blue(`Method: ${methodString}`));
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
      
      // Load appropriate configurations based on method
      switch(config.method) {
        case 'direct':
          sendGridKey = await loadSendGridKey();
          if (!sendGridKey) {
            console.error(colors.red('✘ SendGrid API key not loaded. Cannot continue with SendGrid method.'));
            return false;
          }
          break;
          
        case 'indirect':
          smtpConfigs = await loadCustomSMTP();
          if (!smtpConfigs.length) {
            console.error(colors.red('✘ No SMTP configurations loaded. Cannot continue with SMTP method.'));
            return false;
          }
          break;
          
        case 'local':
          if (!config.localSendCapability.canSendDirectly) {
            console.error(colors.red('✘ Local machine cannot send directly. Cannot continue with Direct Local method.'));
            return false;
          }
          break;
          
        case 'ipRotation':
          if (!config.ipConfigs || !config.ipConfigs.length) {
            console.error(colors.red('✘ No IP configurations loaded. Cannot continue with IP Rotation method.'));
            return false;
          }
          break;
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
        
        let methodString;
        switch(config.method) {
          case 'direct': methodString = 'SendGrid API'; break;
          case 'indirect': methodString = 'Custom SMTP'; break;
          case 'local': methodString = 'Direct from Local Machine'; break;
          case 'ipRotation': methodString = 'IP Rotation'; break;
          default: methodString = config.method; break;
        }
        
        // Create a configuration table
        const configTable = [
          `┌${'─'.repeat(74)}┐`,
          `│ ${colors.bold('THE BEAST CONFIGURATION DETAILS')}${' '.repeat(41)}│`,
          `├${'─'.repeat(35)}┬${'─'.repeat(38)}┤`,
          `│ ${colors.cyan('Method')}${' '.repeat(29)}│ ${methodString}${' '.repeat(38 - methodString.length)}│`,
          `│ ${colors.cyan('Threads')}${' '.repeat(28)}│ ${config.maxThreads}${' '.repeat(37 - config.maxThreads.toString().length)}│`,
          `│ ${colors.cyan('Cooling Time')}${' '.repeat(23)}│ ${config.coolingTime}ms${' '.repeat(35 - config.coolingTime.toString().length - 2)}│`,
          `│ ${colors.cyan('Rate Limit')}${' '.repeat(25)}│ ${config.rateLimit} emails/minute${' '.repeat(37 - config.rateLimit.toString().length - 14)}│`,
          `│ ${colors.cyan('Test Mode')}${' '.repeat(26)}│ ${config.testMode ? 'Enabled' : 'Disabled'}${' '.repeat(30 - (config.testMode ? 7 : 8))}│`
        ];
        
        if (config.testMode && config.testEmailAddress) {
          configTable.push(`│ ${colors.cyan('Test Email')}${' '.repeat(25)}│ ${config.testEmailAddress}${' '.repeat(38 - config.testEmailAddress.length)}│`);
        }
        
        // Add method-specific details
        if (config.method === 'local') {
          configTable.push(`│ ${colors.cyan('Local IPs')}${' '.repeat(26)}│ ${config.localSendCapability.ipAddresses.length} available${' '.repeat(38 - (config.localSendCapability.ipAddresses.length.toString().length + 11))}│`);
        }
        
        if (config.method === 'ipRotation') {
          configTable.push(`│ ${colors.cyan('IP Rotation')}${' '.repeat(24)}│ ${config.ipConfigs.length} IPs available${' '.repeat(38 - (config.ipConfigs.length.toString().length + 14))}│`);
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

      // Create a table for displaying current thread emails
      const createThreadEmailsTable = () => {
        if (currentThreadEmails.length === 0) return '';
        
        // Use the format shown in your example
        let table = colors.bold(`\nTHREAD #${currentThreadIndex} EMAILS:\n`);
        table += colors.cyan('┌─────────────────────────────────────────────────────────────────────────────┐\n');
        
        // Add each email as a block
        currentThreadEmails.forEach((email, idx) => {
          const statusColor = email.status === 'success' ? colors.green : 
                             email.status === 'error' ? colors.red : colors.yellow;
          
          table += colors.cyan(`   ${(idx+1).toString()}. `);
          table += `Email: ${colors.white(email.recipient)}\n`;
          table += colors.cyan(`│    `);
          table += `From: ${colors.white(email.from)}\n`;
          table += colors.cyan(`│    `);
          table += `Template: ${colors.white(email.template)}\n`;
          
          // Show server/IP information if available
          if (email.ip) {
            table += colors.cyan(`│    `);
            table += `Server: ${colors.white(email.ip)}\n`;
          } else if (email.smtpHost) {
            table += colors.cyan(`│    `);
            table += `Server: ${colors.white(email.smtpHost)}\n`;
          }
          
          table += colors.cyan(`│    `);
          table += `Status: ${statusColor(email.status)}\n`;
          
          if (idx < currentThreadEmails.length - 1) {
            table += colors.cyan(`│     ${'─'.repeat(70)}\n`);
          }
        });
        
        table += colors.cyan('└─────────────────────────────────────────────────────────────────────────────┘');
        
        return table;
      };
      
      const updateProgress = () => {
        console.clear(); // Clear the console for a cleaner display
        console.log(banner); // Keep the banner
        console.log(createProgressTable());
        console.log(createThreadEmailsTable());
      };

      
      // Function to handle cooling down when rate limit is reached
      const coolDown = async () => {
        const coolingTimeInSeconds = Math.ceil(config.coolingTime / 1000);
        const emoji = coolEmojis[Math.floor(Math.random() * coolEmojis.length)];
        
        console.clear();
        console.log(banner); // Keep the banner during cooling
        console.log(createProgressTable());
        console.log(createThreadEmailsTable());
        
        // Display thread completion message
        console.log(colors.green(`\n✓ Thread #${currentThreadIndex} completed processing ${currentThreadEmails.length} emails.`));
        
        console.log(colors.blue(`\n${emoji} The BEAST is cooling down for ${coolingTimeInSeconds} seconds ${emoji}`));
        console.log(colors.blue('┌' + '─'.repeat(30) + '┐'));
        
        for (let i = coolingTimeInSeconds; i > 0; i--) {
          const countdownEmoji = coolEmojis[Math.floor(Math.random() * coolEmojis.length)];
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
        
        updateProgress();
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
            let usedIP = null;
            
            // Handle different sending methods
            switch(config.method) {
              case 'direct': // SendGrid
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
                break;
                
              case 'indirect': // SMTP
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
                break;
                
              case 'local': // Direct from local machine
                result = await sendLocalDirectEmail(
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
                usedIP = result.ip || _.sample(config.localSendCapability.ipAddresses);
                break;
                
              case 'ipRotation': // IP Rotation
                result = await sendIPRotationEmail(
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
                usedIP = result.ip;
                break;
                
              default: // Fallback to SMTP
                console.log(colors.yellow(`⚠ Unknown method "${config.method}". Falling back to SMTP.`));
                // Choose random SMTP config as fallback
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
                break;
            }

            // Add to current thread emails
            currentThreadEmails.push({
              recipient: recipient.email,
              from: fromEmail,
              fromName: fromName,
              subject: subject,
              template: templateName,
              smtpHost: smtpConfig ? smtpConfig.host : (config.method === 'direct' ? 'SendGrid' : null),
              ip: usedIP || null,
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
      
      // Method-specific summary information
      if (config.method === 'local' || config.method === 'ipRotation') {
        const ipSummary = [
          `┌${'─'.repeat(74)}┐`,
          `│ ${colors.bold('IP USAGE DETAILS')}${' '.repeat(57)}│`,
          `├${'─'.repeat(74)}┤`
        ];
        
        if (config.method === 'local') {
          ipSummary.push(`│ Sent directly from local machine using ${config.localSendCapability.ipAddresses.length} IPs${' '.repeat(74 - 46 - config.localSendCapability.ipAddresses.length.toString().length)}│`);
        } else {
          ipSummary.push(`│ Sent using IP rotation with ${config.ipConfigs.length} IPs${' '.repeat(74 - 35 - config.ipConfigs.length.toString().length)}│`);
        }
        
        ipSummary.push(`└${'─'.repeat(74)}┘`);
        console.log(ipSummary.join('\n'));
      }
      
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