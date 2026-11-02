# 🧾 BillMate — Smart Offline-First POS for Small Businesses

<div align="center">

**Simple, resilient billing for smart vendors — online or completely offline.**

A modern, responsive, offline-first Point-of-Sale (POS) Progressive Web Application built for small shops, kirana stores, and retail vendors. Manage billing, inventory movements, customer khata, supplier purchases, and analytics without interruption, even without an internet connection.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-blue?logo=javascript&logoColor=white)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud%20Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000?logo=vercel&logoColor=white)](https://vercel.com/)
[![Vitest](https://img.shields.io/badge/Tests-157%20Passed-green?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

</div>

---

## ⚡ What Makes BillMate Genuinely Offline-First?

Unlike traditional cloud POS applications that freeze or fail when network connectivity drops, BillMate is engineered with a **local-first, cloud-synchronized architecture**:

- 📴 **Zero-Downtime Billing**: Create bills, scan barcodes, apply discounts, and accept Cash or UPI payments with zero internet connection.
- 🔐 **PBKDF2 Offline PIN Security**: Lock and unlock your local register offline using a locally enrolled 4–8 digit PIN derived with 100,000 PBKDF2-HMAC-SHA256 iterations and persistent lockout protection.
- 📦 **Delta-Based Inventory Reconciliation**: Physical sales decrement stock locally and append to an audit ledger (`inventory_movements`) using client-generated UUIDs. When internet returns, cloud stock converges accurately without overwriting concurrent sales from other registers.
- 🔄 **Autonomous Outbox Sync Engine**: Offline mutations are queued in an ACID-compliant IndexedDB table (`sync_queue`) with exponential backoff retries. Transactions are sent to PostgreSQL stored procedures (`sync_sale_offline`, `sync_purchase_offline`) with strict hardware-level idempotency keys.
- 👥 **Offline Customer Khata**: Issue credit sales and record customer balance settlements offline with automatic UUID re-mapping upon cloud synchronization.
- 📊 **Offline Analytics & Summaries**: Daily summaries, top-selling products, and financial reports aggregate directly from local Dexie data.

---

## ✨ Features

### 🛒 Billing & POS
- **Quick checkout** with camera barcode scanner and instant product search.
- **Dynamic UPI QR Code generation** rendered locally via canvas (scannable by Google Pay, PhonePe, Paytm, etc.).
- **Discount engine** supporting percentage or flat amount discounts.
- **Payment modes**: Cash, UPI, and Credit (Customer Khata).
- **Undo last sale** for rapid error correction at the counter.
- **Digital & WhatsApp receipts** formatted and shared directly to customer phones.

### 📦 Inventory & Stock Control
- Full product CRUD with categories, cost price, selling price, and real-time stock levels.
- **Inventory Movements Ledger**: Immutable append-only audit trail capturing sales, purchases, and restocks.
- **Low-stock indicators** and automated replenishment alerts.
- **Quick restock** directly from catalog cards.

### 👥 Customer Management (Khata)
- Maintain a digital customer ledger with real-time balance tracking.
- Record credit sales and offline partial/full settlements.
- Settle history and transaction log per customer.

### 🚚 Supplier & Purchase Orders
- Supplier directory with contact details and address records.
- Record purchases that atomically increment stock levels locally and in the cloud.
- Purchase idempotency keys preventing duplicate stock increments on retried syncs.

### 💰 Expense Tracking
- Track operational expenses (Rent, Utilities, Wages, Supplies, etc.).
- Filter and review historical expense totals.

### 📊 Dashboard & Reports
- Real-time revenue, estimated profit, and transaction count at a glance.
- Date range filtering and top-5 best-selling product leaderboards.
- Day summary report for end-of-day register balancing.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | [React 19](https://react.dev/) + [Vite 7](https://vite.dev/) | High-performance reactive UI |
| **Local Database** | [Dexie.js 4](https://dexie.org/) (IndexedDB) | ACID-compliant client database |
| **Cloud Database** | [Supabase](https://supabase.com/) (PostgreSQL 15+) | Multi-tenant cloud synchronization |
| **Auth & Security** | Web Crypto API + Supabase Auth | PBKDF2 local PINs + RLS multi-tenancy |
| **PWA & Offline** | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox) | Offline caching & background service workers |
| **Barcode Scanner** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) | Camera-based hardware/mobile barcode scanning |
| **Testing** | [Vitest](https://vitest.dev/) + jsdom + fake-indexeddb | 23 suites / 157 automated tests |
| **Hosting** | [Vercel](https://vercel.com/) | Global edge hosting with `vercel.json` SPA rewrites |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0
- A [Supabase](https://supabase.com/) project (Free or Pro tier)

### 1. Clone the repository
```bash
git clone https://github.com/kousthub-eswar/BillMate.git
cd BillMate
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the project root based on `.env.example`:
```bash
cp .env.example .env
```

Configure your Supabase project URL and anon key:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

### 4. Database Setup & Migration
1. Open your Supabase project $\to$ **SQL Editor**.
2. Run `supabase_schema.sql` (baseline schema).
3. Run the migrations in sequence:
   - `supabase_migration_v2.sql`
   - `supabase_migration_v3.sql`
   - `supabase_migration_v4.sql`
   - `supabase_migration_v5_offline.sql` *(Crucial: adds offline UUIDs, inventory movements, and atomic sync RPCs)*.

### 5. Run the local development server
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🧪 Automated Testing

BillMate includes a comprehensive test suite covering offline repositories, synchronization queues, PBKDF2 hashing, and live PostgreSQL integration:

```bash
# Run the complete Vitest test suite (157 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Execute live staging PostgreSQL integration verification
node --env-file=.env tests/staging_live_integration.mjs
```

---

## 🏗️ Production Build & Deployment

### Production Build
```bash
npm run build:production
```

The output will be generated in `dist/`, including precached assets and the PWA Service Worker (`dist/sw.js`).

### Deploying to Vercel
1. Push your changes to GitHub (`git push origin main`).
2. Import the repository in your **[Vercel Dashboard](https://vercel.com/)**.
3. In **Project Settings** $\to$ **Environment Variables**, configure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   *(Ensure the **Production** checkbox is checked).*
4. Deploy. The included `vercel.json` ensures client-side routing works on all page refreshes.

---

## 📁 Project Structure

```
BillMate/
├── public/                     # Static assets and PWA icons
├── src/
│   ├── backend/                # Auth wrappers, alerts, and receipt generators
│   ├── components/             # Reusable UI components & modals
│   │   ├── DesktopSidebar.jsx  # Responsive desktop navigation
│   │   ├── BarcodeScanner.jsx  # Camera barcode scanning module
│   │   ├── UpiPaymentQr.jsx    # Dynamic offline UPI QR code generator
│   │   └── ErrorBoundary.jsx   # Root-level error boundary
│   ├── database/
│   │   ├── supabase.js         # Supabase client with strict env validation
│   │   └── local/              # Dexie.js offline-first repository layer
│   │       ├── db.js                   # IndexedDB schema (v1)
│   │       ├── offlineAuth.js          # PBKDF2 PIN hashing & session isolation
│   │       ├── localProductRepo.js     # Products & categories local repository
│   │       ├── localSaleRepo.js        # Sales, cart & dashboard aggregation
│   │       ├── localCustomerRepo.js    # Customers & Khata ledger local repo
│   │       ├── localPurchaseRepo.js    # Purchases & restock local repo
│   │       ├── localSupplierRepo.js    # Suppliers local repo
│   │       └── localExpenseRepo.js     # Expenses local repo
│   ├── pages/                  # Top-level screen components
│   │   ├── BillingPage.jsx     # Main POS billing interface
│   │   ├── ProductsPage.jsx    # Product inventory manager
│   │   ├── CustomersPage.jsx   # Khata ledger manager
│   │   ├── PurchasesPage.jsx   # Stock purchases
│   │   ├── DashboardPage.jsx   # Analytics dashboard
│   │   ├── DaySummaryPage.jsx  # Daily register report
│   │   ├── SettingsPage.jsx    # Shop settings & offline PIN enrollment
│   │   └── LoginPage.jsx       # Supabase login & offline PIN unlock
│   ├── services/
│   │   └── syncEngine.js       # Background sync queue coordinator
│   ├── App.jsx                 # Main application coordinator
│   └── main.jsx                # React root entry point
├── tests/                      # Automated regression & integration test suites
├── DATABASE_BACKUP_AND_RECOVERY_PLAN.md # Production backup & PITR runbook
├── supabase_migration_v5_offline.sql   # v5 Offline-first database migration
├── supabase_migration_v5_rollback.sql  # v5 Rollback script
├── vercel.json                 # Vercel SPA routing rewrites
└── vite.config.js              # Vite & PWA build configuration
```

---

## 🗄️ Database Backup & Disaster Recovery

Before executing production schema migrations, consult the **[Database Backup & Recovery Plan](DATABASE_BACKUP_AND_RECOVERY_PLAN.md)** for:
- Pre-migration `pg_dump` commands and snapshot verification.
- Supabase Point-In-Time-Recovery (PITR) guidelines.
- The forward-fix policy for active client outbox queues.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

<div align="center">

**Built with ❤️ for retail merchants and small businesses everywhere.**

</div>
