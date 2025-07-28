package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDTO;
import com.ecommerce.productservice.mapper.ProductMapper;
import com.ecommerce.productservice.model.Product;
import com.ecommerce.productservice.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class ProductService {

    private static final Logger logger = LoggerFactory.getLogger(ProductService.class);

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Cacheable(value = "products", key = "#id")
    public Optional<ProductDTO.ProductResponse> getProductById(Long id) {
        logger.debug("Fetching product with id: {}", id);
        return productRepository.findById(id)
                .map(productMapper::toResponse);
    }

    @Cacheable(value = "products", key = "#sku")
    public Optional<ProductDTO.ProductResponse> getProductBySku(String sku) {
        logger.debug("Fetching product with SKU: {}", sku);
        return productRepository.findBySku(sku)
                .map(productMapper::toResponse);
    }

    public ProductDTO.ProductSearchResponse getAllProducts(int page, int size, String sortBy, String sortDir) {
        logger.debug("Fetching all products - page: {}, size: {}, sortBy: {}, sortDir: {}", page, size, sortBy, sortDir);
        
        Sort sort = sortDir.equalsIgnoreCase("desc") ? 
            Sort.by(sortBy).descending() : Sort.by(sortBy).ascending();
        
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Product> products = productRepository.findByActiveTrue(pageable);
        
        return buildSearchResponse(products);
    }

    public ProductDTO.ProductSearchResponse getProductsByCategory(String category, int page, int size) {
        logger.debug("Fetching products by category: {} - page: {}, size: {}", category, page, size);
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<Product> products = productRepository.findByActiveTrueAndCategory(category, pageable);
        
        return buildSearchResponse(products);
    }

    public ProductDTO.ProductSearchResponse searchProducts(String searchTerm, int page, int size) {
        logger.debug("Searching products with term: {} - page: {}, size: {}", searchTerm, page, size);
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<Product> products = productRepository.searchProducts(searchTerm, pageable);
        
        return buildSearchResponse(products);
    }

    public ProductDTO.ProductSearchResponse getProductsByPriceRange(BigDecimal minPrice, BigDecimal maxPrice, 
                                                                   String category, int page, int size) {
        logger.debug("Fetching products by price range: {}-{}, category: {} - page: {}, size: {}", 
                    minPrice, maxPrice, category, page, size);
        
        Pageable pageable = PageRequest.of(page, size, Sort.by("price").ascending());
        Page<Product> products;
        
        if (category != null && !category.trim().isEmpty()) {
            products = productRepository.findByCategoryAndPriceBetween(category, minPrice, maxPrice, pageable);
        } else {
            products = productRepository.findByPriceBetween(minPrice, maxPrice, pageable);
        }
        
        return buildSearchResponse(products);
    }

    public List<String> getAllCategories() {
        logger.debug("Fetching all product categories");
        return productRepository.findAllCategories();
    }

    public ProductDTO.ProductResponse createProduct(ProductDTO.ProductRequest request) {
        logger.info("Creating new product with SKU: {}", request.getSku());
        
        // Check if SKU already exists
        if (productRepository.findBySku(request.getSku()).isPresent()) {
            throw new IllegalArgumentException("Product with SKU " + request.getSku() + " already exists");
        }
        
        Product product = productMapper.toEntity(request);
        Product savedProduct = productRepository.save(product);
        
        // Publish product created event
        publishProductEvent("product.created", savedProduct);
        
        logger.info("Product created successfully with id: {}", savedProduct.getId());
        return productMapper.toResponse(savedProduct);
    }

    @CacheEvict(value = "products", key = "#id")
    public ProductDTO.ProductResponse updateProduct(Long id, ProductDTO.ProductRequest request) {
        logger.info("Updating product with id: {}", id);
        
        Product existingProduct = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + id));
        
        // Check if SKU is being changed and if new SKU already exists
        if (!existingProduct.getSku().equals(request.getSku()) && 
            productRepository.existsBySkuAndIdNot(request.getSku(), id)) {
            throw new IllegalArgumentException("Product with SKU " + request.getSku() + " already exists");
        }
        
        // Update product fields
        productMapper.updateEntity(request, existingProduct);
        Product updatedProduct = productRepository.save(existingProduct);
        
        // Publish product updated event
        publishProductEvent("product.updated", updatedProduct);
        
        logger.info("Product updated successfully with id: {}", updatedProduct.getId());
        return productMapper.toResponse(updatedProduct);
    }

    @CacheEvict(value = "products", key = "#id")
    public void deleteProduct(Long id) {
        logger.info("Deleting product with id: {}", id);
        
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Product not found with id: " + id));
        
        // Soft delete by setting active to false
        product.setActive(false);
        productRepository.save(product);
        
        // Publish product deleted event
        publishProductEvent("product.deleted", product);
        
        logger.info("Product deleted successfully with id: {}", id);
    }

    @CacheEvict(value = "products", key = "#productId")
    public boolean reduceStock(Long productId, Integer quantity) {
        logger.info("Reducing stock for product id: {} by quantity: {}", productId, quantity);
        
        int updatedRows = productRepository.reduceStock(productId, quantity);
        
        if (updatedRows > 0) {
            // Publish stock updated event
            Product product = productRepository.findById(productId).orElse(null);
            if (product != null) {
                publishStockEvent("stock.reduced", product, quantity);
            }
            logger.info("Stock reduced successfully for product id: {}", productId);
            return true;
        } else {
            logger.warn("Failed to reduce stock for product id: {} - insufficient stock or product not found", productId);
            return false;
        }
    }

    @CacheEvict(value = "products", key = "#productId")
    public boolean increaseStock(Long productId, Integer quantity) {
        logger.info("Increasing stock for product id: {} by quantity: {}", productId, quantity);
        
        int updatedRows = productRepository.increaseStock(productId, quantity);
        
        if (updatedRows > 0) {
            // Publish stock updated event
            Product product = productRepository.findById(productId).orElse(null);
            if (product != null) {
                publishStockEvent("stock.increased", product, quantity);
            }
            logger.info("Stock increased successfully for product id: {}", productId);
            return true;
        } else {
            logger.warn("Failed to increase stock for product id: {}", productId);
            return false;
        }
    }

    public List<ProductDTO.ProductResponse> getLowStockProducts(Integer threshold) {
        logger.debug("Fetching low stock products with threshold: {}", threshold);
        
        List<Product> lowStockProducts = productRepository.findLowStockProducts(threshold);
        return lowStockProducts.stream()
                .map(productMapper::toResponse)
                .collect(Collectors.toList());
    }

    public List<ProductDTO.ProductResponse> getProductsByIds(List<Long> productIds) {
        logger.debug("Fetching products by IDs: {}", productIds);
        
        List<Product> products = productRepository.findByIdIn(productIds);
        return products.stream()
                .map(productMapper::toResponse)
                .collect(Collectors.toList());
    }

    private ProductDTO.ProductSearchResponse buildSearchResponse(Page<Product> products) {
        ProductDTO.ProductSearchResponse response = new ProductDTO.ProductSearchResponse();
        response.setProducts(products.getContent().stream()
                .map(productMapper::toResponse)
                .collect(Collectors.toList()));
        response.setTotalPages(products.getTotalPages());
        response.setTotalElements(products.getTotalElements());
        response.setCurrentPage(products.getNumber());
        response.setPageSize(products.getSize());
        return response;
    }

    private void publishProductEvent(String eventType, Product product) {
        try {
            ProductEventMessage event = new ProductEventMessage();
            event.setEventType(eventType);
            event.setProductId(product.getId());
            event.setSku(product.getSku());
            event.setName(product.getName());
            event.setCategory(product.getCategory());
            event.setPrice(product.getPrice());
            event.setStockQuantity(product.getStockQuantity());
            event.setTimestamp(LocalDateTime.now());
            
            rabbitTemplate.convertAndSend("product.events", eventType, event);
            logger.debug("Published product event: {} for product id: {}", eventType, product.getId());
        } catch (Exception e) {
            logger.error("Failed to publish product event: {} for product id: {}", eventType, product.getId(), e);
        }
    }

    private void publishStockEvent(String eventType, Product product, Integer quantity) {
        try {
            StockEventMessage event = new StockEventMessage();
            event.setEventType(eventType);
            event.setProductId(product.getId());
            event.setSku(product.getSku());
            event.setCurrentStock(product.getStockQuantity());
            event.setQuantityChanged(quantity);
            event.setTimestamp(LocalDateTime.now());
            
            rabbitTemplate.convertAndSend("stock.events", eventType, event);
            logger.debug("Published stock event: {} for product id: {}", eventType, product.getId());
        } catch (Exception e) {
            logger.error("Failed to publish stock event: {} for product id: {}", eventType, product.getId(), e);
        }
    }

    // Event message classes
    public static class ProductEventMessage {
        private String eventType;
        private Long productId;
        private String sku;
        private String name;
        private String category;
        private BigDecimal price;
        private Integer stockQuantity;
        private LocalDateTime timestamp;

        // Getters and setters
        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }

        public String getSku() { return sku; }
        public void setSku(String sku) { this.sku = sku; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }

        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }

        public Integer getStockQuantity() { return stockQuantity; }
        public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }

        public LocalDateTime getTimestamp() { return timestamp; }
        public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    }

    public static class StockEventMessage {
        private String eventType;
        private Long productId;
        private String sku;
        private Integer currentStock;
        private Integer quantityChanged;
        private LocalDateTime timestamp;

        // Getters and setters
        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }

        public String getSku() { return sku; }
        public void setSku(String sku) { this.sku = sku; }

        public Integer getCurrentStock() { return currentStock; }
        public void setCurrentStock(Integer currentStock) { this.currentStock = currentStock; }

        public Integer getQuantityChanged() { return quantityChanged; }
        public void setQuantityChanged(Integer quantityChanged) { this.quantityChanged = quantityChanged; }

        public LocalDateTime getTimestamp() { return timestamp; }
        public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    }
}