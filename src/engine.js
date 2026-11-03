import { parseInfo } from './core.js';
export class Engine {
  constructor(base = './engines/') { this.base = base; this.worker = null; this.mode = null; this.waiters = []; this.pending = null; this.ready = null; this.hash = 32; }
  send(command) { this.worker.postMessage(command); }
  waitFor(token, ms = 60000) {
    return new Promise((resolve, reject) => {
      const item = { token, resolve: line => { clearTimeout(item.timer); resolve(line); }, reject };
      item.timer = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== item); reject(new Error('Движок не ответил вовремя')); }, ms);
      this.waiters.push(item);
    });
  }
  async load(mode = 'lite') {
    if (this.mode === mode && this.ready) return this.ready;
    this.destroy(); this.mode = mode; const token = Symbol(); this.loadToken = token;
    this.ready = (async () => {
      this.worker = new Worker(`${this.base}stockfish-19-${mode === 'lite' ? 'lite-single' : 'single'}.js`);
      this.worker.onmessage = event => {
        for (const line of String(event.data).split('\n')) {
          const matched = this.waiters.filter(x => line === x.token || line.startsWith(x.token + ' '));
          this.waiters = this.waiters.filter(x => !matched.includes(x)); matched.forEach(x => x.resolve(line));
          if (this.pending) {
            const info = parseInfo(line, this.pending.fen);
            if (info) { this.pending.lines.set(info.multipv, info); this.pending.onInfo?.(info); }
            if (line.startsWith('bestmove ')) {
              const p = this.pending; this.pending = null; clearTimeout(p.timer);
              p.resolve({ bestmove: line.split(' ')[1], lines: [...p.lines.values()].sort((a,b) => a.multipv - b.multipv) });
            }
          }
        }
      };
      this.worker.onerror = () => { this.fail(new Error('Не удалось запустить Stockfish. Проверьте наличие WASM и поддержку WebAssembly.')); };
      const uci = this.waitFor('uciok'); this.send('uci'); await uci;
      this.send(`setoption name Hash value ${this.hash}`);
      const ready = this.waitFor('readyok'); this.send('isready'); await ready;
    })();
    try { return await this.ready; } catch (e) { if(this.loadToken === token) this.destroy(); throw e; }
  }
  async stop() { if (this.pending) { const done = this.pending.done; this.send('stop'); await done; } }
  async analyze(fen, { depth = 20, time = 2000, multipv = 3, onInfo } = {}) {
    await this.ready; await this.stop();
    if (!this.worker) throw new Error('Движок не загружен');
    this.send(`setoption name MultiPV value ${Math.max(1, Math.min(256, multipv))}`);
    this.send(`position fen ${fen}`);
    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    return new Promise((resolve, reject) => {
      this.pending = { fen, lines: new Map(), onInfo, done,
        resolve: value => { resolveDone(); resolve(value); },
        reject: error => { resolveDone(); reject(error); },
        timer: setTimeout(() => this.fail(new Error('Превышено время анализа')), Math.max(time + 30000, 60000)) };
      this.send(`go depth ${Math.max(1, Math.min(60, depth))} movetime ${Math.max(100, time)}`);
    });
  }
  fail(error) {
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.waiters = [];
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
  }
  destroy() { this.fail(new Error('Анализ остановлен')); this.worker?.terminate(); this.worker = null; this.ready = null; this.mode = null; this.loadToken = null; }
}
