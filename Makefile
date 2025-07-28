# Microservices Development Makefile

.PHONY: help build start stop restart logs clean test lint format install-deps migrate seed backup restore scale

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Development Commands
install-deps: ## Install dependencies for all services
	@echo "Installing dependencies for all services..."
	cd api-gateway && npm install
	cd user-service && pip install -r requirements.txt
	cd product-service && ./mvnw dependency:resolve
	cd order-service && go mod tidy
	cd notification-service && npm install

build: ## Build all Docker images
	@echo "Building all services..."
	docker-compose build

start: ## Start all services
	@echo "Starting all services..."
	docker-compose up -d

stop: ## Stop all services
	@echo "Stopping all services..."
	docker-compose down

restart: ## Restart all services
	@echo "Restarting all services..."
	docker-compose restart

logs: ## View logs from all services
	docker-compose logs -f

clean: ## Clean up containers, networks, and volumes
	@echo "Cleaning up..."
	docker-compose down -v --remove-orphans
	docker system prune -f

# Development Helpers
dev-start: ## Start services in development mode
	docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

dev-logs: ## Follow development logs
	docker-compose logs -f api-gateway user-service notification-service

# Database Operations
migrate: ## Run database migrations
	@echo "Running migrations..."
	docker-compose exec user-service alembic upgrade head
	docker-compose exec product-service ./mvnw flyway:migrate

seed: ## Seed databases with sample data
	@echo "Seeding databases..."
	# Add seed commands here
	@echo "Database seeding completed"

backup: ## Backup all databases
	@echo "Creating database backups..."
	mkdir -p backups
	docker-compose exec postgres pg_dump -U postgres userdb > backups/user_db_$(shell date +%Y%m%d_%H%M%S).sql
	docker-compose exec mysql mysqldump -u mysql -pmysql123 productdb > backups/product_db_$(shell date +%Y%m%d_%H%M%S).sql
	docker-compose exec mongodb mongodump --db orderdb --out backups/order_db_$(shell date +%Y%m%d_%H%M%S)/

restore: ## Restore databases from backup (specify BACKUP_DATE=YYYYMMDD_HHMMSS)
	@if [ -z "$(BACKUP_DATE)" ]; then echo "Please specify BACKUP_DATE=YYYYMMDD_HHMMSS"; exit 1; fi
	@echo "Restoring databases from $(BACKUP_DATE)..."
	docker-compose exec -T postgres psql -U postgres userdb < backups/user_db_$(BACKUP_DATE).sql
	docker-compose exec -T mysql mysql -u mysql -pmysql123 productdb < backups/product_db_$(BACKUP_DATE).sql
	docker-compose exec mongodb mongorestore --db orderdb backups/order_db_$(BACKUP_DATE)/orderdb/

# Testing
test: ## Run tests for all services
	@echo "Running tests..."
	cd user-service && python -m pytest
	cd product-service && ./mvnw test
	cd order-service && go test ./...
	cd notification-service && npm test

lint: ## Run linters for all services
	@echo "Running linters..."
	cd api-gateway && npm run lint
	cd user-service && flake8 .
	cd product-service && ./mvnw checkstyle:check
	cd order-service && golangci-lint run
	cd notification-service && npm run lint

format: ## Format code for all services
	@echo "Formatting code..."
	cd api-gateway && npm run format || true
	cd user-service && black . && isort .
	cd product-service && ./mvnw fmt:format || true
	cd order-service && gofmt -w .
	cd notification-service && npm run format || true

# Production Commands
prod-build: ## Build production images
	@echo "Building production images..."
	docker-compose -f docker-compose.yml build

prod-start: ## Start production environment
	@echo "Starting production environment..."
	docker-compose -f docker-compose.yml up -d

prod-stop: ## Stop production environment
	@echo "Stopping production environment..."
	docker-compose -f docker-compose.yml down

# Scaling
scale: ## Scale services (usage: make scale SERVICE=api-gateway REPLICAS=3)
	@if [ -z "$(SERVICE)" ] || [ -z "$(REPLICAS)" ]; then echo "Usage: make scale SERVICE=service-name REPLICAS=number"; exit 1; fi
	docker-compose up -d --scale $(SERVICE)=$(REPLICAS)

# Monitoring
monitor: ## Open monitoring dashboards
	@echo "Opening monitoring dashboards..."
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana: http://localhost:3001 (admin/admin123)"
	@echo "Kibana: http://localhost:5601"
	@echo "RabbitMQ: http://localhost:15672 (rabbit/rabbit123)"

# Health Checks
health: ## Check health of all services
	@echo "Checking service health..."
	@curl -s http://localhost:3000/health | jq '.status' || echo "API Gateway: DOWN"
	@curl -s http://localhost:8001/health | jq '.status' || echo "User Service: DOWN"
	@curl -s http://localhost:8002/actuator/health | jq '.status' || echo "Product Service: DOWN"
	@curl -s http://localhost:8003/health | jq '.status' || echo "Order Service: DOWN"
	@curl -s http://localhost:8004/health | jq '.status' || echo "Notification Service: DOWN"

# Certificates (for production)
certs: ## Generate SSL certificates for nginx
	@echo "Generating SSL certificates..."
	mkdir -p nginx/ssl
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout nginx/ssl/key.pem \
		-out nginx/ssl/cert.pem \
		-subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Load Testing
load-test: ## Run load tests
	@echo "Running load tests..."
	@which artillery || (echo "Installing artillery..." && npm install -g artillery)
	# artillery run load-test/api-gateway.yml

# Environment Setup
env: ## Copy environment example files
	@echo "Setting up environment files..."
	cp .env.example .env
	cp api-gateway/.env.example api-gateway/.env || true
	cp user-service/.env.example user-service/.env || true
	cp product-service/.env.example product-service/.env || true
	cp order-service/.env.example order-service/.env || true
	cp notification-service/.env.example notification-service/.env || true

# Documentation
docs: ## Generate API documentation
	@echo "Generating API documentation..."
	@echo "Swagger UI available at:"
	@echo "- User Service: http://localhost:8001/docs"
	@echo "- Product Service: http://localhost:8002/swagger-ui.html"
	@echo "- Order Service: http://localhost:8003/swagger/index.html"

# Quick Setup (for new developers)
setup: env install-deps build start migrate ## Complete setup for new developers
	@echo ""
	@echo "🎉 Setup complete! Your microservices are running:"
	@echo ""
	@echo "📋 Services:"
	@echo "  - API Gateway: http://localhost:3000"
	@echo "  - User Service: http://localhost:8001"
	@echo "  - Product Service: http://localhost:8002"
	@echo "  - Order Service: http://localhost:8003"
	@echo "  - Notification Service: http://localhost:8004"
	@echo ""
	@echo "📊 Monitoring:"
	@echo "  - Prometheus: http://localhost:9090"
	@echo "  - Grafana: http://localhost:3001 (admin/admin123)"
	@echo "  - Kibana: http://localhost:5601"
	@echo "  - RabbitMQ: http://localhost:15672 (rabbit/rabbit123)"
	@echo ""
	@echo "🛠️  Next steps:"
	@echo "  - Run 'make health' to check service status"
	@echo "  - Run 'make logs' to view service logs"
	@echo "  - Run 'make test' to run all tests"
	@echo ""