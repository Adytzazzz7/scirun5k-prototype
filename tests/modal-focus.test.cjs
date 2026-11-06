const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('modal moves focus inside, traps Tab, closes on Escape and returns focus', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const names = ['modalFocusable', 'openModal', 'closeModal', 'handleModalKeydown'];
  const functions = names.map(name => {
    const match = html.match(new RegExp(`function ${name}\\([^\\r\\n]*`));
    assert.ok(match, `${name} exists`);
    return match[0];
  });
  const document = { activeElement: null };
  const control = name => ({
    name, isConnected: true,
    focus() { document.activeElement = this; },
  });
  const opener = control('opener'), first = control('first'), last = control('last');
  document.activeElement = opener;
  const classes = new Set(['hidden']);
  const back = {
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    focus() { document.activeElement = this; },
  };
  const content = { innerHTML: '', querySelectorAll: () => [first, last] };
  const context = { document, modalReturnFocus: null, $: id => ({ modalBack: back, modalContent: content })[id] };
  vm.createContext(context);
  vm.runInContext(functions.join('\n'), context);

  context.openModal('<button>First</button><button>Last</button>');
  assert.equal(content.innerHTML.includes('First'), true);
  assert.equal(document.activeElement, first);
  const event = (key, shiftKey = false) => ({ key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } });
  last.focus();
  const forward = event('Tab');
  context.handleModalKeydown(forward);
  assert.equal(forward.prevented, true);
  assert.equal(document.activeElement, first);
  const backward = event('Tab', true);
  context.handleModalKeydown(backward);
  assert.equal(backward.prevented, true);
  assert.equal(document.activeElement, last);
  context.handleModalKeydown(event('Escape'));
  assert.equal(back.classList.contains('hidden'), true);
  assert.equal(document.activeElement, opener);
});
