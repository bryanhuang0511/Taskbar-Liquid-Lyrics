/* 歌詞引擎與快取單元測試：不需 Windows / WebView2 / npm。 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../ui/js/lyrics_engine.js'), 'utf8')
  + '\nglobalThis.__TLL = { LrcParser, LyricsEngine, LrcCache, S2TConverter };';

const store = new Map();
const fakeLocalStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); }
};

const sandbox = {
  window: {},
  document: { getElementById: () => null, createDocumentFragment: () => ({ appendChild() {} }) },
  localStorage: fakeLocalStorage,
  setTimeout, clearTimeout, AbortController, URLSearchParams,
  fetch: async () => { throw new Error('network must not be used in this unit test'); },
  DOMParser: undefined, console, Map, Set, Math, Number, String, Array, Object, RegExp, JSON, Date
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'lyrics_engine.js' });
const { LrcParser, LyricsEngine, LrcCache, S2TConverter } = sandbox.__TLL;

const parsed = LrcParser.parseLRC('[offset:+500]\n[00:10.00]first line\n[00:15.00]second line');
assert.strictEqual(parsed.length, 2);
assert(Math.abs(parsed[0].time - 9.5) < 0.001, 'LRC native offset must be applied');

assert.strictEqual(S2TConverter.convertText('头发与背影'), '頭髮與背影', 'S2TConverter.convertText alias must work');

const engine = new LyricsEngine({});
engine.candidates = [{ source: 'test', score: 99, lyrics: parsed }];
assert.strictEqual(engine.selectCandidate(0), true);
assert.strictEqual(engine.lyrics.length, 2);
assert.strictEqual(engine.selectedCandidateIndex, 0);
const score = engine.scoreCandidate({
  title: 'test song', artist: 'artist',
  lyrics: [{ time: 1, words: [{}, {}] }, { time: 2 }]
}, 'test song', 'artist', 180);
assert(score > 0);

// Verify LrcCache bounded LRU eviction
for (let i = 0; i < LrcCache.MAX_ENTRIES + 15; i++) {
  LrcCache.set(`song_${i}`, [
    { time: 1, text: 'a' },
    { time: 2, text: 'b' },
    { time: 3, text: 'c' }
  ]);
}
assert.strictEqual(LrcCache.get('song_0'), null, 'oldest cache entry must be evicted');
assert(LrcCache.get(`song_${LrcCache.MAX_ENTRIES + 14}`) !== null, 'newest cache entry must persist');

console.log('PASS LRC native offset parser');
console.log('PASS S2TConverter.convertText alias');
console.log('PASS candidate selection');
console.log('PASS candidate scorer');
console.log('PASS LrcCache bounded LRU eviction');
