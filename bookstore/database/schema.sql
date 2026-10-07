-- ============================================================
--  Bookstore Inventory and Online Sales Management System
--  MySQL 8 schema  (open in MySQL Workbench and run all)
-- ============================================================

DROP DATABASE IF EXISTS bookstore_db;
CREATE DATABASE bookstore_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bookstore_db;

-- ---------- Categories ----------
CREATE TABLE categories (
    category_id   INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL UNIQUE,
    description   VARCHAR(255)
) ENGINE=InnoDB;

-- ---------- Authors ----------
CREATE TABLE authors (
    author_id     INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    country       VARCHAR(80),
    bio           VARCHAR(500),
    UNIQUE KEY uq_author_name (name)
) ENGINE=InnoDB;

-- ---------- Books (inventory) ----------
CREATE TABLE books (
    book_id       INT AUTO_INCREMENT PRIMARY KEY,
    isbn          VARCHAR(20)   NOT NULL UNIQUE,
    title         VARCHAR(200)  NOT NULL,
    author_id     INT           NOT NULL,
    category_id   INT           NOT NULL,
    price         DECIMAL(10,2) NOT NULL,
    stock         INT           NOT NULL DEFAULT 0,
    published_year SMALLINT,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_book_price CHECK (price >= 0),
    CONSTRAINT chk_book_stock CHECK (stock >= 0),
    CONSTRAINT fk_book_author   FOREIGN KEY (author_id)   REFERENCES authors(author_id)       ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_book_category FOREIGN KEY (category_id) REFERENCES categories(category_id)  ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_book_title    (title),
    INDEX idx_book_author   (author_id),
    INDEX idx_book_category (category_id)
) ENGINE=InnoDB;

-- ---------- Customers ----------
CREATE TABLE customers (
    customer_id   INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(120) NOT NULL UNIQUE,
    phone         VARCHAR(20),
    address       VARCHAR(255),
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Orders ----------
CREATE TABLE orders (
    order_id      INT AUTO_INCREMENT PRIMARY KEY,
    customer_id   INT NOT NULL,
    order_date    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status        ENUM('PLACED','SHIPPED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PLACED',
    total_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_order_total CHECK (total_amount >= 0),
    CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_order_customer (customer_id),
    INDEX idx_order_date (order_date)
) ENGINE=InnoDB;

-- ---------- Order items ----------
CREATE TABLE order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id      INT NOT NULL,
    book_id       INT NOT NULL,
    quantity      INT NOT NULL,
    unit_price    DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_item_qty   CHECK (quantity > 0),
    CONSTRAINT chk_item_price CHECK (unit_price >= 0),
    CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_item_book  FOREIGN KEY (book_id)  REFERENCES books(book_id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE KEY uq_order_book (order_id, book_id),
    INDEX idx_item_book (book_id)
) ENGINE=InnoDB;

-- ============================================================
--  Triggers : automatic stock control
-- ============================================================
DELIMITER $$

-- Reject an order line when there is not enough stock
CREATE TRIGGER trg_items_before_insert
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
    DECLARE available INT;
    SELECT stock INTO available FROM books WHERE book_id = NEW.book_id FOR UPDATE;
    IF available IS NULL OR available < NEW.quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock for requested book';
    END IF;
END$$

-- Reduce stock automatically after a sale
CREATE TRIGGER trg_items_after_insert
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
    UPDATE books SET stock = stock - NEW.quantity WHERE book_id = NEW.book_id;
END$$

-- Put stock back when an order line is deleted directly
CREATE TRIGGER trg_items_after_delete
AFTER DELETE ON order_items
FOR EACH ROW
BEGIN
    UPDATE books SET stock = stock + OLD.quantity WHERE book_id = OLD.book_id;
END$$

DELIMITER ;

-- ============================================================
--  Views (fast database-based retrieval)
-- ============================================================
CREATE VIEW v_book_catalog AS
SELECT b.book_id, b.isbn, b.title, b.price, b.stock, b.published_year,
       a.author_id, a.name AS author,
       c.category_id, c.name AS category
FROM books b
JOIN authors a    ON a.author_id = b.author_id
JOIN categories c ON c.category_id = b.category_id;

CREATE VIEW v_order_summary AS
SELECT o.order_id, o.order_date, o.status, o.total_amount,
       cu.customer_id, cu.name AS customer, cu.email,
       COALESCE(SUM(oi.quantity), 0) AS total_items
FROM orders o
JOIN customers cu ON cu.customer_id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY o.order_id, o.order_date, o.status, o.total_amount, cu.customer_id, cu.name, cu.email;

-- ============================================================
--  Sample data
-- ============================================================
INSERT INTO categories (name, description) VALUES
 ('Fiction',     'Novels and short stories'),
 ('Science',     'Popular science and textbooks'),
 ('Technology',  'Programming and computing'),
 ('History',     'Historical works and biographies'),
 ('Self-Help',   'Personal development');

INSERT INTO authors (name, country, bio) VALUES
 ('George Orwell',      'United Kingdom', 'Author of dystopian classics'),
 ('Yuval Noah Harari',  'Israel',         'Historian and bestselling author'),
 ('Robert C. Martin',   'United States',  'Software engineer and author of Clean Code'),
 ('Paulo Coelho',       'Brazil',         'Novelist, author of The Alchemist'),
 ('James Clear',        'United States',  'Writer on habits and self-improvement'),
 ('Stephen Hawking',    'United Kingdom', 'Theoretical physicist');

INSERT INTO books (isbn, title, author_id, category_id, price, stock, published_year) VALUES
 ('9780451524935', '1984',                        1, 1, 299.00, 25, 1949),
 ('9780452284241', 'Animal Farm',                 1, 1, 199.00, 30, 1945),
 ('9780062316097', 'Sapiens',                     2, 4, 499.00, 18, 2011),
 ('9780132350884', 'Clean Code',                  3, 3, 699.00, 12, 2008),
 ('9780061122415', 'The Alchemist',               4, 1, 349.00, 40, 1988),
 ('9780735211292', 'Atomic Habits',               5, 5, 599.00, 22, 2018),
 ('9780553380163', 'A Brief History of Time',     6, 2, 449.00, 15, 1988),
 ('9780134494166', 'Clean Architecture',          3, 3, 749.00,  9, 2017);

INSERT INTO customers (name, email, phone, address) VALUES
 ('Aarav Mehta',  'aarav@example.com',  '9876500001', '12 MG Road, Pune'),
 ('Diya Sharma',  'diya@example.com',   '9876500002', '45 Park Street, Kolkata'),
 ('Rohan Verma',  'rohan@example.com',  '9876500003', '8 Lake View, Bengaluru');
