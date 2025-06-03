const express = require('express');
const cors = require('cors');
const pool = require('./database'); // Importa o pool do PostgreSQL
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3001;
const SECRET_KEY = 'sua_chave_secreta';

app.use(cors());
app.use(express.json());

// Criar tabelas
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        preco DECIMAL(10,2) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false
      )
    `);
    console.log('Tabelas criadas com sucesso');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err);
  }
}

createTables();

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Rotas de Produtos
app.get('/produtos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/produtos', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  
  const { nome, preco } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO produtos (nome, preco) VALUES ($1, $2) RETURNING *',
      [nome, parseFloat(preco)]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/produtos/:id', authenticateToken, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    res.json({ message: 'Produto deletado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rotas de Autenticação
app.post('/registrar', async (req, res) => {
  const { email, senha, isAdmin } = req.body;
  try {
    const hashedSenha = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      'INSERT INTO usuarios (email, senha, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedSenha, isAdmin]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'Email já cadastrado' });
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (rows.length === 0) throw new Error('Credenciais inválidas');
    
    const user = rows[0];
    const match = await bcrypt.compare(senha, user.senha);
    if (!match) throw new Error('Credenciais inválidas');
    
    const token = jwt.sign(
      { id: user.id, isAdmin: user.is_admin },
      SECRET_KEY,
      { expiresIn: '1h' }
    );
    
    res.json({ token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(` Servidor rodando em http://localhost:${port}`);
});
