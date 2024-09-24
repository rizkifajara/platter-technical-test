import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import amqp from 'amqplib/callback_api';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq';
const PORT = process.env.PORT || 9304;

// WebSocket connection
io.on('connection', (socket) => {
  console.log('User connected');
  socket.on('disconnect', () => console.log('User disconnected'));
});

// RabbitMQ connection with retry
const connectRabbitMQ = (retries = 5, delay = 5000) => {
  let attemptCount = 0;

  const attemptConnection = () => {
    amqp.connect(RABBITMQ_URL, (error, connection) => {
      if (error) {
        console.error(`Failed to connect to RabbitMQ (attempt ${attemptCount + 1} of ${retries})`, error);
        if (attemptCount < retries - 1) {
          attemptCount++;
          setTimeout(attemptConnection, delay);
        } else {
          console.error('Exceeded maximum retries for RabbitMQ. Exiting.');
          process.exit(1);
        }
        return;
      }

      console.log('Connected to RabbitMQ');
      connection.createChannel((channelError, channel) => {
        if (channelError) {
          console.error('Failed to create RabbitMQ channel', channelError);
          return;
        }
        const queue = 'E!SEND_SOCKET';

        channel.assertQueue(queue, { durable: false });
        console.log(`Waiting for messages in ${queue}. To exit press CTRL+C`);

        channel.consume(queue, (msg) => {
          if (msg) {
            const notificationData = JSON.parse(msg.content.toString());
            io.emit('notification', notificationData);
            console.log('Notification sent to User service:', notificationData);
            channel.ack(msg);
          }
        });
      });
    });
  };

  attemptConnection();
};

// Start RabbitMQ connection
connectRabbitMQ();

// Start server
server.listen(PORT, () => console.log(`Notification service running on port ${PORT}`));