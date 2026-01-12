/**
 * E-commerce schema fixture for integration testing
 * Tests: RLS, indexes, RPC functions, complex relations, tags
 */
import { defineData, field, hasMany, belongsTo } from '../../../../schema';

/**
 * Product entity with RLS and indexes
 */
export const Product = defineData('product', {
  id: field.uuid(),
  name: field.commerce.productName(),
  price: field.number({ min: 0 }),
  sku: field.string().unique(),
  categoryId: field.uuid().nullable(),
  tenantId: field.uuid(),

  category: belongsTo('category', { foreignKey: 'categoryId' }),
  orderItems: hasMany('orderItem', { foreignKey: 'productId' }),
}, {
  timestamps: true,
  tags: ['core', 'catalog'],
  module: 'inventory',
  rls: {
    scope: [{ field: 'tenantId', contextKey: 'tenantId' }],
    bypass: [{ contextKey: 'role', values: ['admin'] }],
  },
  indexes: [
    { fields: ['sku'], unique: true },
    { fields: ['tenantId', 'categoryId'], type: 'btree' },
  ],
  rpc: {
    getTopSellers: {
      args: [
        { name: 'limit_count', type: 'int' },
        { name: 'since_date', type: 'date' },
      ],
      returns: 'product[]',
      sql: `SELECT p.* FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            WHERE oi.created_at > since_date
            GROUP BY p.id
            ORDER BY SUM(oi.quantity) DESC
            LIMIT limit_count`,
      volatility: 'stable',
    },
  },
});

/**
 * Category entity with self-reference
 */
export const Category = defineData('category', {
  id: field.uuid(),
  name: field.commerce.department(),
  parentId: field.uuid().nullable(),

  products: hasMany('product', { foreignKey: 'categoryId' }),
  parent: belongsTo('category', { foreignKey: 'parentId' }),
}, {
  timestamps: true,
  tags: ['core', 'catalog'],
});

/**
 * Order entity with custom RLS filters
 */
export const Order = defineData('order', {
  id: field.uuid(),
  customerId: field.uuid(),
  status: field.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const),
  totalAmount: field.number(),

  items: hasMany('orderItem', { foreignKey: 'orderId' }),
}, {
  timestamps: true,
  tags: ['core', 'orders'],
  rls: {
    select: (row, ctx) => row.customerId === ctx?.userId,
    insert: (row, ctx) => row.customerId === ctx?.userId,
    update: (row, ctx) => row.customerId === ctx?.userId,
    delete: (_row, ctx) => ctx?.role === 'admin',
  },
});

/**
 * OrderItem entity
 */
export const OrderItem = defineData('orderItem', {
  id: field.uuid(),
  orderId: field.uuid(),
  productId: field.uuid(),
  quantity: field.number({ min: 1 }),
  unitPrice: field.number(),

  order: belongsTo('order', { foreignKey: 'orderId' }),
  product: belongsTo('product', { foreignKey: 'productId' }),
}, {
  timestamps: true,
  tags: ['orders'],
});

export const schemas = [Product, Category, Order, OrderItem];
