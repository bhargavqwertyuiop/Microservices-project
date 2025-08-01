package database

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"github.com/redis/go-redis/v9"
	"github.com/rabbitmq/amqp091-go"
)

// NewMongoClient creates a new MongoDB client
func NewMongoClient(mongoURI string) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		return nil, err
	}
	
	// Ping the database
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	
	return client, nil
}

// NewRedisClient creates a new Redis client
func NewRedisClient(redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	
	client := redis.NewClient(opts)
	
	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	_, err = client.Ping(ctx).Result()
	if err != nil {
		return nil, err
	}
	
	return client, nil
}

// NewRabbitMQClient creates a new RabbitMQ connection
func NewRabbitMQClient(rabbitMQURL string) (*amqp091.Connection, error) {
	conn, err := amqp091.Dial(rabbitMQURL)
	if err != nil {
		return nil, err
	}
	
	return conn, nil
}