/* Bookstore Inventory & Online Sales – single-page frontend */
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view'), actions = $('#actions'), titleEl = $('#title');
const money = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + type; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'err'); } };

/* ---------- modal ---------- */
function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => (o[k] = v));
  return o;
}
const opts = (rows, idKey, label, selected) =>
  rows.map((r) => `<option value="${r[idKey]}" ${String(r[idKey]) === String(selected) ? 'selected' : ''}>${esc(typeof label === 'function' ? label(r) : r[label])}</option>`).join('');

function table(cols, rows, empty = 'No records yet') {
  if (!rows.length) return `<div class="card empty">${empty}</div>`;
  return `<div class="table-wrap card" style="padding:0"><table>
    <thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

const stockBadge = (n) =>
  n <= 0 ? '<span class="badge b-out">Out of stock</span>'
    : n <= 5 ? `<span class="badge b-low">${n} · Low</span>`
      : `<span class="badge b-ok">${n}</span>`;

/* ---------- router ---------- */
const views = {
  dashboard: () => dashboard(), books: () => books(), orders: () => orders(),
  customers: () => customers(), authors: () => authors(), categories: () => categories(),
};
async function route() {
  const name = (location.hash || '#dashboard').slice(1);
  const fn = views[name] || dashboard;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === (views[name] ? name : 'dashboard')));
  actions.innerHTML = '';
  try { await fn(); } catch (e) { view.innerHTML = `<div class="card empty">⚠ ${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);

/* ================= Dashboard ================= */
async function dashboard() {
  titleEl.textContent = 'Dashboard';
  const [s, books, orders] = await Promise.all([api('/stats'), api('/books'), api('/orders')]);
  const low = books.filter((b) => b.stock <= 5).sort((a, b) => a.stock - b.stock);
  view.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="v">${s.titles}</div><div class="l">Book titles</div></div>
      <div class="stat"><div class="v">${s.units_in_stock}</div><div class="l">Units in stock</div></div>
      <div class="stat warn"><div class="v">${s.low_stock}</div><div class="l">Low-stock titles (≤5)</div></div>
      <div class="stat"><div class="v">${s.customers}</div><div class="l">Customers</div></div>
      <div class="stat"><div class="v">${s.orders}</div><div class="l">Active orders</div></div>
      <div class="stat"><div class="v">${money(s.revenue)}</div><div class="l">Revenue</div></div>
    </div>
    <h3>Low stock</h3>
    ${table([
      { h: 'Title', f: (b) => esc(b.title) }, { h: 'Author', f: (b) => esc(b.author) },
      { h: 'Stock', f: (b) => stockBadge(b.stock) },
    ], low, 'All books are well stocked 🎉')}
    <h3>Recent orders</h3>
    ${table([
      { h: 'Order', f: (o) => '#' + o.order_id }, { h: 'Customer', f: (o) => esc(o.customer) },
      { h: 'Date', f: (o) => fmtDate(o.order_date) },
      { h: 'Status', f: (o) => `<span class="badge b-${o.status}">${o.status}</span>` },
      { h: 'Total', num: 1, f: (o) => money(o.total_amount) },
    ], orders.slice(0, 5), 'No orders yet')}`;
}

/* ================= Books ================= */
async function books() {
  titleEl.textContent = 'Books';
  actions.innerHTML = '<button id="add">+ Add Book</button>';
  const [cats, auths] = await Promise.all([api('/categories'), api('/authors')]);
  view.innerHTML = `
    <div class="filters">
      <input id="q" placeholder="Search title, author or ISBN…">
      <select id="fc"><option value="">All categories</option>${opts(cats, 'category_id', 'name')}</select>
      <select id="fa"><option value="">All authors</option>${opts(auths, 'author_id', 'name')}</select>
    </div>
    <div id="list"></div>`;

  const load = guard(async () => {
    const p = new URLSearchParams();
    if ($('#q').value) p.set('q', $('#q').value);
    if ($('#fc').value) p.set('category_id', $('#fc').value);
    if ($('#fa').value) p.set('author_id', $('#fa').value);
    const rows = await api('/books?' + p);
    $('#list').innerHTML = table([
      { h: 'ID', f: (b) => b.book_id }, { h: 'ISBN', f: (b) => esc(b.isbn) },
      { h: 'Title', f: (b) => `<strong>${esc(b.title)}</strong>` },
      { h: 'Author', f: (b) => esc(b.author) }, { h: 'Category', f: (b) => esc(b.category) },
      { h: 'Year', f: (b) => b.published_year || '–' },
      { h: 'Price', num: 1, f: (b) => money(b.price) },
      { h: 'Stock', f: (b) => stockBadge(b.stock) },
      { h: '', f: (b) => `<div class="row-actions">
          <button class="sm secondary" data-edit="${b.book_id}">Edit</button>
          <button class="sm danger" data-del="${b.book_id}" data-t="${esc(b.title)}">Delete</button></div>` },
    ], rows, 'No books match');
    $('#list').querySelectorAll('[data-edit]').forEach((el) => (el.onclick = () => bookForm(rows.find((b) => b.book_id == el.dataset.edit))));
    $('#list').querySelectorAll('[data-del]').forEach((el) => (el.onclick = guard(async () => {
      if (!confirm(`Delete "${el.dataset.t}"?`)) return;
      await api('/books/' + el.dataset.del, { method: 'DELETE' });
      toast('Book deleted'); load();
    })));
  });

  function bookForm(b = {}) {
    if (!auths.length || !cats.length) return toast('Add at least one author and one category first', 'err');
    openModal(b.book_id ? 'Edit Book' : 'Add Book', `
      <form id="f" class="form-grid">
        <div><label>ISBN *</label><input name="isbn" required maxlength="20" value="${esc(b.isbn)}"></div>
        <div><label>Published year</label><input name="published_year" type="number" min="1000" max="2100" value="${esc(b.published_year)}"></div>
        <div class="full"><label>Title *</label><input name="title" required maxlength="200" value="${esc(b.title)}"></div>
        <div><label>Author *</label><select name="author_id" required>${opts(auths, 'author_id', 'name', b.author_id)}</select></div>
        <div><label>Category *</label><select name="category_id" required>${opts(cats, 'category_id', 'name', b.category_id)}</select></div>
        <div><label>Price (₹) *</label><input name="price" type="number" min="0" step="0.01" required value="${esc(b.price)}"></div>
        <div><label>Stock *</label><input name="stock" type="number" min="0" step="1" required value="${esc(b.stock ?? 0)}"></div>
        <div class="form-actions full"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button>Save</button></div>
      </form>`);
    $('#f').onsubmit = guard(async (e) => {
      e.preventDefault();
      await api(b.book_id ? '/books/' + b.book_id : '/books', { method: b.book_id ? 'PUT' : 'POST', body: formData(e.target) });
      closeModal(); toast(b.book_id ? 'Book updated' : 'Book added'); load();
    });
  }

  $('#add').onclick = () => bookForm();
  ['q', 'fc', 'fa'].forEach((id) => $('#' + id).addEventListener(id === 'q' ? 'input' : 'change', load));
  load();
}

/* ================= Orders ================= */
async function orders() {
  titleEl.textContent = 'Orders';
  actions.innerHTML = '<button id="add" class="accent">+ Place Order</button>';
  view.innerHTML = '<div id="list"></div>';
  const rows = await api('/orders');
  const reload = guard(orders);

  $('#list').innerHTML = table([
    { h: 'Order', f: (o) => '#' + o.order_id }, { h: 'Customer', f: (o) => `${esc(o.customer)}<br><small>${esc(o.email)}</small>` },
    { h: 'Date', f: (o) => fmtDate(o.order_date) }, { h: 'Items', num: 1, f: (o) => o.total_items },
    { h: 'Status', f: (o) => `<span class="badge b-${o.status}">${o.status}</span>` },
    { h: 'Total', num: 1, f: (o) => money(o.total_amount) },
    { h: '', f: (o) => `<div class="row-actions"><button class="sm secondary" data-view="${o.order_id}">View</button></div>` },
  ], rows, 'No orders yet — place the first one');
  $('#list').querySelectorAll('[data-view]').forEach((el) => (el.onclick = guard(() => orderDetail(el.dataset.view, reload))));
  $('#add').onclick = guard(() => orderForm(reload));
}

async function orderDetail(id, reload) {
  const o = await api('/orders/' + id);
  const next = { PLACED: 'SHIPPED', SHIPPED: 'DELIVERED' }[o.status];
  openModal('Order #' + o.order_id, `
    <p><strong>${esc(o.customer)}</strong> · ${esc(o.email)}<br>${fmtDate(o.order_date)} · <span class="badge b-${o.status}">${o.status}</span></p>
    ${table([
      { h: 'Book', f: (i) => esc(i.title) }, { h: 'Qty', num: 1, f: (i) => i.quantity },
      { h: 'Price', num: 1, f: (i) => money(i.unit_price) }, { h: 'Line total', num: 1, f: (i) => money(i.line_total) },
    ], o.items)}
    <div class="order-total">Total: ${money(o.total_amount)}</div>
    <div class="form-actions">
      ${o.status === 'PLACED' || o.status === 'SHIPPED' ? '<button class="danger" id="cancel">Cancel order</button>' : ''}
      ${next ? `<button id="adv">Mark ${next}</button>` : ''}
      <button class="secondary" onclick="closeModal()">Close</button>
    </div>`);
  const setStatus = (status) => guard(async () => {
    if (status === 'CANCELLED' && !confirm('Cancel this order? Stock will be returned to inventory.')) return;
    await api(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
    closeModal(); toast('Order ' + status.toLowerCase()); reload();
  });
  if (next) $('#adv').onclick = setStatus(next);
  if ($('#cancel')) $('#cancel').onclick = setStatus('CANCELLED');
}

async function orderForm(reload) {
  const [customers, books] = await Promise.all([api('/customers'), api('/books')]);
  const avail = books.filter((b) => b.stock > 0);
  if (!customers.length) return toast('Add a customer first', 'err');
  if (!avail.length) return toast('No books in stock', 'err');
  const bookOpts = avail.map((b) => `<option value="${b.book_id}" data-price="${b.price}" data-stock="${b.stock}">${esc(b.title)} — ${money(b.price)} (${b.stock} in stock)</option>`).join('');

  openModal('Place Order', `
    <form id="f">
      <label>Customer *</label>
      <select name="customer_id" required>${opts(customers, 'customer_id', (c) => `${c.name} (${c.email})`)}</select>
      <label style="margin-top:14px">Books *</label>
      <div id="lines"></div>
      <button type="button" class="secondary sm" id="addline">+ Add another book</button>
      <div class="order-total" id="total">Total: ₹0.00</div>
      <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="accent">Place Order</button></div>
    </form>`);

  const lines = $('#lines');
  const recalc = () => {
    let t = 0;
    lines.querySelectorAll('.line').forEach((l) => {
      const sel = $('select', l), q = $('input', l), o = sel.selectedOptions[0];
      q.max = o.dataset.stock;
      t += Number(o.dataset.price) * (Number(q.value) || 0);
    });
    $('#total').textContent = 'Total: ' + money(t);
  };
  const addLine = () => {
    const d = document.createElement('div');
    d.className = 'line';
    d.innerHTML = `<select>${bookOpts}</select><input type="number" min="1" step="1" value="1" required><button type="button" class="x" title="Remove">&times;</button>`;
    d.addEventListener('input', recalc);
    $('.x', d).onclick = () => { if (lines.children.length > 1) { d.remove(); recalc(); } };
    lines.appendChild(d); recalc();
  };
  addLine();
  $('#addline').onclick = addLine;

  $('#f').onsubmit = guard(async (e) => {
    e.preventDefault();
    const items = [...lines.querySelectorAll('.line')].map((l) => ({ book_id: $('select', l).value, quantity: $('input', l).value }));
    const r = await api('/orders', { method: 'POST', body: { customer_id: e.target.customer_id.value, items } });
    closeModal(); toast(`Order #${r.order_id} placed · ${money(r.total_amount)} · stock updated`); reload();
  });
}

