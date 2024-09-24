import express, { Request, Response } from 'express';
import { Client } from 'pg';
import amqp from 'amqplib/callback_api';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const {
  POSTGRES_USER = 'postgres',
  POSTGRES_HOST = 'postgres',
  POSTGRES_DB = 'product',
  POSTGRES_PASSWORD = 'password',
  POSTGRES_PORT = '5432',
  RABBITMQ_URL = 'amqp://guest:guest@rabbitmq',
  USER_SERVICE_URL = 'http://user:9303',
  PORT = '9301'
} = process.env;

const createPostgresClient = () => new Client({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  database: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: parseInt(POSTGRES_PORT, 10),
});

const connectWithRetry = async (retries = 5, delay = 5000): Promise<Client | undefined> => {
  for (let i = 0; i < retries; i++) {
    const client = createPostgresClient();
    try {
      await client.connect();
      console.log('Connected to PostgreSQL');
      return client;
    } catch (err) {
      console.error(`Failed to connect to PostgreSQL (attempt ${i + 1} of ${retries})`, err);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error('Exceeded maximum retries. Exiting.');
        process.exit(1);
      }
    }
  }
  return undefined;
};

app.post('/product/check-out', async (req: Request, res: Response) => {
  const { productId, qty, userId } = req.body;
  const client = await connectWithRetry();

  if (!client) {
    return res.status(500).send('Failed to connect to PostgreSQL');
  }

  try {
    await client.query('BEGIN');
    const productResult = await client.query('SELECT * FROM product WHERE id = $1', [productId]);
    const product = productResult.rows[0];

    if (product.qty < qty) {
      return res.status(400).send('Not enough quantity');
    }

    await client.query('UPDATE product SET qty = qty - $1 WHERE id = $2', [qty, productId]);

    try {
      await axios.get(`${USER_SERVICE_URL}/users/${userId}`);

      amqp.connect(RABBITMQ_URL, (error, connection) => {
        if (error) {
          console.error('Failed to connect to RabbitMQ', error);
          return;
        }
        connection.createChannel((channelError, channel) => {
          if (channelError) {
            console.error('Failed to create RabbitMQ channel', channelError);
            return;
          }
          const queue = 'M!PAYMENT';
          const msg = JSON.stringify({ productId, qty, userId, price: product.price });

          channel.assertQueue(queue, { durable: false });
          channel.sendToQueue(queue, Buffer.from(msg));
        });
      });

      await client.query('COMMIT');
      res.status(200).send('Product checked out successfully');
    } catch (userError: any) {
      if (userError.response && userError.response.status === 404) {
        await client.query('ROLLBACK');
        return res.status(404).send('User not found');
      }
      throw userError;
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error checking out product', e);
    res.status(500).send('Error checking out product');
  } finally {
    client.end();
  }
});

app.post('/add-product', async (req: Request, res: Response) => {
  const { name, qty, price } = req.body;
  const client = await connectWithRetry();

  if (!client) {
    return res.status(500).send('Failed to connect to PostgreSQL');
  }

  try {
    await client.query('INSERT INTO "product" (name, qty, price) VALUES ($1, $2, $3)', [name, qty, price]);
    res.status(201).send('Product added successfully');
  } catch (err) {
    console.error('Failed to add product', err);
    res.status(500).send('Failed to add product');
  } finally {
    client.end();
  }
});

app.get('/products', async (req: Request, res: Response) => {
  const client = await connectWithRetry();

  if (!client) {
    return res.status(500).send('Failed to connect to PostgreSQL');
  }

  try {
    const result = await client.query('SELECT * FROM product');
    res.status(200).json(result.rows);
  } catch (e) {
    console.error('Error fetching products', e);
    res.status(500).send('Error fetching products');
  } finally {
    client.end();
  }
});

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
        const queue = 'product_queue';

        channel.assertQueue(queue, { durable: false });
        console.log(`Waiting for messages in ${queue}. To exit press CTRL+C`);

        channel.consume(queue, (msg) => {
          if (msg) {
            console.log(`Received: ${msg.content.toString()}`);
            channel.ack(msg);
          }
        });
      });
    });
  };

  attemptConnection();
};

connectRabbitMQ();

app.listen(parseInt(PORT, 10), () => console.log(`Product service running on port ${PORT}`));