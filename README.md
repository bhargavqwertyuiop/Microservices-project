# Production-Ready Microservices E-commerce Platform

A comprehensive, production-level microservices application built with different technology stacks for each service, demonstrating modern software architecture patterns and best practices.

## 🏗️ Architecture Overview

This application consists of multiple microservices, each built with different technologies to showcase polyglot architecture:

### Services

1. **API Gateway** (Node.js/Express)
   - Central entry point for all client requests
   - Authentication, rate limiting, and request routing
   - Circuit breaker pattern implementation
   - Metrics and logging

2. **User Service** (Python/FastAPI)
   - User management and authentication
   - PostgreSQL database
   - Redis caching
   - JWT token management

3. **Product Service** (Java/Spring Boot)
   - Product catalog management
   - MySQL database
   - Redis caching
   - Search and filtering capabilities

4. **Order Service** (Go/Gin)
   - Order processing and management
   - MongoDB database
   - Inventory management
   - Order state machine

5. **Notification Service** (Node.js/Express)
   - Email, SMS, and push notifications
   - Template-based messaging
   - Real-time WebSocket notifications
   - Queue-based async processing

### Infrastructure

- **Load Balancer**: Nginx with SSL termination
- **Message Queue**: RabbitMQ for event-driven communication
- **Caching**: Redis for session management and caching
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Containerization**: Docker with multi-stage builds

## 🚀 Features

### Production-Ready Features

- **Scalability**: Horizontal scaling support
- **High Availability**: Health checks and auto-restart
- **Security**: JWT authentication, rate limiting, CORS
- **Monitoring**: Comprehensive metrics and alerting
- **Logging**: Structured logging across all services
- **Error Handling**: Graceful error handling and recovery
- **API Documentation**: Swagger/OpenAPI documentation
- **Data Persistence**: Multiple database types
- **Caching**: Redis-based caching strategy
- **Message Queue**: Event-driven architecture
- **Load Balancing**: Nginx reverse proxy

### Business Features

- **User Management**: Registration, authentication, profile management
- **Product Catalog**: Product CRUD, search, categories, inventory
- **Order Processing**: Cart management, order placement, status tracking
- **Notifications**: Email, SMS, push notifications
- **Real-time Updates**: WebSocket-based notifications

## 🛠️ Technology Stack

| Service | Language/Framework | Database | Key Technologies |
|---------|-------------------|----------|------------------|
| API Gateway | Node.js/Express | Redis | JWT, Circuit Breaker, Rate Limiting |
| User Service | Python/FastAPI | PostgreSQL | SQLAlchemy, Pydantic, Redis |
| Product Service | Java/Spring Boot | MySQL | JPA/Hibernate, Redis, MapStruct |
| Order Service | Go/Gin | MongoDB | Go Modules, Redis, GORM |
| Notification Service | Node.js/Express | Redis | Bull Queue, Socket.IO, Nodemailer |

### Infrastructure Technologies

- **Container Orchestration**: Docker Compose
- **Load Balancer**: Nginx
- **Message Broker**: RabbitMQ
- **Monitoring**: Prometheus, Grafana
- **Logging**: ELK Stack
- **Caching**: Redis
- **Security**: JWT, Helmet, CORS

## 📦 Quick Start

### Prerequisites

- Docker and Docker Compose
- Git
- At least 8GB RAM and 4 CPU cores

### 1. Clone the Repository

```bash
git clone <repository-url>
cd microservices-platform
```

### 2. Environment Setup

Create environment files for each service (optional - defaults are provided):

```bash
# API Gateway
cp api-gateway/.env.example api-gateway/.env

# User Service
cp user-service/.env.example user-service/.env

# Product Service  
cp product-service/.env.example product-service/.env

# Order Service
cp order-service/.env.example order-service/.env

# Notification Service
cp notification-service/.env.example notification-service/.env
```

### 3. Start the Application

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service health
docker-compose ps
```

### 4. Access the Services

| Service | URL | Description |
|---------|-----|-------------|
| API Gateway | http://localhost:3000 | Main API endpoint |
| User Service | http://localhost:8001 | Direct user service access |
| Product Service | http://localhost:8002 | Direct product service access |
| Order Service | http://localhost:8003 | Direct order service access |
| Notification Service | http://localhost:8004 | Direct notification service access |
| Prometheus | http://localhost:9090 | Metrics monitoring |
| Grafana | http://localhost:3001 | Dashboards (admin/admin123) |
| Kibana | http://localhost:5601 | Log analysis |
| RabbitMQ Management | http://localhost:15672 | Message queue (rabbit/rabbit123) |

## 📚 API Documentation

### Authentication

All protected endpoints require JWT authentication:

```bash
# Register a new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "first_name": "John",
    "last_name": "Doe"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### Example API Calls

