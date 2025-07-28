package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// OrderStatus represents the status of an order
type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "pending"
	OrderStatusConfirmed  OrderStatus = "confirmed"
	OrderStatusProcessing OrderStatus = "processing"
	OrderStatusShipped    OrderStatus = "shipped"
	OrderStatusDelivered  OrderStatus = "delivered"
	OrderStatusCancelled  OrderStatus = "cancelled"
	OrderStatusRefunded   OrderStatus = "refunded"
)

// PaymentStatus represents the payment status of an order
type PaymentStatus string

const (
	PaymentStatusPending   PaymentStatus = "pending"
	PaymentStatusPaid      PaymentStatus = "paid"
	PaymentStatusFailed    PaymentStatus = "failed"
	PaymentStatusRefunded  PaymentStatus = "refunded"
	PaymentStatusCancelled PaymentStatus = "cancelled"
)

// OrderItem represents an item in an order
type OrderItem struct {
	ProductID   int64   `json:"product_id" bson:"product_id" validate:"required"`
	SKU         string  `json:"sku" bson:"sku" validate:"required"`
	Name        string  `json:"name" bson:"name" validate:"required"`
	Quantity    int     `json:"quantity" bson:"quantity" validate:"required,min=1"`
	Price       float64 `json:"price" bson:"price" validate:"required,min=0"`
	TotalPrice  float64 `json:"total_price" bson:"total_price"`
	ImageURL    string  `json:"image_url,omitempty" bson:"image_url,omitempty"`
}

// ShippingAddress represents a shipping address
type ShippingAddress struct {
	FirstName   string `json:"first_name" bson:"first_name" validate:"required"`
	LastName    string `json:"last_name" bson:"last_name" validate:"required"`
	AddressLine string `json:"address_line" bson:"address_line" validate:"required"`
	City        string `json:"city" bson:"city" validate:"required"`
	State       string `json:"state" bson:"state" validate:"required"`
	PostalCode  string `json:"postal_code" bson:"postal_code" validate:"required"`
	Country     string `json:"country" bson:"country" validate:"required"`
	Phone       string `json:"phone,omitempty" bson:"phone,omitempty"`
}

// PaymentInfo represents payment information
type PaymentInfo struct {
	Method          string        `json:"method" bson:"method" validate:"required"`
	Status          PaymentStatus `json:"status" bson:"status"`
	TransactionID   string        `json:"transaction_id,omitempty" bson:"transaction_id,omitempty"`
	PaymentDate     *time.Time    `json:"payment_date,omitempty" bson:"payment_date,omitempty"`
	Amount          float64       `json:"amount" bson:"amount"`
	Currency        string        `json:"currency" bson:"currency" validate:"required"`
	ProcessorRef    string        `json:"processor_ref,omitempty" bson:"processor_ref,omitempty"`
}

// OrderTracking represents order tracking information
type OrderTracking struct {
	Status      OrderStatus `json:"status" bson:"status"`
	UpdatedAt   time.Time   `json:"updated_at" bson:"updated_at"`
	UpdatedBy   string      `json:"updated_by,omitempty" bson:"updated_by,omitempty"`
	Notes       string      `json:"notes,omitempty" bson:"notes,omitempty"`
	TrackingNum string      `json:"tracking_number,omitempty" bson:"tracking_number,omitempty"`
	Carrier     string      `json:"carrier,omitempty" bson:"carrier,omitempty"`
}

// Order represents a customer order
type Order struct {
	ID              primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	OrderNumber     string             `json:"order_number" bson:"order_number" validate:"required"`
	UserID          int64              `json:"user_id" bson:"user_id" validate:"required"`
	Status          OrderStatus        `json:"status" bson:"status"`
	Items           []OrderItem        `json:"items" bson:"items" validate:"required,dive"`
	SubTotal        float64            `json:"subtotal" bson:"subtotal"`
	ShippingCost    float64            `json:"shipping_cost" bson:"shipping_cost"`
	TaxAmount       float64            `json:"tax_amount" bson:"tax_amount"`
	DiscountAmount  float64            `json:"discount_amount" bson:"discount_amount"`
	TotalAmount     float64            `json:"total_amount" bson:"total_amount"`
	Currency        string             `json:"currency" bson:"currency" validate:"required"`
	ShippingAddress ShippingAddress    `json:"shipping_address" bson:"shipping_address" validate:"required"`
	PaymentInfo     PaymentInfo        `json:"payment_info" bson:"payment_info" validate:"required"`
	Tracking        []OrderTracking    `json:"tracking" bson:"tracking"`
	Notes           string             `json:"notes,omitempty" bson:"notes,omitempty"`
	CreatedAt       time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at" bson:"updated_at"`
}

