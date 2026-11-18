const nodemailer = require('nodemailer');

const transporterFor = config => {
  const port = Number(config.port) || 587;
  const secure = config.secure ?? (port === 465);
  return nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    requireTLS: port === 587 && !secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
};

const hasCredentials = config => Boolean(config?.host && config.user && config.pass);
const isConfigured = config => Boolean(config?.enabled && hasCredentials(config));

async function testConnection(config) {
  if (!hasCredentials(config)) throw new Error('SMTP host, username and password are required');
  await transporterFor(config).verify();
  return { success: true, message: 'SMTP authentication succeeded' };
}

async function sendEmail({ to, subject, html, text }, config) {
  if (!isConfigured(config)) throw new Error('SMTP email is not enabled or configured');
  const result = await transporterFor(config).sendMail({
    from: config.from || config.user,
    to,
    subject,
    html,
    text: text || (html ? html.replace(/<[^>]+>/g, '') : undefined),
  });
  if (!result.accepted?.length) throw new Error('SMTP server did not accept the recipient');
  return { status: 'sent', externalId: result.messageId || '' };
}

module.exports = { contractMethods: ['sendEmail', 'testConnection'], isConfigured, sendEmail, testConnection };
