const asyncHandler = require('express-async-handler');
const { queueNames } = require('../services/queue/queues');
const { getQueue } = require('../services/queue/queues');

const getQueueHealth = asyncHandler(async (req, res) => {
  const queues = {};
  for (const name of queueNames) {
    const queue = getQueue(name);
    queues[name] = queue ? await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused') : { disabled: true };
  }
  res.json({ success: true, redisConfigured: Boolean(process.env.REDIS_URL), queues });
});

module.exports = { getQueueHealth };
