-- Create databases
CREATE DATABASE payment;
CREATE DATABASE product;
CREATE DATABASE "user";

-- Switch to the user database and create the user table
\c user
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    alamat TEXT NOT NULL
);

-- Switch to the product database and create the product table
\c product
CREATE TABLE IF NOT EXISTS "product" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qty INT NOT NULL,
    price BIGINT NOT NULL
);

-- Switch to the payment database and create the payment table
\c payment
CREATE TABLE IF NOT EXISTS "payment" (
    id SERIAL PRIMARY KEY,
    paymentAt TIMESTAMPTZ NOT NULL,
    userId INT NOT NULL,
    productId INT NOT NULL,
    qty INT NOT NULL,
    price BIGINT NOT NULL
);