// OrderRequest represents a request to create an order
type OrderRequest struct {
	Items           []OrderItemRequest `json:"items" validate:"required,dive"`
	ShippingAddress ShippingAddress    `json:"shipping_address" validate:"required"`
	PaymentMethod   string             `json:"payment_method" validate:"required"`
	Currency        string             `json:"currency" validate:"required"`
	Notes           string             `json:"notes,omitempty"`
}

// OrderItemRequest represents an item in an order request
type OrderItemRequest struct {
	ProductID int `json:"product_id" validate:"required"`
	Quantity  int `json:"quantity" validate:"required,min=1"`
}

// OrderResponse represents the response when fetching orders
type OrderResponse struct {
	Orders      []Order `json:"orders"`
	TotalCount  int64   `json:"total_count"`
	Page        int     `json:"page"`
	PageSize    int     `json:"page_size"`
	TotalPages  int     `json:"total_pages"`
}

// OrderStatusUpdate represents a request to update order status
type OrderStatusUpdate struct {
	Status      OrderStatus `json:"status" validate:"required"`
	Notes       string      `json:"notes,omitempty"`
	TrackingNum string      `json:"tracking_number,omitempty"`
	Carrier     string      `json:"carrier,omitempty"`
}

// OrderStats represents order statistics
type OrderStats struct {
	TotalOrders         int64              `json:"total_orders"`
	TotalRevenue        float64            `json:"total_revenue"`
	OrdersByStatus      map[string]int64   `json:"orders_by_status"`
	RevenueByMonth      map[string]float64 `json:"revenue_by_month"`
	TopProducts         []ProductStat      `json:"top_products"`
	AverageOrderValue   float64            `json:"average_order_value"`
	OrdersToday         int64              `json:"orders_today"`
	RevenueToday        float64            `json:"revenue_today"`
}

// ProductStat represents product statistics
type ProductStat struct {
	ProductID    int64   `json:"product_id"`
	SKU          string  `json:"sku"`
	Name         string  `json:"name"`
	TotalSold    int     `json:"total_sold"`
	TotalRevenue float64 `json:"total_revenue"`
}

// OrderEvent represents an order event for messaging
type OrderEvent struct {
	EventType   string      `json:"event_type"`
	OrderID     string      `json:"order_id"`
	OrderNumber string      `json:"order_number"`
	UserID      int64       `json:"user_id"`
	Status      OrderStatus `json:"status"`
	TotalAmount float64     `json:"total_amount"`
	Currency    string      `json:"currency"`
	Items       []OrderItem `json:"items"`
	Timestamp   time.Time   `json:"timestamp"`
}

// InventoryReservation represents inventory reservation for order processing
type InventoryReservation struct {
	OrderID         string                    `json:"order_id"`
	UserID          int64                     `json:"user_id"`
	Items           []InventoryReservationItem `json:"items"`
	ExpiresAt       time.Time                 `json:"expires_at"`
	Status          string                    `json:"status"` // pending, confirmed, cancelled
	CreatedAt       time.Time                 `json:"created_at"`
}

// InventoryReservationItem represents an item in inventory reservation
type InventoryReservationItem struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
	Reserved  bool `json:"reserved"`
}

// Method to calculate total for order item
func (oi *OrderItem) CalculateTotal() {
	oi.TotalPrice = oi.Price * float64(oi.Quantity)
}

// Method to calculate order totals
func (o *Order) CalculateTotals() {
	o.SubTotal = 0
	for i := range o.Items {
		o.Items[i].CalculateTotal()
		o.SubTotal += o.Items[i].TotalPrice
	}
	
	o.TotalAmount = o.SubTotal + o.ShippingCost + o.TaxAmount - o.DiscountAmount
}

// Method to add tracking info
func (o *Order) AddTracking(status OrderStatus, notes, updatedBy string) {
	tracking := OrderTracking{
		Status:    status,
		UpdatedAt: time.Now(),
		UpdatedBy: updatedBy,
		Notes:     notes,
	}
	o.Tracking = append(o.Tracking, tracking)
	o.Status = status
	o.UpdatedAt = time.Now()
}

// Method to validate order status transition
func (o *Order) CanTransitionTo(newStatus OrderStatus) bool {
	currentStatus := o.Status
	
	// Define valid transitions
	validTransitions := map[OrderStatus][]OrderStatus{
		OrderStatusPending: {OrderStatusConfirmed, OrderStatusCancelled},
		OrderStatusConfirmed: {OrderStatusProcessing, OrderStatusCancelled},
		OrderStatusProcessing: {OrderStatusShipped, OrderStatusCancelled},
		OrderStatusShipped: {OrderStatusDelivered},
		OrderStatusDelivered: {OrderStatusRefunded},
		OrderStatusCancelled: {}, // Cannot transition from cancelled
		OrderStatusRefunded: {},  // Cannot transition from refunded
	}
	
	allowedTransitions, exists := validTransitions[currentStatus]
	if !exists {
		return false
	}
	
	for _, allowed := range allowedTransitions {
		if allowed == newStatus {
			return true
		}
	}
	
	return false
}