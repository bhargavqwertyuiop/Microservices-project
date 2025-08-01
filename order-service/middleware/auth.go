package middleware

import (
	"net/http"
	"time"
	
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.uber.org/zap"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "endpoint", "status"},
	)
	
	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "http_request_duration_seconds",
			Help: "HTTP request duration in seconds",
		},
		[]string{"method", "endpoint"},
	)
)

// AuthRequired handles authentication requirement
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Placeholder authentication logic
		// In a real implementation, you would validate JWT tokens, API keys, etc.
		
		// For now, just pass through
		c.Next()
	}
}

// AdminRequired handles admin authorization requirement
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Placeholder admin authorization logic
		// In a real implementation, you would check if the user has admin role
		
		// For now, just pass through
		c.Next()
	}
}

// Logger creates a logger middleware
func Logger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		
		c.Next()
		
		end := time.Now()
		latency := end.Sub(start)
		
		if raw != "" {
			path = path + "?" + raw
		}
		
		logger.Info("Request",
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", latency),
			zap.String("ip", c.ClientIP()),
		)
	}
}

// Metrics creates a metrics middleware
func Metrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		
		c.Next()
		
		duration := time.Since(start).Seconds()
		status := c.Writer.Status()
		
		httpRequestsTotal.WithLabelValues(
			c.Request.Method,
			c.FullPath(),
			http.StatusText(status),
		).Inc()
		
		httpRequestDuration.WithLabelValues(
			c.Request.Method,
			c.FullPath(),
		).Observe(duration)
	}
}

// CORS creates a CORS middleware
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		
		c.Next()
	}
}