```bash
# Get products
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/products

# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"product_id": 1, "quantity": 2}
    ],
    "shipping_address": {
      "first_name": "John",
      "last_name": "Doe",
      "address_line": "123 Main St",
      "city": "City",
      "state": "State",
      "postal_code": "12345",
      "country": "US"
    },
    "payment_method": "credit_card",
    "currency": "USD"
  }'
```

## 🔧 Development

### Running Individual Services

Each service can be run independently for development:

```bash
# User Service (Python)
cd user-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Product Service (Java)
cd product-service
./mvnw spring-boot:run

# Order Service (Go)
cd order-service
go mod tidy
go run main.go

# Notification Service (Node.js)
cd notification-service
npm install
npm run dev
```

### Database Migrations

Services with databases include migration support:

```bash
# User Service migrations
cd user-service
alembic upgrade head

# Product Service migrations
cd product-service
./mvnw flyway:migrate
```

### Testing

```bash
# Run tests for all services
docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# Individual service tests
cd user-service && python -m pytest
cd product-service && ./mvnw test
cd order-service && go test ./...
cd notification-service && npm test
```

## 📊 Monitoring and Observability

### Metrics

- **Prometheus**: Collects metrics from all services
- **Grafana**: Visualizes metrics with pre-configured dashboards
- **Custom Metrics**: Each service exposes business and technical metrics

### Logging

- **Structured Logging**: JSON-formatted logs across all services
- **Centralized Logging**: ELK stack for log aggregation
- **Log Levels**: Configurable log levels per service

### Health Checks

All services implement health check endpoints:

```bash
# Check service health
curl http://localhost:3000/health
curl http://localhost:8001/health
curl http://localhost:8002/actuator/health
curl http://localhost:8003/health
curl http://localhost:8004/health
```

### Tracing

- **Request ID**: Correlation IDs across service calls
- **Performance Monitoring**: Request duration and error rates

## 🔒 Security

### Authentication & Authorization

- **JWT Tokens**: Stateless authentication
- **Role-based Access**: Admin and user roles
- **Token Refresh**: Automatic token renewal

### Security Headers

- **CORS**: Cross-origin request control
- **Helmet**: Security headers middleware
- **Rate Limiting**: API abuse prevention

### Data Protection

- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Comprehensive request validation
- **SQL Injection Prevention**: Parameterized queries

## 🚀 Deployment

### Production Deployment

1. **Environment Configuration**:
   ```bash
   # Set production environment variables
   export NODE_ENV=production
   export SPRING_PROFILES_ACTIVE=production
   ```

2. **Database Setup**:
   ```bash
   # Run migrations
   docker-compose exec user-service alembic upgrade head
   docker-compose exec product-service ./mvnw flyway:migrate
   ```

3. **SSL Certificates**:
   ```bash
   # Generate SSL certificates for nginx
   mkdir -p nginx/ssl
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem
   ```

### Scaling

```bash
# Scale specific services
docker-compose up -d --scale api-gateway=3
docker-compose up -d --scale product-service=2
docker-compose up -d --scale order-service=2
```

### Backup Strategy

```bash
# Database backups
docker-compose exec postgres pg_dump -U postgres userdb > backup_user.sql
docker-compose exec mysql mysqldump -u mysql -p productdb > backup_product.sql
docker-compose exec mongodb mongodump --db orderdb --out /backup/
```

## 🐛 Troubleshooting

### Common Issues

1. **Port Conflicts**:
   ```bash
   # Check port usage
   netstat -tulpn | grep :3000
   ```

2. **Memory Issues**:
   ```bash
   # Increase Docker memory limit
   # Docker Desktop: Settings > Resources > Memory
   ```

3. **Service Connectivity**:
   ```bash
   # Check service logs
   docker-compose logs service-name
   
   # Test service connectivity
   docker-compose exec api-gateway ping user-service
   ```

### Performance Optimization

1. **Database Indexing**: Review and optimize database indexes
2. **Caching Strategy**: Implement Redis caching for frequently accessed data
3. **Connection Pooling**: Configure appropriate connection pool sizes

## 📈 Performance Benchmarks

### Load Testing

```bash
# Install artillery for load testing
npm install -g artillery

# Run load tests
artillery run load-test/api-gateway.yml
artillery run load-test/user-service.yml
```

### Expected Performance

- **Throughput**: 1000+ requests/second per service
- **Latency**: < 100ms for 95th percentile
- **Availability**: 99.9% uptime

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards

- **Linting**: Each service has configured linters
- **Testing**: Maintain test coverage > 80%
- **Documentation**: Update documentation for new features

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Spring Boot community for excellent documentation
- FastAPI for modern Python web framework
- Gin framework for Go web development
- Express.js for Node.js applications
- Docker for containerization platform

## 📞 Support

For support and questions:

- Open an issue in the repository
- Check the troubleshooting section
- Review service logs for error details

---

**Built with ❤️ for production-ready microservices architecture**