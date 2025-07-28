const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const winston = require('winston');
const promClient = require('prom-client');
const promMiddleware = require('express-prometheus-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Redis client for caching and rate limiting
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.connect();

// Winston logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
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

// Prometheus metrics middleware
app.use(promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10]
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new (require('rate-limit-redis'))({
    client: redisClient,
    prefix: 'rl:'
  })
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
    
    httpRequestDuration
      .labels(req.method, req.route?.path || req.url, res.statusCode)
      .observe(duration / 1000);
  });
  
  next();
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token is invalid' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Token verification failed', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Service endpoints configuration
const services = {
  user: {
    target: process.env.USER_SERVICE_URL || 'http://localhost:8001',
    changeOrigin: true,
    pathRewrite: { '^/api/users': '' },
    timeout: 30000,
    retries: 3
  },
  product: {
    target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:8002',
    changeOrigin: true,
    pathRewrite: { '^/api/products': '' },
    timeout: 30000,
    retries: 3
  },
  order: {
    target: process.env.ORDER_SERVICE_URL || 'http://localhost:8003',
    changeOrigin: true,
    pathRewrite: { '^/api/orders': '' },
    timeout: 30000,
    retries: 3
  },
  notification: {
    target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8004',
    changeOrigin: true,
    pathRewrite: { '^/api/notifications': '' },
    timeout: 30000,
    retries: 3
  }
};

// Circuit breaker for service calls
const circuitBreakerStates = {};

const circuitBreakerMiddleware = (serviceName) => {
  return (req, res, next) => {
    const state = circuitBreakerStates[serviceName] || { failures: 0, lastFailure: null, isOpen: false };
    
    if (state.isOpen && Date.now() - state.lastFailure < 60000) { // 1 minute circuit breaker
      return res.status(503).json({ error: `${serviceName} service temporarily unavailable` });
    }
    
    req.circuitBreakerState = state;
    req.serviceName = serviceName;
    next();
  };
};

// Error handling for proxy
const onProxyError = (err, req, res, serviceName) => {
  const state = circuitBreakerStates[serviceName] || { failures: 0, lastFailure: null, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= 5) {
    state.isOpen = true;
    setTimeout(() => {
      state.isOpen = false;
      state.failures = 0;
    }, 60000);
  }
  
  circuitBreakerStates[serviceName] = state;
  
  logger.error(`Proxy error for ${serviceName}:`, err);
  res.status(502).json({ error: 'Service temporarily unavailable' });
};

// Proxy setup for each service
Object.keys(services).forEach(serviceName => {
  const serviceConfig = services[serviceName];
  
  app.use(
    `/api/${serviceName === 'user' ? 'users' : serviceName === 'product' ? 'products' : serviceName === 'order' ? 'orders' : 'notifications'}`,
    circuitBreakerMiddleware(serviceName),
    createProxyMiddleware({
      ...serviceConfig,
      onError: (err, req, res) => onProxyError(err, req, res, serviceName),
      onProxyRes: (proxyRes, req, res) => {
        // Reset circuit breaker on successful response
        if (proxyRes.statusCode < 500) {
          const state = circuitBreakerStates[req.serviceName];
          if (state) {
            state.failures = 0;
            state.isOpen = false;
          }
        }
      }
    })
  );
});

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    // Forward to user service for authentication
    const response = await fetch(`${services.user.target}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Generate JWT token
      const token = jwt.sign(
        { userId: data.user.id, email: data.user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      // Cache user session
      await redisClient.setEx(`session:${data.user.id}`, 86400, JSON.stringify(data.user));
      
      res.json({
        token,
        user: data.user,
        expiresIn: '24h'
      });
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization'].split(' ')[1];
    
    // Blacklist the token
    await redisClient.setEx(`blacklist:${token}`, 86400, 'blacklisted');
    
    // Remove user session
    await redisClient.del(`session:${req.user.userId}`);
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Protected routes (require authentication)
app.use('/api/orders', authenticateToken);
app.use('/api/notifications', authenticateToken);

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Microservices API Gateway',
    version: '1.0.0',
    endpoints: {
      authentication: {
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout'
      },
      services: {
        users: 'GET,POST,PUT,DELETE /api/users/*',
        products: 'GET,POST,PUT,DELETE /api/products/*',
        orders: 'GET,POST,PUT,DELETE /api/orders/* (protected)',
        notifications: 'GET,POST /api/notifications/* (protected)'
      },
      monitoring: {
        health: 'GET /health',
        metrics: 'GET /metrics'
      }
    }
  });
});

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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});