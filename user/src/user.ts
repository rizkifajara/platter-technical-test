import express, { Request, Response } from 'express';
import { Server } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

const {
  POSTGRES_USER = 'postgres',
  POSTGRES_HOST = 'postgres',
  POSTGRES_DB = 'user',
  POSTGRES_PASSWORD = 'password',
  POSTGRES_PORT = '5432',
  PORT = '9303'
} = process.env;

const client = new Client({
  user: POSTGRES_USER,
  host: POSTGRES_HOST,
  database: POSTGRES_DB,
  password: POSTGRES_PASSWORD,
  port: parseInt(POSTGRES_PORT, 10),
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Failed to connect to PostgreSQL', err));

app.post('/register', async (req: Request, res: Response) => {
  console.log('Received request to register user');
  const { name, alamat } = req.body;
  console.log('Request body:', req.body);
  try {
    await client.query('INSERT INTO "user" (name, alamat) VALUES ($1, $2)', [name, alamat]);
    console.log('User registered successfully');
    res.status(201).send('User registered successfully');
  } catch (err) {
    console.error('Failed to register user', err);
    res.status(500).send('Failed to register user');
  }
});

app.get('/users', async (req: Request, res: Response) => {
  console.log('Received request to get all users');
  try {
    const result = await client.query('SELECT * FROM "user"');
    console.log('Fetched users:', result.rows);
    res.status(200).json(result.rows);
  } catch (e) {
    console.error('Error fetching users', e);
    res.status(500).send('Error fetching users');
  }
});

app.get('/users/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;
  try {
    const result = await client.query('SELECT * FROM "user" WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }
    res.status(200).json(result.rows[0]);
  } catch (e) {
    console.error('Error fetching user', e);
    res.status(500).send('Error fetching user');
  }
});

io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('notification', (data) => {
    console.log('Notification received:', data);
    // Process the notification data as needed
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(parseInt(PORT, 10), () => {
  console.log(`User service running on port ${PORT}`);
});