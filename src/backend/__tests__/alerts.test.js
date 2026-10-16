import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAlerts } from '../alerts';
import { supabase } from '../../database/supabase';
import { getSetting } from '../../database/db';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../../database/supabase', () => ({
    supabase: {
        from: vi.fn()
    }
}));

vi.mock('../../database/db', () => ({
    getSetting: vi.fn()
}));

describe('alerts.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSetting.mockImplementation(async (key) => {
            if (key === 'low_stock_threshold') return '5';
            if (key === 'currency') return '₹';
            return null;
        });
    });

    describe('generateAlerts', () => {
        it('should generate alerts and sort them by severity (critical, warning, info, success)', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'products') {
                    return createQueryMock([
                        { id: 'p1', name: 'Milk', stock_quantity: 0 },
                        { id: 'p2', name: 'Bread', stock_quantity: 3 }
                    ]);
                }
                if (table === 'customers') {
                    return createQueryMock([
                        { id: 'c1', name: 'John', balance: 500 }
                    ]);
                }
                if (table === 'sales') {
                    return createQueryMock([
                        { id: 's1', total: 100, date: new Date().toISOString(), refunded: false },
                        { id: 's2', total: 200, date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), refunded: false }
                    ]);
                }
                if (table === 'expenses') {
                    return createQueryMock([]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();

            expect(alerts.length).toBeGreaterThan(0);
            
            const severities = alerts.map(a => a.severity);
            const sortedSeverities = [...severities].sort((a, b) => {
                const order = { critical: 0, warning: 1, info: 2, success: 3 };
                return order[a] - order[b];
            });
            expect(severities).toEqual(sortedSeverities);
        });

        it('should format out of stock with +more when more than 3 products are out of stock', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'products') {
                    return createQueryMock([
                        { id: 'p1', name: 'Milk', stock_quantity: 0 },
                        { id: 'p2', name: 'Bread', stock_quantity: 0 },
                        { id: 'p3', name: 'Butter', stock_quantity: 0 },
                        { id: 'p4', name: 'Eggs', stock_quantity: 0 }
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const outOfStockAlert = alerts.find(a => a.id === 'out-of-stock');
            expect(outOfStockAlert).toBeDefined();
            expect(outOfStockAlert.message).toContain('+1 more');
            expect(outOfStockAlert.severity).toBe('critical');
        });

        it('should assign warning severity to credit alert when more than 3 debtors exist', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'customers') {
                    return createQueryMock([
                        { id: 'c1', name: 'Alice', balance: 100 },
                        { id: 'c2', name: 'Bob', balance: 200 },
                        { id: 'c3', name: 'Charlie', balance: 300 },
                        { id: 'c4', name: 'David', balance: 400 }
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const creditAlert = alerts.find(a => a.id === 'credit-outstanding');
            expect(creditAlert).toBeDefined();
            expect(creditAlert.severity).toBe('warning');
            expect(creditAlert.message).toContain('David (₹400)');
        });

        it('should handle daily performance change warnings', async () => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1);

            supabase.from.mockImplementation((table) => {
                if (table === 'sales') {
                    return createQueryMock([
                        { id: 's1', total: 300, date: startOfToday.toISOString(), refunded: false },
                        { id: 's2', total: 200, date: startOfYesterday.toISOString(), refunded: false }
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const performanceAlert = alerts.find(a => a.id === 'performance-up');
            expect(performanceAlert).toBeDefined();
            expect(performanceAlert.message).toContain('50% higher than yesterday');
        });

        it('should alert on performance dip when revenue is >20% lower than yesterday', async () => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1);

            supabase.from.mockImplementation((table) => {
                if (table === 'sales') {
                    return createQueryMock([
                        { id: 's1', total: 50, date: startOfToday.toISOString(), refunded: false },
                        { id: 's2', total: 200, date: startOfYesterday.toISOString(), refunded: false }
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const dipAlert = alerts.find(a => a.id === 'performance-down');
            expect(dipAlert).toBeDefined();
            expect(dipAlert.title).toBe('Sales Dip Today');
        });

        it('should alert on expense anomalies when today expense exceeds 1.5x daily average', async () => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const threeDaysAgo = new Date(startOfToday);
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            supabase.from.mockImplementation((table) => {
                if (table === 'expenses') {
                    return createQueryMock([
                        { id: 'e1', amount: 700, date: threeDaysAgo.toISOString() }, // avg daily = 700/7 = 100
                        { id: 'e2', amount: 250, date: startOfToday.toISOString() }  // 250 > 150 (1.5x)
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const expenseAlert = alerts.find(a => a.id === 'expense-high');
            expect(expenseAlert).toBeDefined();
            expect(expenseAlert.title).toBe('High Expenses Today');
            expect(expenseAlert.severity).toBe('warning');
        });

        it('should handle milestone alerts correctly when total transactions milestone reached', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'sales') {
                    const sales = Array.from({ length: 10 }, (_, i) => ({
                        id: `s-${i}`,
                        total: 10,
                        date: new Date().toISOString(),
                        refunded: false
                    }));
                    return createQueryMock(sales);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const milestoneAlert = alerts.find(a => a.id === 'milestone-tx-10');
            expect(milestoneAlert).toBeDefined();
            expect(milestoneAlert.title).toContain('10 Sales Milestone');
        });

        it('should handle revenue milestones with Lakh formatting for >= 100,000', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'sales') {
                    return createQueryMock([
                        { id: 's1', total: 102000, date: new Date().toISOString(), refunded: false }
                    ]);
                }
                return createQueryMock([]);
            });

            const alerts = await generateAlerts();
            const revMilestone = alerts.find(a => a.id === 'milestone-rev-100000');
            expect(revMilestone).toBeDefined();
            expect(revMilestone.title).toContain('1L Revenue Crossed!');
        });
        
        it('should gracefully handle errors during alert generation without throwing', async () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            supabase.from.mockImplementation(() => {
                throw new Error('Supabase failed');
            });

            const alerts = await generateAlerts();
            expect(alerts).toEqual([]);
            consoleSpy.mockRestore();
        });
    });
});
