package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"order-service/config"
	"order-service/controllers"
	"order-service/database"
	"order-service/middleware"
	"order-service/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	ginSwagger "github.com/swaggo/gin-swagger"
	swaggerFiles "github.com/swaggo/files"
	"go.uber.org/zap"
)

// @title Order Service API
// @version 1.0
// @description E-commerce Order Management Service
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.swagger.io/support
// @contact.email support@swagger.io

// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html

// @host localhost:8003
// @BasePath /api
// @schemes http https

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatal("Failed to initialize logger:", err)
	}
	defer logger.Sync()

	// Initialize database
	db, err := database.NewMongoClient(cfg.MongoURI)
	if err != nil {
		logger.Fatal("Failed to connect to MongoDB", zap.Error(err))
	}
	defer db.Disconnect(context.Background())

	// Initialize Redis
	redisClient, err := database.NewRedisClient(cfg.RedisURL)
	if err != nil {
		logger.Fatal("Failed to connect to Redis", zap.Error(err))
	}
	defer redisClient.Close()

	// Initialize RabbitMQ
	rabbitmq, err := database.NewRabbitMQClient(cfg.RabbitMQURL)
	if err != nil {
		logger.Fatal("Failed to connect to RabbitMQ", zap.Error(err))
	}
	defer rabbitmq.Close()

	// Initialize services
	orderService := services.NewOrderService(db, redisClient, rabbitmq, logger, cfg)
	
	// Initialize controllers
	orderController := controllers.NewOrderController(orderService, logger)

	// Setup Gin
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Metrics())
	router.Use(middleware.CORS())

	// CORS configuration
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:8080"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().Unix(),
			"service":   "order-service",
			"version":   "1.0.0",
		})
	})

	// Metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// API routes
	api := router.Group("/api")
	{
		orders := api.Group("/orders")
		{
			orders.Use(middleware.AuthRequired())
			orders.GET("", orderController.GetOrders)
			orders.GET("/:id", orderController.GetOrderByID)
			orders.POST("", orderController.CreateOrder)
			orders.PUT("/:id", orderController.UpdateOrder)
			orders.DELETE("/:id", orderController.CancelOrder)
			orders.PUT("/:id/status", orderController.UpdateOrderStatus)
			orders.GET("/user/:userId", orderController.GetOrdersByUserID)
		}

		// Admin routes
		admin := api.Group("/admin")
		{
			admin.Use(middleware.AuthRequired())
			admin.Use(middleware.AdminRequired())
			admin.GET("/orders", orderController.GetAllOrdersAdmin)
			admin.GET("/orders/stats", orderController.GetOrderStats)
			admin.GET("/orders/export", orderController.ExportOrders)
		}
	}

	// Swagger documentation
	if cfg.Environment != "production" {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	// Setup HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logger.Info("Starting Order Service", 
			zap.String("port", cfg.Port),
			zap.String("environment", cfg.Environment))
		
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exiting")
}