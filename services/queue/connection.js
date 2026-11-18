const IORedis = require('ioredis');

let connection;
const getConnection = () => {
  if (!process.env.REDIS_URL) return null;
  if (!connection) connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  return connection;
};

const closeConnection = async () => {
  if (connection) await connection.quit().catch(() => {});
  connection = null;
};

module.exports = { getConnection, closeConnection };
