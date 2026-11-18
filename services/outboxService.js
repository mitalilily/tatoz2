const crypto = require('crypto');
const OutboxEvent = require('../models/OutboxEvent');
const { queueForEvent } = require('./queue/queueNames');
const { getQueue } = require('./queue/queues');

const createIdempotencyKey = ({ type, aggregateType, aggregateId, idempotencyKey }) => idempotencyKey || crypto.createHash('sha256').update(`${type}:${aggregateType}:${aggregateId}`).digest('hex');

const enqueue = async ({ tenant, type, aggregateType, aggregateId, payload, idempotencyKey }) => {
  const key = createIdempotencyKey({ type, aggregateType, aggregateId, idempotencyKey });
  const event = await OutboxEvent.findOneAndUpdate(
    { tenant, idempotencyKey: key },
    { $setOnInsert: { tenant, type, aggregateType, aggregateId: String(aggregateId), payload, idempotencyKey: key, status: 'pending', availableAt: new Date() } },
    { upsert: true, new: true },
  );
  await publish(event);
  return event;
};

const publish = async event => {
  if (!event) return null;
  const queue = getQueue(queueForEvent(event.type));
  if (!queue) return event;
  const job = await queue.add(event.type, { outboxId: String(event._id), tenant: String(event.tenant), type: event.type, payload: event.payload }, { jobId: String(event._id) });
  await OutboxEvent.updateOne({ _id: event._id, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'published', publishedAt: new Date() }, $inc: { attempts: 1 } });
  return job;
};

const republishPending = async ({ limit = 100 } = {}) => {
  const events = await OutboxEvent.find({ status: { $in: ['pending', 'failed'] }, availableAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit);
  for (const event of events) await publish(event);
  return events.length;
};

module.exports = { enqueue, publish, republishPending, createIdempotencyKey };
