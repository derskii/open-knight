import { Chess } from 'chess.js';
export { Chess };
export const START = new Chess().fen();
export function parseInfo(line, fen) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  const number = key => Number(line.match(new RegExp(`(?:^| )${key} (\\d+)`))?.[1] || 0);
  const turn = fen.split(' ')[1] === 'w' ? 1 : -1;
  return { depth: number('depth'), multipv: number('multipv') || 1, nodes: number('nodes'), nps: number('nps'),
    type: score[1], score: Number(score[2]) * turn,
    bound: / (upperbound|lowerbound)( |$)/.test(line),
    pv: line.split(' pv ')[1].trim().split(/\s+/) };
}
export function scoreLabel(info) {
  if (!info) return '—';
  if (info.type === 'mate') return `${info.score < 0 ? '−' : ''}M${Math.abs(info.score)}`;
  const n = info.score / 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
}
export function numericScore(info) {
  return info?.type === 'mate' ? (info.score > 0 ? 100000 - Math.abs(info.score) : -100000 + Math.abs(info.score)) : info?.score ?? 0;
}
export function pvToSan(fen, moves, limit = 10) {
  const chess = new Chess(fen), result = [];
  for (const uci of moves.slice(0, limit)) {
    try { const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); result.push(move.san); }
    catch { break; }
  }
  return result;
}
export function classifyLoss(loss) {
  if (loss >= 200) return { key: 'blunder', label: 'Грубая ошибка', color: '#ff6b74' };
  if (loss >= 100) return { key: 'mistake', label: 'Ошибка', color: '#ffaf62' };
  if (loss >= 50) return { key: 'inaccuracy', label: 'Неточность', color: '#e9cc74' };
  return { key: 'good', label: loss <= 15 ? 'Отлично' : 'Хорошо', color: '#c7f26b' };
}
export function gamePositions(chess) {
  const headers = chess.getHeaders();
  const replay = new Chess(headers.FEN || START);
  const positions = [replay.fen()];
  for (const move of chess.history()) { replay.move(move); positions.push(replay.fen()); }
  return positions;
}
export function moveLoss(before, after, turn) {
  return Math.max(0, (numericScore(before) - numericScore(after)) * (turn === 'w' ? 1 : -1));
}
// Relative quality, not a proprietary site's game accuracy.
export function candidateQuality(best, candidate, turn) {
  const loss = Math.max(0, (numericScore(best) - numericScore(candidate)) * (turn === 'w' ? 1 : -1));
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-loss / 300))));
}
export function candidatePool(infos, turn, min = 0, max = 100) {
  if (!infos.length || min > max || min < 0 || max > 100) return [];
  const sign = turn === 'w' ? 1 : -1;
  const sorted = [...infos].sort((a,b) => (numericScore(b) - numericScore(a)) * sign);
  return sorted.map(info => ({ ...info, quality: candidateQuality(sorted[0], info, turn) }))
    .filter(info => info.quality >= min && info.quality <= max);
}
export function boardToFen(pieces, turn = 'w', castling = '-', ep = '-') {
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '', empty = 0;
    for (const file of 'abcdefgh') {
      const p = pieces[file + rank];
      if (!p) empty++; else { if (empty) row += empty; empty = 0; row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} ${castling || '-'} ${ep} 0 1`;
}
export const OPENINGS = [
  { name: 'Итальянская партия', eco: 'C50', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3' },
  { name: 'Испанская партия', eco: 'C60', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O' },
  { name: 'Сицилианская защита', eco: 'B20', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3' },
  { name: 'Ферзевый гамбит', eco: 'D30', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3' },
  { name: 'Защита Каро — Канн', eco: 'B10', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { name: 'Лондонская система', eco: 'D02', moves: 'd4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3' },
  { name: 'Французская защита', eco: 'C00', moves: 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5' },
  { name: 'Староиндийская защита', eco: 'E60', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O' }
];
export const PUZZLES = [
  { name: 'Слабая точка f7', theme: 'Мат в один ход', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: ['h5f7'] },
  { name: 'Последняя горизонталь', theme: 'Мат в один ход', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', solution: ['e1e8'] },
  { name: 'Ферзь и король', theme: 'Мат в один ход', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: ['g6g7'] },
  { name: 'Чёрные наносят удар', theme: 'Мат в один ход', fen: '4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', solution: ['e8e1'] }
];
