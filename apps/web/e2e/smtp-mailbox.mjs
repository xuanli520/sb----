import { createServer as createHttpServer } from 'node:http';
import { createServer as createSmtpServer } from 'node:net';

// This process exists only for Playwright. The application always talks to it through SMTP;
// it is never included in the web or backend runtime and is not a production fallback sender.
const smtpPort = portArgument('smtp-port', 11025);
const httpPort = portArgument('http-port', 18025);
const messages = [];
let nextMessageId = 1;

const smtp = createSmtpServer((socket) => {
  socket.setEncoding('utf8');
  socket.write('220 yuejie-e2e-smtp ready\r\n');

  let buffer = '';
  let dataMode = false;
  let dataLines = [];
  let sender = '';
  let recipients = [];

  socket.on('data', (chunk) => {
    buffer += chunk;
    let lineEnd;
    while ((lineEnd = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
      buffer = buffer.slice(lineEnd + 1);
      if (dataMode) {
        if (line === '.') {
          messages.push({
            id: nextMessageId++,
            sender,
            recipients,
            data: dataLines.map((value) => value.startsWith('..') ? value.slice(1) : value).join('\n'),
          });
          dataMode = false;
          dataLines = [];
          socket.write('250 message accepted\r\n');
        } else {
          dataLines.push(line);
        }
        continue;
      }
      command(socket, line, {
        reset() {
          sender = '';
          recipients = [];
        },
        sender(value) {
          sender = value;
        },
        recipient(value) {
          recipients.push(value);
        },
        beginData() {
          dataMode = true;
          dataLines = [];
        },
      });
    }
  });
});

const http = createHttpServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method === 'GET' && request.url === '/messages') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messages }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end('{"error":"not found"}');
});

smtp.listen(smtpPort, '127.0.0.1');
http.listen(httpPort, '127.0.0.1');

function command(socket, rawLine, handlers) {
  const line = rawLine.trim();
  const upper = line.toUpperCase();
  if (upper.startsWith('EHLO ') || upper.startsWith('HELO ')) {
    socket.write('250-yuejie-e2e-smtp\r\n250-8BITMIME\r\n250 SIZE 1048576\r\n');
    return;
  }
  if (upper.startsWith('MAIL FROM:')) {
    handlers.sender(addressAfterColon(line));
    socket.write('250 sender accepted\r\n');
    return;
  }
  if (upper.startsWith('RCPT TO:')) {
    handlers.recipient(addressAfterColon(line));
    socket.write('250 recipient accepted\r\n');
    return;
  }
  if (upper === 'DATA') {
    handlers.beginData();
    socket.write('354 end data with <CR><LF>.<CR><LF>\r\n');
    return;
  }
  if (upper === 'RSET') {
    handlers.reset();
    socket.write('250 reset\r\n');
    return;
  }
  if (upper === 'NOOP') {
    socket.write('250 ok\r\n');
    return;
  }
  if (upper === 'QUIT') {
    socket.write('221 bye\r\n');
    socket.end();
    return;
  }
  socket.write('250 ok\r\n');
}

function addressAfterColon(value) {
  return value.slice(value.indexOf(':') + 1).trim().replace(/^<|>$/g, '').toLowerCase();
}

function portArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`invalid ${name}`);
  }
  return value;
}

function close() {
  smtp.close();
  http.close(() => process.exit(0));
}

process.once('SIGTERM', close);
process.once('SIGINT', close);