/* ================= Simple CRUD lists ================= */
function simpleView({ title, path, idKey, cols, fields, addLabel }) {
  return async () => {
    titleEl.textContent = title;
    actions.innerHTML = `<button id="add">+ ${addLabel}</button>`;
    const rows = await api(path);
    view.innerHTML = table([...cols, {
      h: '', f: (r) => `<div class="row-actions"><button class="sm danger" data-del="${r[idKey]}">Delete</button></div>`,
    }], rows);
    view.querySelectorAll('[data-del]').forEach((el) => (el.onclick = guard(async () => {
      if (!confirm('Delete this record?')) return;
      await api(`${path}/${el.dataset.del}`, { method: 'DELETE' });
      toast('Deleted'); route();
    })));
    $('#add').onclick = () => {
      openModal(addLabel, `<form id="f" class="form-grid">
        ${fields.map((f) => `<div class="${f.full ? 'full' : ''}"><label>${f.label}${f.required ? ' *' : ''}</label>
          <input name="${f.name}" type="${f.type || 'text'}" ${f.required ? 'required' : ''}></div>`).join('')}
        <div class="form-actions full"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button>Save</button></div></form>`);
      $('#f').onsubmit = guard(async (e) => {
        e.preventDefault();
        await api(path, { method: 'POST', body: formData(e.target) });
        closeModal(); toast('Saved'); route();
      });
    };
  };
}

