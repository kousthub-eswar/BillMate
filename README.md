# 🧾 BillMate — Smart POS for Small Businesses

<div align="center">

**Simple billing for smart vendors.**

A modern, mobile-first Point-of-Sale (POS) web application built for small shops, kirana stores, and street vendors. Manage billing, inventory, customers, suppliers, expenses, and more — all from your phone.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000?logo=vercel&logoColor=white)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

</div>

---

## ✨ Features

### 🛒 Billing & POS
- **Quick checkout** with barcode scanning (camera-based) and product search
- **Discount support** — percentage or flat amount per sale
- **Multiple payment methods** — Cash, UPI, Credit (Khata)
- **Undo last sale** — instantly reverse the most recent transaction
- **Digital receipts** — auto-generated receipt view after checkout

### 📦 Inventory Management
- Full **product CRUD** with categories, cost/selling price, and stock tracking
- **Barcode scanning** for quick product lookup
- **Quick restock** — add stock directly from the products page
- **Low-stock alerts** — get notified when items need replenishment
- **Bulk purchase entry** — record purchases from suppliers with automatic stock updates

### 👥 Customer Management (Khata)
- Maintain a **digital ledger** for credit customers
- Track outstanding **balances** and settle dues
- Link sales to customers for payment history

### 🚚 Supplier Management
- Add and manage suppliers with contact info and notes
- Record **purchases** against suppliers
- Track purchase history per supplier

### 💰 Expense Tracking
- Log business expenses by type (Rent, Salary, Utilities, etc.)
- Date-based expense history

### 📊 Dashboard & Analytics
- **Revenue, profit, and transaction count** at a glance
- **Top 5 selling products** for any date range
- **Day summary** — detailed daily business report

### ⚙️ Settings & Customization
- **Dark / Light theme** toggle
- **Business profile** configuration (shop name, currency, etc.)
- **Onboarding wizard** for first-time setup

### 🔐 Authentication & Security
- Email/password auth via **Supabase Auth**
- **Password reset** flow with email verification
- **Row Level Security (RLS)** — complete multi-tenant data isolation
- Each user's data is fully private and isolated

### 📱 Mobile-First PWA
- **Progressive Web App** — installable on any device
- **Service Worker** for offline caching
- Optimized for touch interactions and small screens
- Safe-area support for modern notched devices

---

## 🛠️ Tech Stack

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| **Frontend** | [React 19](https://react.dev/) + [Vite 7](https://vite.dev/)              |
| **Styling**  | Vanilla CSS with CSS custom properties (dark/light themes)                 |
| **Icons**    | [Lucide React](https://lucide.dev/)                                       |
| **Backend**  | [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS, RPC functions)  |
| **Scanning** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) (camera barcode)  |
| **Routing**  | [React Router DOM v7](https://reactrouter.com/)                           |
| **Hosting**  | [Vercel](https://vercel.com/)                                             |
| **Testing**  | [Vitest](https://vitest.dev/) + jsdom                                     |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A [Supabase](https://supabase.com/) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/kousthub-eswar/BillMate.git
cd BillMate
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project URL and anon key:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Set up the database

Run the SQL schema in your Supabase SQL Editor:

1. Open your Supabase project → **SQL Editor**
2. Copy and run `supabase_schema.sql` (creates all tables, indexes, RLS policies, and RPC functions)
3. Then run the migration files in order:
   - `supabase_migration_v2.sql`
   - `supabase_migration_v3.sql`
   - `supabase_migration_v4.sql`

### 5. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## 📁 Project Structure

```
BillMate/
├── public/
│   ├── icons/              # PWA icons
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service worker
├── src/
│   ├── backend/
│   │   ├── auth.js         # Supabase authentication helpers
│   │   ├── alerts.js       # Stock alert logic
│   │   ├── dataTools.js    # Data export/import utilities
│   │   └── receipt.js      # Receipt generation
│   ├── components/
│   │   ├── AlertsPanel.jsx     # Low-stock alert notifications
│   │   ├── AppHeader.jsx       # App header with sync status
│   │   ├── BarcodeScanner.jsx  # Camera-based barcode scanner
│   │   ├── ConfirmDialog.jsx   # Reusable confirmation modal
│   │   ├── ErrorBoundary.jsx   # React error boundary
│   │   ├── Logo.jsx            # App logo component
│   │   ├── OnboardingWizard.jsx# First-time setup wizard
│   │   ├── SplashScreen.jsx    # App splash screen
│   │   ├── Toast.jsx           # Toast notification system
│   │   └── __tests__/          # Component tests
│   ├── database/
│   │   ├── db.js               # Supabase client initialization
│   │   ├── supabase.js         # Supabase config
│   │   ├── productService.js   # Product CRUD operations
│   │   ├── salesService.js     # Sales & checkout logic
│   │   ├── customerService.js  # Customer CRUD operations
│   │   ├── supplierService.js  # Supplier CRUD operations
│   │   ├── purchaseService.js  # Purchase management
│   │   ├── expenseService.js   # Expense CRUD operations
│   │   └── __tests__/          # Database service tests
│   ├── pages/
│   │   ├── BillingPage.jsx     # Main POS checkout screen
│   │   ├── DashboardPage.jsx   # Business analytics dashboard
│   │   ├── DaySummaryPage.jsx  # Daily business summary
│   │   ├── ProductsPage.jsx    # Product management
│   │   ├── SalesPage.jsx       # Sales history
│   │   ├── CustomersPage.jsx   # Customer (Khata) management
│   │   ├── SuppliersPage.jsx   # Supplier management
│   │   ├── PurchasesPage.jsx   # Purchase history
│   │   ├── ExpensesPage.jsx    # Expense tracking
│   │   ├── SettingsPage.jsx    # App settings
│   │   └── LoginPage.jsx       # Authentication screen
│   ├── App.jsx             # Main app with routing & auth
│   ├── main.jsx            # React entry point
│   └── index.css           # Global styles & design system
├── email-templates/        # Supabase email templates
├── supabase_schema.sql     # Complete database schema
├── supabase_migration_*.sql# Incremental migrations
├── index.html              # HTML entry point
├── vite.config.js          # Vite configuration
├── vitest.config.js        # Vitest test configuration
└── package.json
```

---

## 🧪 Testing

Run the test suite:

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 🏗️ Build & Deploy

### Build for production

```bash
npm run build
```

The output will be in the `dist/` directory.

### Preview the production build

```bash
npm run preview
```

### Deploy to Vercel

The project is configured for Vercel deployment. Push to `main` and Vercel will auto-deploy, or:

```bash
npx vercel --prod
```

---

## 🗄️ Database Schema

BillMate uses a fully multi-tenant PostgreSQL schema on Supabase with Row Level Security. Key tables:

| Table             | Description                        |
| ----------------- | ---------------------------------- |
| `products`        | Product catalog with stock levels  |
| `customers`       | Customer ledger with balances      |
| `suppliers`       | Supplier directory                 |
| `sales`           | Sale transactions                  |
| `sale_items`      | Individual items in each sale      |
| `purchases`       | Purchase orders from suppliers     |
| `purchase_items`  | Individual items in each purchase  |
| `expenses`        | Business expense records           |
| `settings`        | Per-user app settings              |
| `audit_logs`      | Auto-generated change history      |

All tables use `user_id` for multi-tenant isolation with RLS policies ensuring users can only access their own data.

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ for small businesses everywhere.**

</div>
