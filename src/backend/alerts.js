import { db } from '../database/db';

/**
 * Generate all smart alerts from current data
 * Returns array of alert objects: { id, type, icon, title, message, severity, action? }
 * severity: 'critical' | 'warning' | 'info' | 'success'
 */
export async function generateAlerts() {
    const alerts = [];

    try {
        const [
            lowStockAlerts,
            creditAlerts,
            performanceAlerts,
            expenseAlerts,
            milestoneAlerts
        ] = await Promise.all([
            checkLowStock(),
            checkOverdueCredits(),
            checkDailyPerformance(),
            checkExpenseAnomalies(),
            checkMilestones()
        ]);

        alerts.push(...lowStockAlerts);
        alerts.push(...creditAlerts);
        alerts.push(...performanceAlerts);
        alerts.push(...expenseAlerts);
        alerts.push(...milestoneAlerts);
    } catch (_err) {
        // Silently handle errors - alerts are non-critical
    }

    // Sort: critical first, then warning, info, success
    const order = { critical: 0, warning: 1, info: 2, success: 3 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);

    return alerts;
}

/**
 * Check for low stock products
 */
async function checkLowStock() {
    const alerts = [];
    const settings = await db.settings.get('low_stock_threshold');
    const threshold = parseInt(settings?.value) || 5;

    const products = await db.products.toArray();
    const outOfStock = products.filter(p => p.stock_quantity === 0);
    const lowStock = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= threshold);

    if (outOfStock.length > 0) {
        alerts.push({
            id: 'out-of-stock',
            type: 'stock',
            icon: '🚫',
            title: 'Out of Stock!',
            message: `${outOfStock.length} product${outOfStock.length > 1 ? 's are' : ' is'} completely out of stock: ${outOfStock.slice(0, 3).map(p => p.name).join(', ')}${outOfStock.length > 3 ? ` +${outOfStock.length - 3} more` : ''}`,
            severity: 'critical'
        });
    }

    if (lowStock.length > 0) {
        alerts.push({
            id: 'low-stock',
            type: 'stock',
            icon: '📦',
            title: 'Low Stock Warning',
            message: `${lowStock.length} product${lowStock.length > 1 ? 's are' : ' is'} running low: ${lowStock.slice(0, 3).map(p => `${p.name} (${p.stock_quantity})`).join(', ')}`,
            severity: 'warning'
        });
    }

    return alerts;
}

/**
 * Check customers with overdue credit
 */
async function checkOverdueCredits() {
    const alerts = [];
    const customers = await db.customers?.toArray() || [];
    const withDebt = customers.filter(c => (c.balance || 0) > 0);

    if (withDebt.length === 0) return alerts;

    // Total outstanding credit
    const totalCredit = withDebt.reduce((sum, c) => sum + (c.balance || 0), 0);

    // Find biggest debtor
    const sorted = [...withDebt].sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const biggest = sorted[0];

    if (totalCredit > 0) {
        const currSetting = await db.settings.get('currency');
        const currency = currSetting?.value || '₹';

        alerts.push({
            id: 'credit-outstanding',
            type: 'credit',
            icon: '💰',
            title: `${currency}${totalCredit.toFixed(0)} Outstanding Credit`,
            message: `${withDebt.length} customer${withDebt.length > 1 ? 's have' : ' has'} pending payments. Highest: ${biggest.name} (${currency}${biggest.balance.toFixed(0)})`,
            severity: withDebt.length > 3 ? 'warning' : 'info'
        });
    }

    return alerts;
}

/**
 * Compare today's performance with yesterday
 */
