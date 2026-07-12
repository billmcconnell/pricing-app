import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['sales', 'admin'] }).notNull(),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Role = User['role'];

export const assumptions = sqliteTable('assumptions', {
  key: text('key').primaryKey(),
  value: real('value').notNull(),
  label: text('label').notNull(),
  category: text('category', { enum: ['unit-cost', 'behavioral', 'commercial'] }).notNull(),
  unit: text('unit'),
});

export type Assumption = typeof assumptions.$inferSelect;

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyCode: text('company_code').notNull().unique(),
  accountName: text('account_name'),
});

export const environments = sqliteTable('environments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  /** Raw feed identifier: a bare Company Code (1:1 case) or a full name like MOLH_imos_MPCC_PROD. */
  identifier: text('identifier').notNull().unique(),
  dbSizeGb: real('db_size_gb').notNull(),
  /** Raw Growth Rate ratio (0.2 = 20%/yr); null = never imported. The floor is applied at read time. */
  growthRate: real('growth_rate'),
  /** Set when the identifier vanished from the latest spaceused feed — flagged, never deleted. */
  missingFromLastImport: integer('missing_from_last_import', { mode: 'boolean' })
    .notNull()
    .default(false),
});

export const imports = sqliteTable('imports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feed: text('feed', { enum: ['spaceused', 'account-names', 'growth-rate'] }).notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  rowCount: integer('row_count').notNull(),
  filename: text('filename'),
});

export type Customer = typeof customers.$inferSelect;
export type Environment = typeof environments.$inferSelect;
