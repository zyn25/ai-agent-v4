import { createServer } from 'http';

/**
 * Telegram Webhook Server
 * More stable than polling for production.
 * Requires public URL (use ngrok, cloudflare tunnel, or VPS with domain).
 */
export class WebhookServer {
  #config; #logger; #bot; #server; #port;
  #commandHandlers = new Map();

  constructor(config, logger, bot) {
    this.#config = config;
    this.#logger = logger;
    this.#bot = bot;
    this.#port = parseInt(process.env.WEBHOOK_PORT, 10) || 8443;
  }

  registerCommand(pattern, handler) {
    this.#commandHandlers.set(pattern, handler);
  }

  async start() {
    const secret = this.#generateSecret();

    // Set webhook with Telegram
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      this.#logger.warn('No WEBHOOK_URL set. Use polling mode instead.');
      return false;
    }

    try {
      const fullUrl = webhookUrl + '/webhook/' + secret;
      await this.#bot.setWebHook(fullUrl, {
        max_connections: 40,
        allowed_updates: ['message']
      });
      this.#logger.info('Webhook set: ' + fullUrl);
    } catch (e) {
      this.#logger.error('Webhook setup failed: ' + e.message);
      return false;
    }

    // Create HTTP server
    this.#server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook/' + secret) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const update = JSON.parse(body);
            this.#processUpdate(update);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          } catch (e) {
            res.writeHead(400);
            res.end('{"ok":false}');
          }
        });
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"ok","mode":"webhook"}');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.#server.listen(this.#port, () => {
      this.#logger.info('Webhook server listening on port ' + this.#port);
    });

    return true;
  }

  #processUpdate(update) {
    if (!update.message || !update.message.text) return;
    const text = update.message.text;
    const chatId = update.message.chat.id;

    for (const [pattern, handler] of this.#commandHandlers) {
      if (pattern.test(text)) {
        handler(text, chatId);
        break;
      }
    }
  }

  #generateSecret() {
    return Math.random().toString(36).substring(2, 15);
  }

  stop() {
    if (this.#server) {
      this.#server.close();
      this.#logger.info('Webhook server stopped');
    }
  }
}
