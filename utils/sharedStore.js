let _data = {};
let _sets = {};

function key(type, id) {
  return `${type}:${id}`;
}

async function setJSON(k, obj) {
  _data[k] = JSON.stringify(obj);
}

async function getJSON(k) {
  const data = _data[k];
  return data ? JSON.parse(data) : null;
}

async function del(k) {
  delete _data[k];
  delete _sets[k];
}

function addSetMember(set, member) {
  if (!_sets[set]) _sets[set] = new Set();
  _sets[set].add(member);
  return Promise.resolve();
}

function removeSetMember(set, member) {
  if (_sets[set]) _sets[set].delete(member);
  return Promise.resolve();
}

function getSetMembers(set) {
  return Promise.resolve(_sets[set] ? Array.from(_sets[set]) : []);
}

module.exports = {
  key,
  setJSON,
  getJSON,
  del,
  addSetMember,
  removeSetMember,
  getSetMembers
};
