require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Wrap async handlers so errors reach the error middleware
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const str = (v) => (typeof v === 'string' ? v.trim() : v);
const required = (obj, fields) => {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === '') {
      throw bad(`"${f}" is required`);
    }
  }
};

// ---------------------------------------------------------------- Dashboard
app.get('/api/stats', wrap(async (req, res) => {
  const [[s]] = await pool.query(`
    SELECT
      (SELECT COUNT(*)  FROM books)                            AS titles,
      (SELECT COALESCE(SUM(stock),0) FROM books)               AS units_in_stock,
      (SELECT COUNT(*)  FROM books WHERE stock <= 5)           AS low_stock,
      (SELECT COUNT(*)  FROM customers)                        AS customers,
      (SELECT COUNT(*)  FROM orders WHERE status <> 'CANCELLED') AS orders,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status <> 'CANCELLED') AS revenue`);
  res.json(s);
}));

// ---------------------------------------------------------------- Categories
app.get('/api/categories', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, COUNT(b.book_id) AS book_count
     FROM categories c LEFT JOIN books b ON b.category_id = c.category_id
     GROUP BY c.category_id ORDER BY c.name`);
  res.json(rows);
}));

app.post('/api/categories', wrap(async (req, res) => {
  required(req.body, ['name']);
  const [r] = await pool.query('INSERT INTO categories (name, description) VALUES (?, ?)',
    [str(req.body.name), str(req.body.description) || null]);
  res.status(201).json({ category_id: r.insertId });
}));

app.delete('/api/categories/:id', wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM categories WHERE category_id = ?', [req.params.id]);
  if (!r.affectedRows) throw bad('Category not found', 404);
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------- Authors
app.get('/api/authors', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, COUNT(b.book_id) AS book_count
     FROM authors a LEFT JOIN books b ON b.author_id = a.author_id
     GROUP BY a.author_id ORDER BY a.name`);
  res.json(rows);
}));

app.post('/api/authors', wrap(async (req, res) => {
  required(req.body, ['name']);
  const [r] = await pool.query('INSERT INTO authors (name, country, bio) VALUES (?, ?, ?)',
    [str(req.body.name), str(req.body.country) || null, str(req.body.bio) || null]);
  res.status(201).json({ author_id: r.insertId });
}));

app.delete('/api/authors/:id', wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM authors WHERE author_id = ?', [req.params.id]);
  if (!r.affectedRows) throw bad('Author not found', 404);
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------- Books
app.get('/api/books', wrap(async (req, res) => {
  const { q, category_id, author_id } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR author LIKE ? OR isbn LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category_id) { where.push('category_id = ?'); params.push(category_id); }
  if (author_id)   { where.push('author_id = ?');   params.push(author_id); }
  const [rows] = await pool.query(
    `SELECT * FROM v_book_catalog ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY book_id DESC`,
    params);
  res.json(rows);
}));

app.post('/api/books', wrap(async (req, res) => {
  required(req.body, ['isbn', 'title', 'author_id', 'category_id', 'price', 'stock']);
  const { isbn, title, author_id, category_id, price, stock, published_year } = req.body;
  if (Number(price) < 0) throw bad('Price cannot be negative');
  if (!Number.isInteger(Number(stock)) || Number(stock) < 0) throw bad('Stock must be a whole number >= 0');
  const [r] = await pool.query(
    `INSERT INTO books (isbn, title, author_id, category_id, price, stock, published_year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [str(isbn), str(title), author_id, category_id, price, stock, published_year || null]);
  res.status(201).json({ book_id: r.insertId });
}));

app.put('/api/books/:id', wrap(async (req, res) => {
  required(req.body, ['isbn', 'title', 'author_id', 'category_id', 'price', 'stock']);
  const { isbn, title, author_id, category_id, price, stock, published_year } = req.body;
  const [r] = await pool.query(
    `UPDATE books SET isbn=?, title=?, author_id=?, category_id=?, price=?, stock=?, published_year=?
     WHERE book_id=?`,
    [str(isbn), str(title), author_id, category_id, price, stock, published_year || null, req.params.id]);
  if (!r.affectedRows) throw bad('Book not found', 404);
  res.json({ updated: true });
}));

app.delete('/api/books/:id', wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM books WHERE book_id = ?', [req.params.id]);
  if (!r.affectedRows) throw bad('Book not found', 404);
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------- Customers
app.get('/api/customers', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT cu.*, COUNT(o.order_id) AS order_count
     FROM customers cu LEFT JOIN orders o ON o.customer_id = cu.customer_id
     GROUP BY cu.customer_id ORDER BY cu.name`);
  res.json(rows);
}));

