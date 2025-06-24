const test = require('node:test');
const assert = require('assert');
const collectNotifyInfo = require('../utils/collectNotifyInfo');

function query(doc){
  return { populate: async () => doc };
}

test('collectNotifyInfo collects notification settings', async () => {
  const userDoc = { _id: 'u1id', groups: [{ _id: 'g1id', groupId: 'g1' }] };
  const User = { findOne: async q => q.username === 'u1' ? query(userDoc) : query(null) };
  const Group = {};
  const GroupMember = {
    async findOne(){
      const doc = { notificationType: 'mentions', channelNotificationType: new Map([['c1','nothing']]) };
      return { select(){ return doc; } };
    }
  };
  const res = await collectNotifyInfo('u1', { User, Group, GroupMember });
  assert.deepStrictEqual(res, { g1: { notificationType: 'mentions', channelNotificationType: { c1: 'nothing' } } });
});
