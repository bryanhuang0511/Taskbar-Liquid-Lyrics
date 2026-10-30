/* v1.2.0 歌詞引擎單元測試：不需 Windows / WebView2 / npm。 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../ui/js/lyrics_engine.js'), 'utf8')
  + '\nglobalThis.__TLL = { LrcParser, LyricsEngine };';
const sandbox = {
  window: {},
  document: { getElementById: () => null, createDocumentFragment: () => ({ appendChild() {} }) },
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout, clearTimeout, AbortController, URLSearchParams,
  fetch: async () => { throw new Error('network must not be used in this unit test'); },
  DOMParser: undefined, console, Map, Set, Math, Number, String, Array, Object, RegExp, JSON, Date
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'lyrics_engine.js' });
const { LrcParser, LyricsEngine } = sandbox.__TLL;

const parsed = LrcParser.parseLRC('[offset:+500]\n[00:10.00]first line\n[00:15.00]second line');
assert.strictEqual(parsed.length, 2);
assert(Math.abs(parsed[0].time - 9.5) < 0.001, 'LRC native offset must be applied');

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
console.log('PASS LRC native offset parser');
console.log('PASS candidate selection');
console.log('PASS candidate scorer');
