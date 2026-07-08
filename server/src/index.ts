import { buildApp } from './app.js';
import { createDb, defaultDbPath } from './db.js';

const db = createDb(defaultDbPath());
const app = buildApp(db);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '127.0.0.1' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