app.post('/api/customers', wrap(async (req, res) => {
  required(req.body, ['name', 'email']);
  const [r] = await pool.query(
    'INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)',
    [str(req.body.name), str(req.body.email), str(req.body.phone) || null, str(req.body.address) || null]);
  res.status(201).json({ customer_id: r.insertId });
}));

app.delete('/api/customers/:id', wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
  if (!r.affectedRows) throw bad('Customer not found', 404);
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------- Orders
app.get('/api/orders', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_order_summary ORDER BY order_id DESC');
  res.json(rows);
}));

app.get('/api/orders/:id', wrap(async (req, res) => {
  const [[order]] = await pool.query('SELECT * FROM v_order_summary WHERE order_id = ?', [req.params.id]);
  if (!order) throw bad('Order not found', 404);
  const [items] = await pool.query(
    `SELECT oi.order_item_id, oi.book_id, b.title, oi.quantity, oi.unit_price,
            oi.quantity * oi.unit_price AS line_total
     FROM order_items oi JOIN books b ON b.book_id = oi.book_id
     WHERE oi.order_id = ?`, [req.params.id]);
  res.json({ ...order, items });
}));

// Place an order. Stock is checked and reduced by DB triggers inside one transaction.
app.post('/api/orders', wrap(async (req, res) => {
  const { customer_id, items } = req.body;
  if (!customer_id) throw bad('Select a customer');
  if (!Array.isArray(items) || !items.length) throw bad('Add at least one book to the order');

  // merge duplicate book lines
  const merged = new Map();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.book_id || !Number.isInteger(qty) || qty <= 0) throw bad('Each line needs a book and a positive quantity');
    merged.set(Number(it.book_id), (merged.get(Number(it.book_id)) || 0) + qty);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [o] = await conn.query('INSERT INTO orders (customer_id) VALUES (?)', [customer_id]);
    let total = 0;
    for (const [bookId, qty] of merged) {
      const [[book]] = await conn.query('SELECT price, title FROM books WHERE book_id = ?', [bookId]);
      if (!book) throw bad(`Book ${bookId} not found`, 404);
      // trigger rejects with SQLSTATE 45000 when stock is insufficient and reduces stock otherwise
      await conn.query(
        'INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [o.insertId, bookId, qty, book.price]);
      total += book.price * qty;
    }
    await conn.query('UPDATE orders SET total_amount = ? WHERE order_id = ?', [total.toFixed(2), o.insertId]);
    await conn.commit();
    res.status(201).json({ order_id: o.insertId, total_amount: Number(total.toFixed(2)) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

app.patch('/api/orders/:id/status', wrap(async (req, res) => {
  const { status } = req.body;
  if (!['PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(status)) throw bad('Invalid status');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT status FROM orders WHERE order_id = ? FOR UPDATE', [req.params.id]);
    if (!order) throw bad('Order not found', 404);
    if (order.status === 'CANCELLED') throw bad('Cancelled orders cannot be changed', 409);
    if (status === 'CANCELLED') {
      // return the stock of every line
      await conn.query(
        `UPDATE books b JOIN order_items oi ON oi.book_id = b.book_id
         SET b.stock = b.stock + oi.quantity WHERE oi.order_id = ?`, [req.params.id]);
    }
    await conn.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, req.params.id]);
    await conn.commit();
    res.json({ updated: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---------------------------------------------------------------- Errors
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      status = 409; message = 'Duplicate value: that record already exists (' + (err.sqlMessage || '').split("'")[1] + ')'; break;
    case 'ER_ROW_IS_REFERENCED_2':
      status = 409; message = 'Cannot delete: this record is referenced by other records (e.g. orders or books)'; break;
    case 'ER_NO_REFERENCED_ROW_2':
      status = 400; message = 'Invalid reference: related record does not exist'; break;
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      status = 400; message = 'A value violates a database constraint (price/stock/quantity must be valid)'; break;
    case 'ER_SIGNAL_EXCEPTION':
      status = 409; message = err.sqlMessage; break;
    case 'ECONNREFUSED':
    case 'ER_BAD_DB_ERROR':
    case 'ER_ACCESS_DENIED_ERROR':
      status = 503; message = 'Database unavailable: ' + (err.sqlMessage || err.message); break;
    default:
      if (status === 500) console.error(err);
  }
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bookstore running at http://localhost:${PORT}`));
