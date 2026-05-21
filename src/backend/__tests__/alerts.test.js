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

        it('should handle milestone alerts correctly when total transactions milestone reached', async () => {
            supabase.from.mockImplementation((table) => {
                if (table === 'products') return createQueryMock([]);
                if (table === 'customers') return createQueryMock([]);
                if (table === 'expenses') return createQueryMock([]);
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
            const milestoneAlert = alerts.find(a => a.type === 'milestone');
            expect(milestoneAlert).toBeDefined();
            expect(milestoneAlert.title).toContain('10 Sales Milestone');
        });

        it('should handle daily performance change warnings', async () => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1);

            supabase.from.mockImplementation((table) => {
                if (table === 'products') return createQueryMock([]);
                if (table === 'customers') return createQueryMock([]);
                if (table === 'expenses') return createQueryMock([]);
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
        
        it('should gracefully handle errors during alert generation without throwing', async () => {
            supabase.from.mockImplementation(() => {
                throw new Error('Supabase failed');
            });

            const alerts = await generateAlerts();
            expect(alerts).toEqual([]);
        });
    });
});
