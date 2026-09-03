import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { app, database, config, safeError } from './server.js';
import './routes-basic.js';
import './routes-learning.js';

app.setErrorHandler((error, _req, reply) => safeError(reply, error));
app.addHook('onClose', async () => { await database.close(); });
const webDist = path.resolve(process.cwd(), 'apps/web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
}
if (process.env.NODE_ENV !== 'test') {
  app.listen({ host: config.host, port: config.port })
    .then(() => app.log.info(`Leafmark listening on ${config.host}:${config.port}`))
    .catch((e) => { app.log.error(e); process.exit(1); });
}

export { app, database };
