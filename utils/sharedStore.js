const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

function key(type, id) {
  return `${type}:${id}`;
}

async function setJSON(k, obj) {
  await redis.set(k, JSON.stringify(obj));
}

async function getJSON(k) {
  const data = await redis.get(k);
  return data ? JSON.parse(data) : null;
}

async function del(k) {
  await redis.del(k);
}

function addSetMember(set, member) {
  return redis.sadd(set, member);
}

function removeSetMember(set, member) {
  return redis.srem(set, member);
}

function getSetMembers(set) {
  return redis.smembers(set);
}

module.exports = {
  redis,
  key,
  setJSON,
  getJSON,
  del,
  addSetMember,
  removeSetMember,
  getSetMembers
};