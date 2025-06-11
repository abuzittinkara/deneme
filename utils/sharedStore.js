const Redis = require('ioredis');

const disableRedis = !!process.env.DISABLE_REDIS;

let redis;
let _data = {};
let _sets = {};
if (disableRedis) {
  redis = {
    async connect() {},
    duplicate() { return this; },
    async keys() { return []; }
  };
} else {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redis = new Redis(redisUrl, { lazyConnect: true });
}

function key(type, id) {
  return `${type}:${id}`;
}

async function setJSON(k, obj) {
  if (disableRedis) {
    _data[k] = JSON.stringify(obj);
  } else {
    await redis.set(k, JSON.stringify(obj));
  }
}

async function getJSON(k) {
  if (disableRedis) {
    const data = _data[k];
    return data ? JSON.parse(data) : null;
  } else {
    const data = await redis.get(k);
    return data ? JSON.parse(data) : null;
  }
}

async function del(k) {
  if (disableRedis) {
    delete _data[k];
    delete _sets[k];
  } else {
    await redis.del(k);
  }
}

function addSetMember(set, member) {
  if (disableRedis) {
    if (!_sets[set]) _sets[set] = new Set();
    _sets[set].add(member);
    return Promise.resolve();
  }
  return redis.sadd(set, member);
}

function removeSetMember(set, member) {
  if (disableRedis) {
    if (_sets[set]) _sets[set].delete(member);
    return Promise.resolve();
  }
  return redis.srem(set, member);
}

function getSetMembers(set) {
  if (disableRedis) {
    return Promise.resolve(_sets[set] ? Array.from(_sets[set]) : []);
  }
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