# Bookstore Inventory and Online Sales Management System

Web UI (HTML · CSS · JavaScript) → Node.js + Express (mysql2) → MySQL 8

## Setup

1. Install [Node.js LTS](https://nodejs.org) and MySQL 8.
2. Install dependencies and configure the database login:
   ```bash
   cd bookstore
   npm install
   cp .env.example .env     # then put your MySQL password in .env
   ```
3. Create the database, tables, triggers, views and sample data. Either:
   ```bash
   npm run setup-db
   ```
   or open `database/schema.sql` in MySQL Workbench and run it.
4. Start the app and open http://localhost:3000
   ```bash
   npm start
   ```

## Objectives → implementation

| Objective | Where |
|---|---|
| Centralized book inventory | `books` table, Books screen |
| Customer, author, category data | `customers`, `authors`, `categories` tables and screens |
| Manage online orders | `orders` + `order_items`, Orders screen (place, view, ship, deliver, cancel) |
| Automatically reduce stock after sales | `trg_items_before_insert` (rejects overselling) and `trg_items_after_insert` (reduces stock). Cancelling an order returns stock. |
| Fast database-based retrieval | Indexes on title, author, category, customer and date. Views `v_book_catalog` and `v_order_summary`. |
| Integrity with PKs, FKs, constraints | PK on every table, FKs with `RESTRICT`/`CASCADE`, `UNIQUE` (isbn, email, category name), `CHECK` (price, stock, quantity ≥ 0 or > 0), `NOT NULL` |

## UI demo script (matches the slide)

1. **View Books**: Books screen.
2. **Add Book**: click *+ Add Book* and save.
3. **Verify in MySQL**: `SELECT * FROM bookstore_db.books ORDER BY book_id DESC;`
4. **Delete Book**: click *Delete* on the new book.
5. **Verify deletion**: re-run the query above.
6. **Place Order**: Orders → *+ Place Order*.
7. **Verify order and updated stock**:
   ```sql
   SELECT * FROM v_order_summary ORDER BY order_id DESC;
   SELECT * FROM order_items ORDER BY order_item_id DESC;
   SELECT book_id, title, stock FROM books;
   ```

## REST API

| Method | Endpoint |
|---|---|
| GET/POST | `/api/books`, `/api/authors`, `/api/categories`, `/api/customers` |
| PUT/DELETE | `/api/books/:id` |
| DELETE | `/api/authors/:id`, `/api/categories/:id`, `/api/customers/:id` |
| GET/POST | `/api/orders` |
| GET | `/api/orders/:id` |
| PATCH | `/api/orders/:id/status` |
| GET | `/api/stats` |

Books that have been ordered cannot be deleted (FK `RESTRICT`). The API returns a clear error message instead.
