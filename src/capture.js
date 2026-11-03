import { Chess, boardToFen } from './core.js';
function validFen(text) { try { return new Chess(text?.trim()).fen(); } catch { return null; } }
function sanText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[data-figurine]').forEach(el => { el.textContent = el.getAttribute('data-figurine'); });
  clone.querySelectorAll('.annotation,.eval,.move-evaluation,.move-time,.clock').forEach(el=>el.remove());
  return clone.textContent.replace(/\d+\.(\.\.)?/g,'').replace(/[!?]/g,'').replace(/\s+/g,'').trim();
}
export function capturePosition(doc = document, turn = 'auto') {
  const board = doc.querySelector('wc-chess-board,chess-board,.chessboard,cg-board');
  if(!board) throw new Error('Шахматная доска не найдена.');
  const fenInputs = [...doc.querySelectorAll('input[name="fen"],input.analyse__underboard__fen,input.copyable')];
  for(const el of [board,...fenInputs]){
    const text=el.getAttribute('data-fen') || (el.tagName==='INPUT'?el.value:null);
    if(text && text.split(' ').length>=4){const fen=validFen(text);if(fen)return {fen,exact:true,turnInferred:true,board};}
  }
  const pieces = {},lichess=board.tagName.toLowerCase()==='cg-board';
  const flipped=!!board.closest('.orientation-black') || board.classList.contains('flipped') || board.getAttribute('orientation')==='black';
  for(const el of board.querySelectorAll(lichess?'piece':'.piece')){
    if(el.classList.contains('ghost')||el.classList.contains('dragging'))continue;
    if(lichess){
      const type={pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',king:'k'}[[...el.classList].find(c=>['pawn','knight','bishop','rook','queen','king'].includes(c))];if(!type)continue;
      const b=board.getBoundingClientRect(),r=el.getBoundingClientRect();if(!b.width||!r.width)continue;
      const x=Math.round((r.left-b.left)/(b.width/8)),y=Math.round((r.top-b.top)/(b.height/8));if(x<0||x>7||y<0||y>7)continue;
      pieces['abcdefgh'[flipped?7-x:x]+(flipped?y+1:8-y)]=el.classList.contains('white')?type.toUpperCase():type;
    }else{
      const classes=el.className?.baseVal||el.className||'',piece=classes.match(/(?:^|\s)([wb])([prnbqk])(?:\s|$)/i),square=classes.match(/(?:^|\s)square-([1-8])([1-8])(?:\s|$)/);
      if(piece&&square)pieces['abcdefgh'[Number(square[1])-1]+square[2]]=piece[1].toLowerCase()==='w'?piece[2].toUpperCase():piece[2].toLowerCase();
    }
  }
  if(!Object.values(pieces).includes('K')||!Object.values(pieces).includes('k'))throw new Error('Не удалось прочитать всех королей. Дождитесь конца анимации.');
  const placement=boardToFen(pieces).split(' ')[0];
  const selector=lichess?'tview2 move':'.move-list .node,.vertical-move-list .node,.move-list .move-node,.vertical-move-list .move-node,.move-list-component .move-text-component';
  const nodes=[...doc.querySelectorAll(selector)].filter(n=>!n.parentElement?.closest(selector));
  const replay=new Chess();let count=0,matched=null;
  if(placement===replay.fen().split(' ')[0])matched=replay.fen();
  for(const node of nodes){const text=sanText(node);if(!text)continue;try{replay.move(text);count++;if(replay.fen().split(' ')[0]===placement)matched=replay.fen();}catch{break;}}
  if(matched){let fen=matched;if(turn!=='auto'){const fields=fen.split(' ');fields[1]=turn;fen=validFen(fields.join(' '));}if(fen)return {fen,exact:true,turnInferred:turn==='auto',board};}
  const inferred=count>0&&nodes.length===count;const side=turn==='auto'?(inferred?replay.turn():'w'):turn;
  const fen=validFen(boardToFen(pieces,side));if(!fen)throw new Error('Позиция прочитана некорректно. Попробуйте импорт FEN.');
  return {fen,exact:false,turnInferred:turn==='auto'&&inferred,board};
}
