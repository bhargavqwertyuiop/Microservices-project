const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Redis = require('redis');
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const socketIo = require('socket.io');
const winston = require('winston');
const moment = require('moment');
const uuid = require('uuid');
const Handlebars = require('handlebars');
const { htmlToText } = require('html-to-text');
const Queue = require('bull');
const jwt = require('jsonwebtoken');
const fs = require('fs');
require('dotenv').config();

// Ensure logs directory exists
try {
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
} catch (error) {
  console.warn('Could not create logs directory:', error.message);
}

const app = express();
const PORT = process.env.PORT || 8004;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Redis client for caching and queues
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Winston logger configuration
const transports = [
  new winston.transports.Console({
    format: winston.format.simple()
  })
];

// Add file transports if logs directory exists
if (fs.existsSync('logs')) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'notification-service' },
  transports: transports
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.connect();

// Email transporter setup
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Twilio client setup
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Queue setup for async processing
const emailQueue = new Queue('email processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

const smsQueue = new Queue('sms processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

const pushQueue = new Queue('push processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Middleware setup
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Token verification failed', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Email templates
const emailTemplates = {
  welcome: {
    subject: 'Welcome to {{appName}}!',
    html: `
      <h1>Welcome {{firstName}}!</h1>
      <p>Thank you for joining {{appName}}. We're excited to have you on board!</p>
      <p>Get started by exploring our features.</p>
      <p>Best regards,<br>The {{appName}} Team</p>
    `
  },
  orderConfirmation: {
    subject: 'Order Confirmation - {{orderNumber}}',
    html: `
      <h1>Order Confirmed!</h1>
      <p>Hi {{firstName}},</p>
      <p>Your order <strong>{{orderNumber}}</strong> has been confirmed.</p>
      <p><strong>Order Details:</strong></p>
      <ul>
        {{#each items}}
        <li>{{name}} - Qty: {{quantity}} - \${{price}}</li>
        {{/each}}
      </ul>
      <p><strong>Total: \${{totalAmount}}</strong></p>
      <p>We'll notify you when your order ships.</p>
      <p>Thank you for your business!</p>
    `
  },
  orderStatusUpdate: {
    subject: 'Order Update - {{orderNumber}}',
    html: `
      <h1>Order Status Update</h1>
      <p>Hi {{firstName}},</p>
      <p>Your order <strong>{{orderNumber}}</strong> status has been updated to: <strong>{{status}}</strong></p>
      {{#if trackingNumber}}
      <p>Tracking Number: <strong>{{trackingNumber}}</strong></p>
      {{/if}}
      {{#if notes}}
      <p>Notes: {{notes}}</p>
      {{/if}}
      <p>Thank you for your patience!</p>
    `
  },
  passwordReset: {
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>Hi {{firstName}},</p>
      <p>You requested a password reset for your account.</p>
      <p><a href="{{resetLink}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  }
};

// Compile Handlebars templates
const compiledTemplates = {};
Object.keys(emailTemplates).forEach(key => {
  compiledTemplates[key] = {
    subject: Handlebars.compile(emailTemplates[key].subject),
    html: Handlebars.compile(emailTemplates[key].html)
  };
});

// Notification storage
class NotificationStore {
  constructor() {
    this.notifications = new Map();
  }

  async save(notification) {
    const id = uuid.v4();
    notification.id = id;
    notification.createdAt = new Date();
    
    // Store in memory (in production, use database)
    this.notifications.set(id, notification);
    
    // Cache in Redis with TTL
    await redisClient.setEx(`notification:${id}`, 86400, JSON.stringify(notification));
    
    return notification;
  }

  async getById(id) {
    // Try Redis first
    try {
      const cached = await redisClient.get(`notification:${id}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error('Redis get error:', error);
    }
    
    // Fallback to memory
    return this.notifications.get(id);
  }

  async getByUserId(userId, limit = 50) {
    const userNotifications = [];
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId) {
        userNotifications.push(notification);
      }
    }
    
    return userNotifications
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  async markAsRead(id) {
    const notification = await this.getById(id);
    if (notification) {
      notification.read = true;
      notification.readAt = new Date();
      await this.save(notification);
    }
    return notification;
  }
}

const notificationStore = new NotificationStore();

// Email processing queue
emailQueue.process(async (job) => {
  const { to, template, data, options = {} } = job.data;
  
  try {
    const compiledTemplate = compiledTemplates[template];
    if (!compiledTemplate) {
      throw new Error(`Template '${template}' not found`);
    }

    const subject = compiledTemplate.subject(data);
    const html = compiledTemplate.html(data);
    const text = htmlToText(html);

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@example.com',
      to: to,
      subject: subject,
      html: html,
      text: text,
      ...options
    };

    const info = await emailTransporter.sendMail(mailOptions);
    
    logger.info('Email sent successfully', {
      messageId: info.messageId,
      to: to,
      template: template
    });

    // Save notification
    await notificationStore.save({
      userId: data.userId,
      type: 'email',
      template: template,
      recipient: to,
      subject: subject,
      status: 'sent',
      messageId: info.messageId,
      sentAt: new Date()
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Email sending failed', {
      error: error.message,
      to: to,
      template: template
    });

    // Save failed notification
    await notificationStore.save({
      userId: data.userId,
      type: 'email',
      template: template,
      recipient: to,
      status: 'failed',
      error: error.message,
      failedAt: new Date()
    });

    throw error;
  }
});

// SMS processing queue
smsQueue.process(async (job) => {
  const { to, message, userId } = job.data;
  
  if (!twilioClient) {
    throw new Error('Twilio not configured');
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    logger.info('SMS sent successfully', {
      sid: result.sid,
      to: to,
      status: result.status
    });

    // Save notification
    await notificationStore.save({
      userId: userId,
      type: 'sms',
      recipient: to,
      message: message,
      status: 'sent',
      providerSid: result.sid,
      sentAt: new Date()
    });

    return { success: true, sid: result.sid };
  } catch (error) {
    logger.error('SMS sending failed', {
      error: error.message,
      to: to
    });

    // Save failed notification
    await notificationStore.save({
      userId: userId,
      type: 'sms',
      recipient: to,
      message: message,
      status: 'failed',
      error: error.message,
      failedAt: new Date()
    });

    throw error;
  }
});

// Push notification processing queue
pushQueue.process(async (job) => {
  const { userId, title, body, data = {} } = job.data;
  
  try {
    // Emit to connected sockets for this user
    if (io) {
      io.to(`user_${userId}`).emit('notification', {
        title: title,
        body: body,
        data: data,
        timestamp: new Date()
      });
    }

    logger.info('Push notification sent', {
      userId: userId,
      title: title
    });

    // Save notification
    await notificationStore.save({
      userId: userId,
      type: 'push',
      title: title,
      body: body,
      data: data,
      status: 'sent',
      sentAt: new Date()
    });

    return { success: true };
  } catch (error) {
    logger.error('Push notification failed', {
      error: error.message,
      userId: userId,
      title: title
    });

    // Save failed notification
    await notificationStore.save({
      userId: userId,
      type: 'push',
      title: title,
      body: body,
      status: 'failed',
      error: error.message,
      failedAt: new Date()
    });

    throw error;
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      redis: redisClient.isReady,
      email: !!emailTransporter,
      sms: !!twilioClient
    }
  });
});

// Send email notification
app.post('/api/notifications/email', 
  authenticateToken,
  [
    body('to').isEmail().normalizeEmail(),
    body('template').isIn(Object.keys(emailTemplates)),
    body('data').isObject()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, template, data, options } = req.body;

    try {
      const job = await emailQueue.add('send-email', {
        to,
        template,
        data: { ...data, userId: req.user.userId },
        options
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      res.status(202).json({
        message: 'Email queued for delivery',
        jobId: job.id
      });
    } catch (error) {
      logger.error('Failed to queue email', error);
      res.status(500).json({ error: 'Failed to queue email' });
    }
  }
);

// Send SMS notification
app.post('/api/notifications/sms',
  authenticateToken,
  [
    body('to').isMobilePhone(),
    body('message').isLength({ min: 1, max: 1600 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, message } = req.body;

    try {
      const job = await smsQueue.add('send-sms', {
        to,
        message,
        userId: req.user.userId
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      res.status(202).json({
        message: 'SMS queued for delivery',
        jobId: job.id
      });
    } catch (error) {
      logger.error('Failed to queue SMS', error);
      res.status(500).json({ error: 'Failed to queue SMS' });
    }
  }
);

// Send push notification
app.post('/api/notifications/push',
  authenticateToken,
  [
    body('title').isLength({ min: 1, max: 100 }),
    body('body').isLength({ min: 1, max: 500 }),
    body('data').optional().isObject()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, body, data } = req.body;

    try {
      const job = await pushQueue.add('send-push', {
        userId: req.user.userId,
        title,
        body,
        data
      });

      res.status(202).json({
        message: 'Push notification queued for delivery',
        jobId: job.id
      });
    } catch (error) {
      logger.error('Failed to queue push notification', error);
      res.status(500).json({ error: 'Failed to queue push notification' });
    }
  }
);

// Get user notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const notifications = await notificationStore.getByUserId(
      req.user.userId, 
      parseInt(limit)
    );

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length
      }
    });
  } catch (error) {
    logger.error('Failed to get notifications', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await notificationStore.markAsRead(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    logger.error('Failed to mark notification as read', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Get notification templates
app.get('/api/notifications/templates', authenticateToken, (req, res) => {
  const templates = Object.keys(emailTemplates).map(key => ({
    name: key,
    subject: emailTemplates[key].subject,
    description: `Template for ${key} notifications`
  }));

  res.json({ templates });
});

// Bulk notification endpoint
app.post('/api/notifications/bulk',
  authenticateToken,
  [
    body('notifications').isArray({ min: 1, max: 100 }),
    body('notifications.*.type').isIn(['email', 'sms', 'push']),
    body('notifications.*.recipient').exists()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { notifications } = req.body;
    const results = [];

    try {
      for (const notification of notifications) {
        const { type, ...data } = notification;
        let job;

        switch (type) {
          case 'email':
            job = await emailQueue.add('send-email', data);
            break;
          case 'sms':
            job = await smsQueue.add('send-sms', data);
            break;
          case 'push':
            job = await pushQueue.add('send-push', data);
            break;
        }

        results.push({
          type,
          jobId: job.id,
          status: 'queued'
        });
      }

      res.status(202).json({
        message: 'Bulk notifications queued for delivery',
        results
      });
    } catch (error) {
      logger.error('Failed to queue bulk notifications', error);
      res.status(500).json({ error: 'Failed to queue bulk notifications' });
    }
  }
);

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  logger.info(`Notification Service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Setup Socket.IO for real-time notifications
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`User ${socket.userId} connected via WebSocket`);
  
  // Join user-specific room
  socket.join(`user_${socket.userId}`);

  socket.on('disconnect', () => {
    logger.info(`User ${socket.userId} disconnected from WebSocket`);
  });
});

// RabbitMQ setup for event consumption
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();

    // Listen for user events
    await channel.assertExchange('user_events', 'topic', { durable: true });
    const userQueue = await channel.assertQueue('notification_user_events', { durable: true });
    await channel.bindQueue(userQueue.queue, 'user_events', 'user.*');

    channel.consume(userQueue.queue, async (msg) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString());
          logger.info('Received user event:', event);

          // Handle different user events
          switch (msg.fields.routingKey) {
            case 'user.created':
              await emailQueue.add('send-email', {
                to: event.email,
                template: 'welcome',
                data: {
                  userId: event.user_id,
                  firstName: event.first_name || 'User',
                  appName: 'E-commerce Platform'
                }
              });
              break;
          }

          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to process user event:', error);
          channel.nack(msg, false, false);
        }
      }
    });

    // Listen for order events
    await channel.assertExchange('order_events', 'topic', { durable: true });
    const orderQueue = await channel.assertQueue('notification_order_events', { durable: true });
    await channel.bindQueue(orderQueue.queue, 'order_events', 'order.*');

    channel.consume(orderQueue.queue, async (msg) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString());
          logger.info('Received order event:', event);

          // Handle different order events
          switch (msg.fields.routingKey) {
            case 'order.created':
              // Send order confirmation email and push notification
              await Promise.all([
                emailQueue.add('send-email', {
                  to: event.customer_email,
                  template: 'orderConfirmation',
                  data: {
                    userId: event.user_id,
                    firstName: event.customer_name,
                    orderNumber: event.order_number,
                    items: event.items,
                    totalAmount: event.total_amount
                  }
                }),
                pushQueue.add('send-push', {
                  userId: event.user_id,
                  title: 'Order Confirmed',
                  body: `Your order ${event.order_number} has been confirmed!`,
                  data: { orderId: event.order_id, orderNumber: event.order_number }
                })
              ]);
              break;

            case 'order.status_updated':
              await Promise.all([
                emailQueue.add('send-email', {
                  to: event.customer_email,
                  template: 'orderStatusUpdate',
                  data: {
                    userId: event.user_id,
                    firstName: event.customer_name,
                    orderNumber: event.order_number,
                    status: event.status,
                    trackingNumber: event.tracking_number,
                    notes: event.notes
                  }
                }),
                pushQueue.add('send-push', {
                  userId: event.user_id,
                  title: 'Order Update',
                  body: `Your order ${event.order_number} is now ${event.status}`,
                  data: { orderId: event.order_id, status: event.status }
                })
              ]);
              break;
          }

          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to process order event:', error);
          channel.nack(msg, false, false);
        }
      }
    });

    logger.info('RabbitMQ consumers setup successfully');
  } catch (error) {
    logger.error('Failed to setup RabbitMQ:', error);
  }
}

// Initialize RabbitMQ consumers
setupRabbitMQ();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await emailQueue.close();
    await smsQueue.close();
    await pushQueue.close();
    await redisClient.quit();
    server.close();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

module.exports = { app, io };