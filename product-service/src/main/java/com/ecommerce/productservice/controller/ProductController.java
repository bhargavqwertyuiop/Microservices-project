package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ProductDTO;
import com.ecommerce.productservice.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/products")
@Tag(name = "Product Management", description = "APIs for managing products")
@Validated
public class ProductController {

    private static final Logger logger = LoggerFactory.getLogger(ProductController.class);

    @Autowired
    private ProductService productService;

    @GetMapping
    @Operation(summary = "Get all products", description = "Retrieve all active products with pagination and sorting")
    public ResponseEntity<ProductDTO.ProductSearchResponse> getAllProducts(
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") @Min(1) int size,
            @Parameter(description = "Sort field") @RequestParam(defaultValue = "createdAt") String sortBy,
            @Parameter(description = "Sort direction") @RequestParam(defaultValue = "desc") String sortDir) {
        
        logger.info("GET /api/products - page: {}, size: {}, sortBy: {}, sortDir: {}", page, size, sortBy, sortDir);
        
        ProductDTO.ProductSearchResponse response = productService.getAllProducts(page, size, sortBy, sortDir);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get product by ID", description = "Retrieve a specific product by its ID")
    public ResponseEntity<ProductDTO.ProductResponse> getProductById(
            @Parameter(description = "Product ID") @PathVariable Long id) {
        
        logger.info("GET /api/products/{}", id);
        
        return productService.getProductById(id)
                .map(product -> ResponseEntity.ok(product))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/sku/{sku}")
    @Operation(summary = "Get product by SKU", description = "Retrieve a specific product by its SKU")
    public ResponseEntity<ProductDTO.ProductResponse> getProductBySku(
            @Parameter(description = "Product SKU") @PathVariable String sku) {
        
        logger.info("GET /api/products/sku/{}", sku);
        
        return productService.getProductBySku(sku)
                .map(product -> ResponseEntity.ok(product))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/category/{category}")
    @Operation(summary = "Get products by category", description = "Retrieve products filtered by category")
    public ResponseEntity<ProductDTO.ProductSearchResponse> getProductsByCategory(
            @Parameter(description = "Product category") @PathVariable String category,
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") @Min(1) int size) {
        
        logger.info("GET /api/products/category/{} - page: {}, size: {}", category, page, size);
        
        ProductDTO.ProductSearchResponse response = productService.getProductsByCategory(category, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/search")
    @Operation(summary = "Search products", description = "Search products by name, description, or category")
    public ResponseEntity<ProductDTO.ProductSearchResponse> searchProducts(
            @Parameter(description = "Search term") @RequestParam String q,
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") @Min(1) int size) {
        
        logger.info("GET /api/products/search?q={} - page: {}, size: {}", q, page, size);
        
        ProductDTO.ProductSearchResponse response = productService.searchProducts(q, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/price-range")
    @Operation(summary = "Get products by price range", description = "Retrieve products within a specific price range")
    public ResponseEntity<ProductDTO.ProductSearchResponse> getProductsByPriceRange(
            @Parameter(description = "Minimum price") @RequestParam BigDecimal minPrice,
            @Parameter(description = "Maximum price") @RequestParam BigDecimal maxPrice,
            @Parameter(description = "Product category (optional)") @RequestParam(required = false) String category,
            @Parameter(description = "Page number (0-based)") @RequestParam(defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size") @RequestParam(defaultValue = "20") @Min(1) int size) {
        
        logger.info("GET /api/products/price-range?minPrice={}&maxPrice={}&category={} - page: {}, size: {}", 
                   minPrice, maxPrice, category, page, size);
        
        ProductDTO.ProductSearchResponse response = productService.getProductsByPriceRange(minPrice, maxPrice, category, page, size);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/categories")
    @Operation(summary = "Get all categories", description = "Retrieve all available product categories")
    public ResponseEntity<List<String>> getAllCategories() {
        logger.info("GET /api/products/categories");
        
        List<String> categories = productService.getAllCategories();
        return ResponseEntity.ok(categories);
    }

    @GetMapping("/low-stock")
    @Operation(summary = "Get low stock products", description = "Retrieve products with stock below threshold")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<ProductDTO.ProductResponse>> getLowStockProducts(
            @Parameter(description = "Stock threshold") @RequestParam(defaultValue = "10") @Min(0) Integer threshold) {
        
        logger.info("GET /api/products/low-stock?threshold={}", threshold);
        
        List<ProductDTO.ProductResponse> products = productService.getLowStockProducts(threshold);
        return ResponseEntity.ok(products);
    }

    @PostMapping("/bulk")
    @Operation(summary = "Get products by IDs", description = "Retrieve multiple products by their IDs")
    public ResponseEntity<List<ProductDTO.ProductResponse>> getProductsByIds(
            @Parameter(description = "List of product IDs") @RequestBody List<Long> productIds) {
        
        logger.info("POST /api/products/bulk - IDs: {}", productIds);
        
        List<ProductDTO.ProductResponse> products = productService.getProductsByIds(productIds);
        return ResponseEntity.ok(products);
    }

    @PostMapping
    @Operation(summary = "Create product", description = "Create a new product")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductDTO.ProductResponse> createProduct(
            @Parameter(description = "Product details") @Valid @RequestBody ProductDTO.ProductRequest request) {
        
        logger.info("POST /api/products - Creating product with SKU: {}", request.getSku());
        
        try {
            ProductDTO.ProductResponse response = productService.createProduct(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            logger.warn("Failed to create product: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update product", description = "Update an existing product")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductDTO.ProductResponse> updateProduct(
            @Parameter(description = "Product ID") @PathVariable Long id,
            @Parameter(description = "Updated product details") @Valid @RequestBody ProductDTO.ProductRequest request) {
        
        logger.info("PUT /api/products/{} - Updating product", id);
        
        try {
            ProductDTO.ProductResponse response = productService.updateProduct(id, request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            logger.warn("Failed to update product {}: {}", id, e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete product", description = "Soft delete a product")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteProduct(
            @Parameter(description = "Product ID") @PathVariable Long id) {
        
        logger.info("DELETE /api/products/{}", id);
        
        try {
            productService.deleteProduct(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            logger.warn("Failed to delete product {}: {}", id, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/reduce-stock")
    @Operation(summary = "Reduce product stock", description = "Reduce stock quantity for a product")
    @PreAuthorize("hasRole('ADMIN') or hasRole('ORDER_SERVICE')")
    public ResponseEntity<Void> reduceStock(
            @Parameter(description = "Product ID") @PathVariable Long id,
            @Parameter(description = "Stock reduction details") @Valid @RequestBody ProductDTO.StockUpdateRequest request) {
        
        logger.info("POST /api/products/{}/reduce-stock - Quantity: {}", id, request.getQuantity());
        
        boolean success = productService.reduceStock(id, request.getQuantity());
        if (success) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{id}/increase-stock")
    @Operation(summary = "Increase product stock", description = "Increase stock quantity for a product")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> increaseStock(
            @Parameter(description = "Product ID") @PathVariable Long id,
            @Parameter(description = "Stock increase details") @Valid @RequestBody ProductDTO.StockUpdateRequest request) {
        
        logger.info("POST /api/products/{}/increase-stock - Quantity: {}", id, request.getQuantity());
        
        boolean success = productService.increaseStock(id, request.getQuantity());
        if (success) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/health")
    @Operation(summary = "Health check", description = "Service health check endpoint")
    public ResponseEntity<String> healthCheck() {
        return ResponseEntity.ok("Product Service is healthy");
    }
}