const customers = simpleView({
  title: 'Customers', path: '/customers', idKey: 'customer_id', addLabel: 'Add Customer',
  cols: [
    { h: 'ID', f: (r) => r.customer_id }, { h: 'Name', f: (r) => `<strong>${esc(r.name)}</strong>` },
    { h: 'Email', f: (r) => esc(r.email) }, { h: 'Phone', f: (r) => esc(r.phone || '–') },
    { h: 'Address', f: (r) => esc(r.address || '–') }, { h: 'Orders', num: 1, f: (r) => r.order_count },
  ],
  fields: [
    { name: 'name', label: 'Name', required: 1 }, { name: 'email', label: 'Email', type: 'email', required: 1 },
    { name: 'phone', label: 'Phone' }, { name: 'address', label: 'Address', full: 1 },
  ],
});

const authors = simpleView({
  title: 'Authors', path: '/authors', idKey: 'author_id', addLabel: 'Add Author',
  cols: [
    { h: 'ID', f: (r) => r.author_id }, { h: 'Name', f: (r) => `<strong>${esc(r.name)}</strong>` },
    { h: 'Country', f: (r) => esc(r.country || '–') }, { h: 'Bio', f: (r) => esc(r.bio || '–') },
    { h: 'Books', num: 1, f: (r) => r.book_count },
  ],
  fields: [
    { name: 'name', label: 'Name', required: 1 }, { name: 'country', label: 'Country' },
    { name: 'bio', label: 'Bio', full: 1 },
  ],
});

const categories = simpleView({
  title: 'Categories', path: '/categories', idKey: 'category_id', addLabel: 'Add Category',
  cols: [
    { h: 'ID', f: (r) => r.category_id }, { h: 'Name', f: (r) => `<strong>${esc(r.name)}</strong>` },
    { h: 'Description', f: (r) => esc(r.description || '–') }, { h: 'Books', num: 1, f: (r) => r.book_count },
  ],
  fields: [{ name: 'name', label: 'Name', required: 1, full: 1 }, { name: 'description', label: 'Description', full: 1 }],
});

route();
