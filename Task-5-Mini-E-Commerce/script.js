// ---------- Data ----------
const PRODUCTS = [
  { id: 1, name: "Assam Morning",     origin: "Assam",        type: "Black",  price: 420, image: "images/tea-1.svg", rating: 4.6, reviews: 212, color: "#f6d9a8" },
  { id: 2, name: "Darjeeling First Flush", origin: "Darjeeling", type: "Black", price: 780, image: "images/tea-2.svg", rating: 4.8, reviews: 148, color: "#d6ecd0" },
  { id: 3, name: "Nilgiri Frost",     origin: "Nilgiris",     type: "Green",  price: 560, image: "images/tea-3.svg", rating: 4.5, reviews: 96, color: "#c6e7dc" },
  { id: 4, name: "Masala Chai Blend", origin: "Kerala spices", type: "Spiced", price: 350, image: "images/tea-4.svg", rating: 4.7, reviews: 320, color: "#f7c9b6" },
  { id: 5, name: "Chamomile Dusk",    origin: "Himachal",     type: "Herbal", price: 480, image: "images/tea-5.svg", rating: 4.4, reviews: 87, color: "#fbe9a6" },
  { id: 6, name: "Tulsi Ginger",      origin: "Uttarakhand",  type: "Herbal", price: 390, image: "images/tea-6.svg", rating: 4.3, reviews: 64, color: "#d3ebb8" },
  { id: 7, name: "Jasmine Pearls",    origin: "Sikkim",       type: "Green",  price: 690, image: "images/tea-7.svg", rating: 4.9, reviews: 175, color: "#e5e1f4" },
  { id: 8, name: "Cardamom Kadak",    origin: "Munnar",       type: "Spiced", price: 410, image: "images/tea-8.svg", rating: 4.6, reviews: 201, color: "#e9d2bd" },
];
const SHIPPING_FLAT = 49, FREE_SHIPPING_OVER = 999, TAX_RATE = 0.05;

// ---------- State ----------
let cart = loadCart();      // { [productId]: quantity }
let activeType = "All";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const byId = (id) => PRODUCTS.find((p) => p.id === Number(id));

function loadCart() {
  try { return JSON.parse(localStorage.getItem("chai-cart")) || {}; } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem("chai-cart", JSON.stringify(cart)); } catch {}
}
function cartLines() {
  return Object.entries(cart).map(([id, qty]) => ({ product: byId(id), qty }));
}
function totals() {
  const lines = cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  return { count, subtotal, shipping, tax, grand: subtotal + shipping + tax };
}

// ---------- Rendering ----------
function renderFilters() {
  const types = ["All", ...new Set(PRODUCTS.map((p) => p.type))];
  $("filters").innerHTML = types.map((t) =>
    `<button class="chip" data-type="${t}" aria-pressed="${t === activeType}">${t}</button>`).join("");
}

function renderProducts() {
  const items = PRODUCTS.filter((p) => activeType === "All" || p.type === activeType);
  $("products").innerHTML = items.map((p) => `
    <article class="card">
      <div class="swatch" style="background:${p.color}"><img src="${p.image}" alt="${p.name} tea pouch" loading="lazy"></div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <span class="origin">${p.type} tea · ${p.origin} · 100 g</span>
        <span class="rating" aria-label="Rated ${p.rating} out of 5"><span class="stars">★</span> ${p.rating} <small>(${p.reviews})</small></span>
        <div class="card-foot">
          <span class="price">${money(p.price)}</span>
          <button class="add" data-add="${p.id}" aria-label="Add ${p.name} to cart">Add to cart</button>
        </div>
      </div>
    </article>`).join("");
}

function renderCart() {
  const lines = cartLines();
  const t = totals();
  $("cart-count").textContent = t.count;
  $("cart-total").textContent = money(t.subtotal);
  $("checkout-btn").disabled = t.count === 0;
  $("clear-cart").hidden = t.count === 0;
  $("cart-list").innerHTML = lines.length
    ? lines.map(({ product: p, qty }) => `
      <li class="cart-item">
        <img class="mini" src="${p.image}" alt="${p.name}">
        <div>
          <strong>${p.name}</strong><br><small>${money(p.price)} each</small>
          <div class="qty">
            <button data-dec="${p.id}" aria-label="Remove one ${p.name}">−</button>
            <span>${qty}</span>
            <button data-inc="${p.id}" aria-label="Add one ${p.name}">+</button>
          </div>
        </div>
        <strong>${money(p.price * qty)}</strong>
      </li>`).join("")
    : `<li class="empty">Your cart is empty. Add a tea to get started.</li>`;
  saveCart();
}

// ---------- Cart actions ----------
function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  renderCart();
  const badge = $("cart-count");
  badge.classList.remove("bump"); void badge.offsetWidth; badge.classList.add("bump");
  toast(`Added ${byId(id).name}`);
}
function changeQty(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  renderCart();
}

// ---------- Drawer & modal ----------
function openDrawer() { $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("scrim").hidden = false; }
function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); $("scrim").hidden = true; }

function openModal() {
  const t = totals();
  $("modal-title").textContent = "Order preview";
  $("modal-body").innerHTML =
    cartLines().map(({ product: p, qty }) =>
      `<div class="sum-line"><span>${p.name} × ${qty}</span><span>${money(p.price * qty)}</span></div>`).join("") +
    `<div class="sum-line"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
     <div class="sum-line"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : "Free"}</span></div>
     <div class="sum-line"><span>Tax (5%)</span><span>${money(t.tax)}</span></div>
     <div class="sum-line sum-total"><span>Total</span><span>${money(t.grand)}</span></div>`;
  $("modal-confirm").hidden = false;
  $("modal-back").textContent = "Keep shopping";
  $("modal").hidden = false;
  $("modal-confirm").focus();
}
function closeModal() { $("modal").hidden = true; }

function placeOrder() {
  const t = totals();
  $("modal-title").textContent = "Order placed";
  $("modal-body").innerHTML =
    `<div class="done"><div class="big">🎉</div>
     <p>Thanks! ${t.count} item${t.count > 1 ? "s" : ""} for ${money(t.grand)} are on their way.</p>
     <p><small>This is a demo, so no payment was taken.</small></p></div>`;
  $("modal-confirm").hidden = true;
  $("modal-back").textContent = "Close";
  cart = {};
  renderCart();
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

// ---------- Events ----------
$("filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]"); if (!b) return;
  activeType = b.dataset.type; renderFilters(); renderProducts();
});
$("products").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]"); if (b) addToCart(b.dataset.add);
});
$("cart-list").addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
  if (inc) changeQty(inc.dataset.inc, 1);
  if (dec) changeQty(dec.dataset.dec, -1);
});
$("open-cart").addEventListener("click", openDrawer);
$("close-cart").addEventListener("click", closeDrawer);
$("scrim").addEventListener("click", closeDrawer);
$("clear-cart").addEventListener("click", () => { cart = {}; renderCart(); });
$("checkout-btn").addEventListener("click", () => { closeDrawer(); openModal(); });
$("modal-back").addEventListener("click", closeModal);
$("modal-confirm").addEventListener("click", placeOrder);
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });

// ---------- Init ----------
renderFilters(); renderProducts(); renderCart();