async function checkDailyPerformance() {
    const alerts = [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const allSales = await db.sales.toArray();
    const nonRefunded = allSales.filter(s => !s.refunded);

    const todaySales = nonRefunded.filter(s => new Date(s.date) >= startOfToday);
    const yesterdaySales = nonRefunded.filter(s => {
        const d = new Date(s.date);
        return d >= startOfYesterday && d < startOfToday;
    });

    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);

    const currSetting = await db.settings.get('currency');
    const currency = currSetting?.value || '₹';

    // No sales yet today
    if (todaySales.length === 0 && now.getHours() >= 10) {
        alerts.push({
            id: 'no-sales-today',
            type: 'performance',
            icon: '📢',
            title: 'No Sales Yet Today',
            message: 'Start your first sale to get the day going!',
            severity: 'info'
        });
        return alerts;
    }

    // Compare with yesterday
    if (yesterdayRevenue > 0 && todaySales.length > 0) {
        const change = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

        if (change > 0) {
            alerts.push({
                id: 'performance-up',
                type: 'performance',
                icon: '📈',
                title: 'Sales Are Up!',
                message: `Today's revenue ${currency}${todayRevenue.toFixed(0)} is ${change.toFixed(0)}% higher than yesterday (${currency}${yesterdayRevenue.toFixed(0)})`,
                severity: 'success'
            });
        } else if (change < -20) {
            alerts.push({
                id: 'performance-down',
                type: 'performance',
                icon: '📉',
                title: 'Sales Dip Today',
                message: `Revenue is ${Math.abs(change).toFixed(0)}% lower than yesterday. Yesterday: ${currency}${yesterdayRevenue.toFixed(0)}, Today: ${currency}${todayRevenue.toFixed(0)}`,
                severity: 'info'
            });
        }
    }

    return alerts;
}

/**
 * Check for expense anomalies
 */
async function checkExpenseAnomalies() {
    const alerts = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allExpenses = await db.expenses?.toArray() || [];
    const todayExpenses = allExpenses.filter(e => new Date(e.date) >= startOfToday);
    const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    if (todayTotal === 0) return alerts;

    // Calculate average daily expense over last 7 days
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekExpenses = allExpenses.filter(e => {
        const d = new Date(e.date);
        return d >= weekAgo && d < startOfToday;
    });
    const weekTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avgDaily = weekTotal / 7;

    const currSetting = await db.settings.get('currency');
    const currency = currSetting?.value || '₹';

    if (avgDaily > 0 && todayTotal > avgDaily * 1.5) {
        const pctHigher = (((todayTotal - avgDaily) / avgDaily) * 100).toFixed(0);
        alerts.push({
            id: 'expense-high',
            type: 'expense',
            icon: '⚠️',
            title: 'High Expenses Today',
            message: `${currency}${todayTotal.toFixed(0)} spent today — ${pctHigher}% above your daily average of ${currency}${avgDaily.toFixed(0)}`,
            severity: 'warning'
        });
    }

    return alerts;
}

/**
 * Check for milestones
 */
async function checkMilestones() {
    const alerts = [];
    const allSales = await db.sales.toArray();
    const nonRefunded = allSales.filter(s => !s.refunded);

    const totalTransactions = nonRefunded.length;
    const totalRevenue = nonRefunded.reduce((sum, s) => sum + s.total, 0);

    const currSetting = await db.settings.get('currency');
    const currency = currSetting?.value || '₹';

    // Transaction milestones
    const txMilestones = [10, 25, 50, 100, 250, 500, 1000];
    for (const milestone of txMilestones) {
        if (totalTransactions >= milestone && totalTransactions < milestone + 5) {
            alerts.push({
                id: `milestone-tx-${milestone}`,
                type: 'milestone',
                icon: '🎉',
                title: `${milestone} Sales Milestone!`,
                message: `Congratulations! You've completed ${milestone}+ transactions on BillMate!`,
                severity: 'success'
            });
            break;
        }
    }

    // Revenue milestones
    const revMilestones = [10000, 50000, 100000, 500000, 1000000];
    for (const milestone of revMilestones) {
        if (totalRevenue >= milestone && totalRevenue < milestone * 1.1) {
            const label = milestone >= 100000 ? `${(milestone / 100000).toFixed(0)}L` : `${(milestone / 1000).toFixed(0)}K`;
            alerts.push({
                id: `milestone-rev-${milestone}`,
                type: 'milestone',
                icon: '🏆',
                title: `${currency}${label} Revenue Crossed!`,
                message: `Your total revenue has crossed ${currency}${label}. Your business is growing!`,
                severity: 'success'
            });
            break;
        }
    }

    return alerts;
}
