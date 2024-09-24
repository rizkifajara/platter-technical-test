import express, { Request, Response } from 'express';
import { Client } from 'pg';
import amqp from 'amqplib/callback_api';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const {
  POSTGRES_USER = 'postgres',
  POSTGRES_HOST = 'postgres',
  POSTGRES_DB = 'payment',
  POSTGRES_PASSWORD = 'password',
  POSTGRES_PORT = '5432',
  RABBITMQ_URL = 'amqp://guest:guest@rabbitmq',
  PORT = '9302'
} = process.env;

let client: Client;

async function initPostgres() {
  client = new Client({
    user: POSTGRES_USER,
    host: POSTGRES_HOST,
    database: POSTGRES_DB,
    password: POSTGRES_PASSWORD,
    port: parseInt(POSTGRES_PORT, 10),
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL', error);
    process.exit(1);
  }
}

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
        const queue = 'M!PAYMENT';

        channel.assertQueue(queue, { durable: false });
        console.log(`Waiting for messages in ${queue}. To exit press CTRL+C`);

        channel.consume(queue, async (msg) => {
          if (msg) {
            const paymentData = JSON.parse(msg.content.toString());
            try {
              await client.query('BEGIN');
              const paymentAt = new Date().toISOString();
              await client.query('INSERT INTO payment (productId, qty, userId, price, paymentAt) VALUES ($1, $2, $3, $4, $5)', 
                [paymentData.productId, paymentData.qty, paymentData.userId, paymentData.price, paymentAt]);
              await client.query('COMMIT');

              const notificationQueue = 'E!SEND_SOCKET';
              const notificationMsg = JSON.stringify({ 
                productId: paymentData.productId, 
                userId: paymentData.userId, 
                qty: paymentData.qty, 
                bill: paymentData.price * paymentData.qty 
              });

              channel.assertQueue(notificationQueue, { durable: false });
              channel.sendToQueue(notificationQueue, Buffer.from(notificationMsg));

              console.log('Payment processed and notification sent');
            } catch (e) {
              await client.query('ROLLBACK');
              console.error('Error processing payment', e);
            }
            channel.ack(msg);
          }
        });
      });
    });
  };

  attemptConnection();
};

app.get('/payments', async (req: Request, res: Response) => {
  try {
    const result = await client.query('SELECT * FROM payment');
    res.status(200).json(result.rows);
  } catch (e) {
    console.error('Error fetching payments', e);
    res.status(500).send('Error fetching payments');
  }
});

setTimeout(async () => {
  await initPostgres();
  console.log('PostgreSQL connection initialized');
  connectRabbitMQ();
}, 10000);

app.listen(parseInt(PORT, 10), () => console.log(`Payment service running on port ${PORT}`));