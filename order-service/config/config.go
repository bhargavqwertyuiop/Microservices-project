package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application
type Config struct {
	// Server configuration
	Port        string
	Environment string
	
	// Database configuration
	MongoURI string
	
	// Cache configuration
	RedisURL string
	
	// Message Queue configuration
	RabbitMQURL string
	
	// External services
	UserServiceURL    string
	ProductServiceURL string
	
	// Security configuration
	JWTSecret string
	
	// Business configuration
	DefaultCurrency       string
	DefaultShippingCost   float64
	DefaultTaxRate        float64
	ReservationTimeout    int // minutes
	
	// Pagination defaults
	DefaultPageSize int
	MaxPageSize     int
}

// Load loads configuration from environment variables
func Load() *Config {
	// Load .env file if it exists
	_ = godotenv.Load()
	
	cfg := &Config{
		Port:        getEnv("PORT", "8003"),
		Environment: getEnv("ENVIRONMENT", "development"),
		
		MongoURI:    getEnv("MONGODB_URI", "mongodb://localhost:27017/orderdb"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		
		UserServiceURL:    getEnv("USER_SERVICE_URL", "http://localhost:8001"),
		ProductServiceURL: getEnv("PRODUCT_SERVICE_URL", "http://localhost:8002"),
		
		JWTSecret: getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
		
		DefaultCurrency:     getEnv("DEFAULT_CURRENCY", "USD"),
		DefaultShippingCost: getEnvFloat("DEFAULT_SHIPPING_COST", 9.99),
		DefaultTaxRate:      getEnvFloat("DEFAULT_TAX_RATE", 0.08),
		ReservationTimeout:  getEnvInt("RESERVATION_TIMEOUT", 15),
		
		DefaultPageSize: getEnvInt("DEFAULT_PAGE_SIZE", 20),
		MaxPageSize:     getEnvInt("MAX_PAGE_SIZE", 100),
	}
	
	return cfg
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt gets an environment variable as integer with a default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// getEnvFloat gets an environment variable as float64 with a default value
func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if floatValue, err := strconv.ParseFloat(value, 64); err == nil {
			return floatValue
		}
	}
	return defaultValue
}

// getEnvBool gets an environment variable as boolean with a default value
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}