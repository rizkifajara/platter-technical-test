# Microservices Application

This application consists of four microservices: User, Product, Payment, and Notification. The services communicate with each other using RabbitMQ and WebSocket.

## Services

### 1. User Service

- **Endpoint**: `/register`
- **Method**: `POST`
- **Description**: Registers a new user.
- **Request Body**:
  ```json
  {
    "name": "John Doe",
    "alamat": "123 Main St"
  }
  ```

### 2. Product Service

- **Endpoint**: `/add-product`
- **Method**: `POST`
- **Description**: Adds a new product.
- **Request Body**:
  ```json
  {
    "name": "Sample Product",
    "qty": 10,
    "price": 1000
  }
  ```

- **Endpoint**: `/product/check-out`
- **Method**: `POST`
- **Description**: Checks out a product.
- **Request Body**:
  ```json
  {
    "productId": 1,
    "qty": 2,
    "userId": 1
  }
  ```

### 3. Payment Service

- **Endpoint**: `/payments`
- **Method**: `GET`
- **Description**: Retrieves all payment records.

### 4. Notification Service

- **Description**: Consumes messages from the `E!SEND_SOCKET` queue and sends notifications to the User service via WebSocket.

## Business Flow

1. **Service Product**:
   - API returns 200.
   - Reduces the quantity (qty) of the product in the database based on the request.
   - Sends product data and userId to the Payment service via Message Broker with the message pattern "M!PAYMENT".
   - **Expected Output**: Confirmation that the product quantity has been reduced and the message has been successfully sent to Payment.

2. **Service Payment**:
   - Receives data from the Product service.
   - Adds a payment transaction record to the Payment database.
   - Sends a message to the Notification service via Message Broker with the message pattern "E!SEND_SOCKET".
   - **Expected Output**: Confirmation that the payment transaction has been successfully saved and the message has been successfully sent to Notification.

3. **Service Notification**:
   - Receives messages from the Payment service via Message Broker.
   - Sends notifications to the User service via WebSocket.
   - **Expected Output**: Confirmation that the notification has been successfully sent to User.

4. **Service User**:
   - Receives notifications from the Notification service via WebSocket.
   - **Expected Output**: The received notification should include transaction details such as productId, userId, qty, and bill.

## Running the Services

### Prerequisites

- Docker
- Docker Compose

### Steps

1. **Clone the repository**:
   ```sh
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Build and start the services**:
   ```sh
   docker-compose up --build
   ```

3. **Add a User**:
   ```sh
   curl -X POST http://localhost:9303/register \
        -H "Content-Type: application/json" \
        -d '{"name": "John Doe", "alamat": "123 Main St"}'
   ```

4. **Add a Product**:
   ```sh
   curl -X POST http://localhost:9301/add-product \
        -H "Content-Type: application/json" \
        -d '{"name": "Sample Product", "qty": 10, "price": 1000}'
   ```

5. **Check Out a Product**:
   ```sh
   curl -X POST http://localhost:9301/product/check-out \
        -H "Content-Type: application/json" \
        -d '{"productId": 1, "qty": 2, "userId": 1}'
   ```

6. **Get All Products**:
   ```sh
   curl -X GET http://localhost:9301/products
   ```

7. **Get All Payments**:
   ```sh
   curl -X GET http://localhost:9302/payments
   ```

## Notes

- Ensure that all services are running and accessible on the specified ports.
- The Notification service uses WebSocket to send notifications to the User service.
- The RabbitMQ message broker is used for communication between the services.
