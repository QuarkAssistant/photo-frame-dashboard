import fs from 'node:fs';
import path from 'node:path';
import { ROUTINES, seedStore } from '../mock.js';

export function openStore(root) {
  const file = path.join(root, 'data', 'store.json');
  let chain = Promise.resolve();

  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.chores) || !Array.isArray(data.groceries) || !Array.isArray(data.homework)) {
        throw new Error('bad store');
      }
      return data;
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('store reset:', err.message);
      const data = seedStore();
      write(data);
      return data;
    }
  }

  function update(fn) {
    const run = chain.then(() => {
      const data = read();
      fn(data);
      write(data);
      return data;
    });
    chain = run.then(() => {}, () => {});
    return run;
  }

  function nextId(data, prefix) {
    data.seq = (data.seq || 40) + 1;
    return prefix + data.seq;
  }

  return {
    chores() {
      return { source: 'store', routines: ROUTINES, chores: read().chores };
    },
    groceries() {
      return { source: 'store', groceries: read().groceries };
    },
    homework() {
      return { source: 'store', homework: read().homework };
    },
    setChore(id, done) {
      return update((data) => {
        const item = data.chores.find((c) => c.id === id);
        if (item) item.done = done == null ? !item.done : !!done;
      }).then((data) => ({ source: 'store', routines: ROUTINES, chores: data.chores }));
    },
    setHomework(id, done) {
      return update((data) => {
        const item = data.homework.find((h) => h.id === id);
        if (item) item.done = done == null ? !item.done : !!done;
      }).then((data) => ({ source: 'store', homework: data.homework }));
    },
    grocery(body) {
      return update((data) => {
        const action = body.action || 'toggle';
        if (action === 'add') {
          const name = String(body.name || '').trim().slice(0, 80);
          if (!name) return;
          const cat = String(body.cat || 'Other').slice(0, 40);
          const existing = data.groceries.find((g) => g.name.toLowerCase() === name.toLowerCase());
          if (existing) existing.done = false;
          else data.groceries.push({ id: nextId(data, 'g'), name, cat, done: false });
        } else if (action === 'remove') {
          data.groceries = data.groceries.filter((g) => g.id !== body.id);
        } else if (action === 'clear-done') {
          data.groceries = data.groceries.filter((g) => !g.done);
        } else {
          const item = data.groceries.find((g) => g.id === body.id);
          if (item) item.done = body.done == null ? !item.done : !!body.done;
        }
      }).then((data) => ({ source: 'store', groceries: data.groceries }));
    },
  };
}
