const test = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { EventEmitter } = require('events');

async function setup() {
  const dom = new JSDOM('<!doctype html><input id="msg">');
  global.window = dom.window;
  global.document = dom.window.document;
  global.getComputedStyle = () => ({ fontSize: '16px' });
  const mod = await import('../public/js/mentions.js');
  const socket = new EventEmitter();
  mod.initMentions(socket);
  return { mod, socket, input: document.getElementById('msg') };
}

test('dropdown filters usernames', async () => {
  const { mod, socket, input } = await setup();
  input.getBoundingClientRect = () => ({ left:0, top:100, width:100 });
  const bar = document.createElement('div');
  bar.id = 'selectedChannelBar';
  bar.getBoundingClientRect = () => ({ bottom:0 });
  document.body.appendChild(bar);

  socket.emit('groupUsers', { online:[{ username:'alice', avatar:'a' }], offline:[{ username:'bob', avatar:'b' }] });
  input.value = '@bo';
  input.selectionStart = input.value.length;
  input.setSelectionRange = (s,e)=>{ input.selectionStart=s; input.selectionEnd=e; };
  mod.handleInput(input);
  const dd = document.querySelector('.mention-dropdown');
  assert.strictEqual(dd.style.display, 'block');
  assert.strictEqual(dd.children.length, 1);
  assert.strictEqual(dd.children[0].dataset.username, 'bob');
});

test('keyboard navigation inserts mention', async () => {
  const { mod, socket, input } = await setup();
  input.getBoundingClientRect = () => ({ left:0, top:100, width:100 });
  document.body.appendChild(Object.assign(document.createElement('div'),{id:'selectedChannelBar',getBoundingClientRect:()=>({bottom:0})}));
  socket.emit('groupUsers', { online:[{ username:'alice', avatar:'a' },{ username:'bob', avatar:'b' }], offline:[] });
  input.value = '@';
  input.selectionStart = input.value.length;
  input.setSelectionRange = (s,e)=>{ input.selectionStart=s; input.selectionEnd=e; };
  mod.handleInput(input);
  const eDown = { key:'ArrowDown', preventDefault(){} };
  mod.handleKeydown(eDown);
  const eEnter = { key:'Enter', preventDefault(){} };
  mod.handleKeydown(eEnter);
  assert.strictEqual(input.value, '@bob ');
  const dd = document.querySelector('.mention-dropdown');
  assert.strictEqual(dd.style.display, 'none');
});
