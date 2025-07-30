FROM golang:1.21-alpine AS builder

# Install git for go mod download
RUN apk add --no-cache git

WORKDIR /app

# Copy go mod files
COPY go.mod ./

# Copy source code first
COPY . .

# Download dependencies and generate go.sum
RUN go mod tidy

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -o main .

FROM alpine:latest AS production

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates wget

# Create app directory and user
RUN addgroup -g 1001 -S app && \
    adduser -S app -u 1001 -G app

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder --chown=app:app /app/main .

# Create logs directory
RUN mkdir -p logs && chown app:app logs

USER app

EXPOSE 8003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8003/health || exit 1

CMD ["./main"]