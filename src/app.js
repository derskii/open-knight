import { Chess, START, scoreLabel, numericScore, pvToSan, classifyLoss, gamePositions, moveLoss, boardToFen, candidatePool, OPENINGS, PUZZLES } from './core.js';
import { Engine } from './engine.js';
const $ = id => document.getElementById(id);
const symbols = {K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const colors = ['#d2ff72','#76d8c1','#ffbd78','#c3a3ff','#ff8e9a'];
const extension = typeof browser !== 'undefined' && !!browser.runtime?.id;
const engine = new Engine();
let game = new Chess(), cursor = 0, flipped = false, selected = null, lines = new Map(), view = 'analysis', engineMode = 'lite', generation = 0, analysisTimer, reviewToken = 0, reviewRows = [], sourceTab = null, followTimer, captureBusy = false;
let editing = {}, editorPiece = 'Q', puzzleIndex = 0, puzzleSolved = false, pendingPromotion;
let rangeChoice = null;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('ok.' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('ok.' + key, JSON.stringify(value)); return true; } catch { notice('Хранилище заполнено. Экспортируйте библиотеку в JSON.', true); return false; } }
};
const qualityControls = document.createElement('div'); qualityControls.className='quality-settings';
qualityControls.innerHTML='<label class="toggle-row"><input type="checkbox" id="grade-all" checked> Предварительное качество всех ходов</label><label class="toggle-row"><input type="checkbox" id="range-enabled"> Подсказки в диапазоне качества</label><div class="quality-range"><label>От <input id="quality-min" type="number" min="0" max="100" value="60"> %</label><span>—</span><label>До <input id="quality-max" type="number" min="0" max="100" value="70"> %</label></div><p class="muted" id="quality-status">100% — лучший ход найденного поиска. Предоценка остальных ходов появится после запуска.</p><button id="reshuffle" class="text-button">↻ Другая подсказка из диапазона</button><details><summary>Как считается качество?</summary><p class="muted">Качество = 100 × exp(−потеря / 300), где потеря — разница оценок Stockfish в сотых пешки. Потеря пешки ≈ 72%, полутора пешек ≈ 61%. Это наша приблизительная шкала относительно лучшего найденного хода, а не точность партии Chess.com. Оценки меняются при углублении поиска. Диапазон фильтруется строго; если подходящих ходов нет, стрелок не будет.</p></details>';
document.querySelector('.settings-grid').after(qualityControls);
function gradedInfos(){return candidatePool([...lines.values()],currentChess().turn());}
function visibleInfos(){const graded=gradedInfos();if(!$('range-enabled').checked)return graded.slice(0,Number($('multipv').value));const lo=Number($('quality-min').value),hi=Number($('quality-max').value);const pool=graded.filter(i=>i.quality>=lo&&i.quality<=hi);if(rangeChoice&&pool.some(i=>i.pv[0]===rangeChoice))pool.sort((a,b)=>Number(b.pv[0]===rangeChoice)-Number(a.pv[0]===rangeChoice));return pool.slice(0,Number($('multipv').value));}
function refreshQuality(){const all=gradedInfos();const lo=Number($('quality-min').value),hi=Number($('quality-max').value);$('quality-status').textContent=$('range-enabled').checked?(lo>hi?'Минимум должен быть не больше максимума.':`${all.filter(i=>i.quality>=lo&&i.quality<=hi).length} ходов в диапазоне ${lo}–${hi}%. ${all.length} оценено.`):`${all.length} ходов предварительно оценено. Выберите фигуру, чтобы увидеть проценты на полях.`;drawArrows(visibleInfos());}
function chooseRangeMove(){const lo=Number($('quality-min').value),hi=Number($('quality-max').value),pool=gradedInfos().filter(i=>i.quality>=lo&&i.quality<=hi);rangeChoice=pool.length?pool[Math.floor(Math.random()*pool.length)].pv[0]:null;renderLines();}
for(const id of ['grade-all','range-enabled','quality-min','quality-max']){const el=$(id),isCheck=el.type==='checkbox';const saved=storage.get(id,isCheck?el.checked:el.value);if(isCheck)el.checked=saved;else el.value=saved;el.addEventListener('change',()=>{if(!isCheck)el.value=Math.max(0,Math.min(100,Number(el.value)||0));storage.set(id,isCheck?el.checked:el.value);rangeChoice=null;renderLines();renderBoard();if($('auto-analysis').checked)analyzePosition();});}
$('reshuffle').addEventListener('click',chooseRangeMove);
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = false; }
let cachedGame, cachedPositions;
function currentFen() { if(cachedGame!==game){cachedGame=game;cachedPositions=gamePositions(game);}return cachedPositions[cursor]; }
function currentChess() { return new Chess(currentFen()); }
function clearLines() { lines.clear(); rangeChoice=null; $('quality-status').textContent='Предоценка появится после анализа этой позиции.'; $('lines').innerHTML = '<div class="empty-lines"><span>♞</span><p>Новая позиция.</p><small>Запустите анализ, чтобы найти продолжение.</small></div>'; $('search-depth').textContent = '—'; $('eval-number').textContent = '—'; $('eval-fill').style.height = '50%'; drawArrows([]); if(extension&&sourceTab)browser.tabs.sendMessage(sourceTab,{type:'OK_CLEAR_ARROWS'}).catch(()=>{}); }
function renderBoard() {
  const chess = currentChess(), fen = chess.fen();
  const pieces = view === 'editor' ? editing : Object.fromEntries(chess.board().flat().filter(Boolean).map(p => [p.square, p.color === 'w' ? p.type.toUpperCase() : p.type]));
  const legal = selected && view !== 'editor' ? chess.moves({square:selected, verbose:true}).map(m => m.to) : [];
  const last = cursor ? game.history({verbose:true})[cursor - 1] : null;
  $('board').replaceChildren();
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const file = flipped ? 7-col : col, rank = flipped ? row+1 : 8-row, square = 'abcdefgh'[file] + rank;
    const button = document.createElement('button'); button.className = `square ${(file+rank)%2 === 0 ? 'dark' : ''}`;
    button.setAttribute('role','gridcell'); button.dataset.square = square;
    const piece = pieces[square]; button.setAttribute('aria-label', `${square}${piece ? ' ' + piece : ''}`);
    if (piece) { const span = document.createElement('span'); span.className = `piece ${piece === piece.toUpperCase() ? 'piece-white' : 'piece-black'}`; span.textContent = symbols[piece]; button.append(span); }
    if (selected === square) button.classList.add('selected');
    if (legal.includes(square)) {
      button.classList.add('legal');
      const candidates = gradedInfos().filter(i=>i.pv[0]?.slice(0,2)===selected&&i.pv[0]?.slice(2,4)===square);
      const grade=candidates[0];
      if(grade){const badge=document.createElement('span');badge.className='quality-badge';badge.textContent=grade.quality+'%';badge.style.background=grade.quality>=90?'#c7f26b':grade.quality>=60?'#ffe097':'#ff979e';button.append(badge);button.title=`${grade.pv[0]} · качество ${grade.quality}% · оценка ${scoreLabel(grade)} · глубина ${grade.depth}${candidates.length>1?' · показано лучшее превращение':''}`;}
    }
    if (view !== 'editor' && last && [last.from,last.to].includes(square)) button.classList.add('last');
    if (col === 0) { const span = document.createElement('span'); span.className = 'coord'; span.textContent = rank; button.append(span); }
    if (row === 7) { const span = document.createElement('span'); span.className = 'coord file-coord'; span.textContent = 'abcdefgh'[file]; button.append(span); }
    button.addEventListener('click', () => squareClick(square)); $('board').append(button);
  }
  $('fen-display').value = view === 'editor' ? editorFen() : fen;
  $('turn-label').textContent = chess.isCheckmate() ? 'Мат' : chess.isStalemate() ? 'Пат' : chess.isDraw() ? 'Ничья' : `Ход ${chess.turn() === 'w' ? 'белых' : 'чёрных'}${chess.isCheck() ? ' · шах' : ''}`;
  $('board-state').textContent = cursor ? `Ход ${Math.ceil(cursor/2)} · ${cursor % 2 ? 'белые' : 'чёрные'}` : 'Начальная позиция';
  $('white-name').textContent = game.getHeaders().White && game.getHeaders().White !== '?' ? game.getHeaders().White : 'Белые'; $('black-name').textContent = game.getHeaders().Black && game.getHeaders().Black !== '?' ? game.getHeaders().Black : 'Чёрные';
  renderMoves(); drawArrows(visibleInfos());
}
function renderMoves() {
  const moves = game.history(); $('moves').replaceChildren();
  if (!moves.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Сделайте ход на доске или импортируйте партию.'; $('moves').append(p); return; }
  for(let i=0;i<moves.length;i++) {
    if(i%2 === 0) { const span = document.createElement('span'); span.className = 'number'; span.textContent = `${Math.floor(i/2)+1}.`; $('moves').append(span); }
    const button = document.createElement('button'); button.textContent = moves[i]; button.className = cursor === i+1 ? 'current' : ''; button.addEventListener('click', () => navigate(i+1)); $('moves').append(button);
  }
}
function coordinates(square) { const file = 'abcdefgh'.indexOf(square[0]), rank = Number(square[1]); return flipped ? [(7-file)*100+50,(rank-1)*100+50] : [file*100+50,(8-rank)*100+50]; }
function drawArrows(infos) {
  $('arrows').replaceChildren(); if (!$('show-arrows').checked || view === 'editor') return;
  const ns = 'http://www.w3.org/2000/svg';
  for (const [i,info] of infos.slice(0,Number($('multipv').value)).entries()) {
    const move = info.pv?.[0]; if (!move || move.length < 4) continue;
    const [x1,y1] = coordinates(move.slice(0,2)), [x2,y2] = coordinates(move.slice(2,4));
    const angle = Math.atan2(y2-y1,x2-x1), endX = x2-Math.cos(angle)*18, endY = y2-Math.sin(angle)*18;
    const group = document.createElementNS(ns,'g'); group.setAttribute('opacity',i ? '.7' : '.87');
    const line = document.createElementNS(ns,'line'); for(const [key,value] of Object.entries({x1,y1,x2:endX-Math.cos(angle)*17,y2:endY-Math.sin(angle)*17,stroke:colors[i],'stroke-width':i ? 11 : 15,'stroke-linecap':'round'})) line.setAttribute(key,value);
    const head = document.createElementNS(ns,'polygon'); head.setAttribute('fill',colors[i]); head.setAttribute('points', `${endX},${endY} ${endX-Math.cos(angle-.52)*41},${endY-Math.sin(angle-.52)*41} ${endX-Math.cos(angle+.52)*41},${endY-Math.sin(angle+.52)*41}`);
    group.append(line,head); $('arrows').prepend(group);
  }
}
async function squareClick(square) {
  if(view === 'editor') { if(editorPiece === 'erase') delete editing[square]; else editing[square] = editorPiece; renderBoard(); return; }
  if(view === 'puzzles' && puzzleSolved) return;
  const chess = currentChess();
  if(selected) {
    const candidates = chess.moves({square:selected,verbose:true}).filter(m => m.to === square);
    if(candidates.length) {
      if(candidates.some(m => m.promotion)) { pendingPromotion = {from:selected,to:square}; $('promotion-dialog').showModal(); }
      else applyMove({from:selected,to:square});
      return;
    }
  }
  selected = chess.get(square)?.color === chess.turn() ? square : null; renderBoard();
}
function applyMove(move) {
  const replay = new Chess(game.getHeaders().FEN || START); for(const [key,value] of Object.entries(game.getHeaders()))replay.setHeader(key,value);
  for(const san of game.history().slice(0,cursor)) replay.move(san);
  let played; try { played = replay.move(move); } catch { return; }
  if(view === 'puzzles') {
    const puzzle = allPuzzles()[puzzleIndex]; const uci = played.from + played.to + (played.promotion || '');
    if(uci !== puzzle.solution[0] && !replay.isCheckmate()) { notice('Попробуйте другой ход. Ищите решающий удар.'); selected = null; renderBoard(); return; }
    puzzleSolved = true; notice('Верно! Решающий ход найден.'); const progress = storage.get('puzzleProgress',{}); progress[puzzle.fen] = true; storage.set('puzzleProgress',progress);
  }
  game = replay; cursor = game.history().length; positionChanged();
}
function navigate(index) { cursor = Math.max(0,Math.min(game.history().length,index)); positionChanged(); }
function cancelReview() { reviewToken++; }
function positionChanged({analyze=true}={}) {
  generation++; selected = null; clearTimeout(analysisTimer); clearLines(); renderBoard();
  engine.stop().catch(()=>{});
  if(analyze && $('auto-analysis').checked && !['editor','puzzles','review'].includes(view)) analysisTimer = setTimeout(analyzePosition,220);
}
function renderLines() {
  const infos = visibleInfos(); $('lines').replaceChildren();
  if(!infos.length&&lines.size){const p=document.createElement('p');p.className='muted';p.textContent='В этом диапазоне подходящих ходов пока нет. Увеличьте время анализа или измените границы.';$('lines').append(p);}
  for(const info of infos) {
    const row = document.createElement('div'); row.className = 'line-row';
    const score = document.createElement('span'); score.className = 'line-score'; score.textContent = scoreLabel(info);
    const pv = document.createElement('div'); pv.className = 'line-pv';
    const sans = pvToSan(currentFen(),info.pv,12), first = document.createElement('button'); first.textContent = sans[0] || info.pv[0]; first.title = 'Сыграть этот ход';
    first.addEventListener('click',()=>applyMove({from:info.pv[0].slice(0,2),to:info.pv[0].slice(2,4),promotion:info.pv[0][4]}));
    const tail = document.createElement('span'); tail.textContent = sans.slice(1).join(' '); const meta = document.createElement('small'); meta.textContent = `Качество ${info.quality}% · глубина ${info.depth}${info.bound ? ' · оценка на границе' : ''}`;
    pv.append(first,tail,meta); row.append(score,pv); $('lines').append(row);
  }
  const best = gradedInfos()[0]; if(best) { $('eval-number').textContent = scoreLabel(best); $('eval-fill').style.height = `${Math.max(3,Math.min(97,50+46*Math.tanh(numericScore(best)/450)))}%`; $('search-depth').textContent = `d${best.depth}`; $('engine-state').textContent = `Глубина ${best.depth} · ${(best.nps/1000).toFixed(0)} тыс. узлов/с`; }
  refreshQuality();
  // Refresh destination badges without disturbing the focused square.
  if(selected){for(const button of $('board').children){button.querySelector('.quality-badge')?.remove();const grade=gradedInfos().find(i=>i.pv[0]?.slice(0,2)===selected&&i.pv[0]?.slice(2,4)===button.dataset.square);if(grade){const badge=document.createElement('span');badge.className='quality-badge';badge.textContent=grade.quality+'%';button.append(badge);button.title=`Качество ${grade.quality}% · ${scoreLabel(grade)} · глубина ${grade.depth}`;}}}
  if(extension && sourceTab && $('overlay').checked) browser.tabs.sendMessage(sourceTab,{type:'OK_ARROWS',fen:currentFen(),moves:infos.map(i=>({uci:i.pv[0],score:scoreLabel(i),quality:i.quality})),candidates:gradedInfos().map(i=>({uci:i.pv[0],quality:i.quality,score:scoreLabel(i)}))}).catch(()=>{});
}
async function ensureEngine() {
  $('engine-state').textContent = engineMode === 'full' && engine.mode !== 'full' ? 'Загрузка Full (99,2 МБ)…' : 'Запуск Stockfish…';
  await engine.load(engineMode);
  const hash = Number($('hash').value); if(engine.hash !== hash) { await engine.stop(); engine.hash = hash; engine.send(`setoption name Hash value ${hash}`); }
}
async function analyzePosition() {
  if(view === 'editor') return notice('Примените позицию редактора перед анализом.');
  if(view === 'puzzles' && !puzzleSolved) return notice('Подсказка находится в разделе задачи.');
  cancelReview(); const token = ++generation, fen = currentFen(); clearTimeout(analysisTimer); clearLines();
  try {
    await ensureEngine(); if(token !== generation) return;
    $('engine-dot').style.background = '#ffbd78';
    const count=($('grade-all').checked||$('range-enabled').checked)?currentChess().moves().length:Number($('multipv').value);
    await engine.analyze(fen,{depth:Number($('depth').value),time:Number($('time').value),multipv:count,onInfo:info=>{ if(token === generation) { lines.set(info.pv[0],info); renderLines(); } }});
    if(token === generation) { if($('range-enabled').checked)chooseRangeMove(); $('engine-dot').style.background = 'var(--lime)'; $('engine-state').textContent += ' · готово'; }
  } catch(error) { if(token === generation) { notice(error.message,true); $('engine-state').textContent='Ошибка запуска'; } }
}
function loadInput(text) {
  const input = text.trim(); if(!input) throw new Error('Добавьте FEN или PGN.');
  const next = new Chess();
  if(/^[prnbqkPRNBQK1-8/]+\s+[wb]\s/.test(input)) next.load(input);
  else next.loadPgn(input,{strict:false});
  cancelReview(); reviewRows=[]; game = next; cursor = game.history().length; setView('analysis'); $('notice').hidden = true; positionChanged();
}
function download(name,text,type='text/plain') { const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000); }
function saveGame() {
  const library=storage.get('library',[]); const now=new Date().toISOString(); const pgn=game.pgn();
  const item={id:crypto.randomUUID(),name:`${game.getHeaders().White || 'Белые'} — ${game.getHeaders().Black || 'Чёрные'}`,date:now,pgn,fen:game.fen(),review:reviewRows};
  if(storage.set('library',[item,...library])) notice('Партия сохранена в локальную библиотеку.'); if(view==='library') renderContext();
}
const viewTitles={analysis:['ИССЛЕДУЙТЕ КАЖДУЮ ПОЗИЦИЮ','Ход за ходом.'],review:['УЧИТЕСЬ НА СВОИХ ПАРТИЯХ','Найдите поворотный момент.'],puzzles:['ОДНА ПОЗИЦИЯ. ТОЧНЫЙ УДАР.','Время увидеть тактику.'],openings:['ПОСТРОЙТЕ СВОЙ РЕПЕРТУАР','Уверенный первый ход.'],editor:['СОЗДАЙТЕ СВОЮ ПОЗИЦИЮ','Начните с чистой доски.'],library:['ВСЁ ВАШЕ — У ВАС','Вернитесь к важному.']};
function setView(next) {
  const old=view; cancelReview(); generation++; clearTimeout(analysisTimer); engine.stop().catch(()=>{}); view=next;
  if(next !== 'analysis' && $('follow-tab').checked) { $('follow-tab').checked=false; clearInterval(followTimer); }
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
  [$('view-eyebrow').textContent,$('view-title').textContent]=viewTitles[next];
  if(next==='editor' && old!=='editor') editing=Object.fromEntries(currentChess().board().flat().filter(Boolean).map(p=>[p.square,p.color==='w'?p.type.toUpperCase():p.type]));
  if(next==='puzzles' && old!=='puzzles') startPuzzle(0);
  if(['puzzles','editor'].includes(next)) clearLines();
  renderContext(); renderBoard();
}
function addText(tag,text,className,parent=$('context-panel')) { const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;parent.append(el);return el; }
function addButton(text,fn,className='button subtle',parent=$('context-panel')){const button=addText('button',text,className,parent);button.addEventListener('click',fn);return button;}
function allPuzzles(){return [...PUZZLES,...storage.get('customPuzzles',[])];}
function startPuzzle(index){puzzleIndex=(index+allPuzzles().length)%allPuzzles().length;puzzleSolved=false;game=new Chess(allPuzzles()[puzzleIndex].fen);cursor=0;selected=null;clearLines();renderBoard();}
function editorFen(){return boardToFen(editing,$('editor-turn')?.value||'w',[...document.querySelectorAll('[data-castle]:checked')].map(x=>x.dataset.castle).join('')||'-');}
function renderContext(){
  const panel=$('context-panel');panel.replaceChildren();
  if(view==='analysis'){addText('h3','Каждая линия — новая идея.');addText('p','Выберите фигуру и поле назначения. Нажмите первый ход варианта, чтобы исследовать его на доске.','muted');}
  if(view==='review'){
    addText('h2','Разбор всей партии');addText('p','Stockfish оценит каждую позицию и покажет потери в сотых пешки. Результат зависит от времени и глубины; это эвристические метки ходов.','muted');
    addButton('▶ Разобрать партию',runReview,'button primary');addButton('Остановить',()=>{cancelReview();engine.stop().catch(()=>{});},'text-button').style.marginLeft='16px';
    const progress=document.createElement('progress');progress.id='review-progress';progress.className='review-progress';progress.max=1;progress.value=0;panel.append(progress);
    addText('p','Готов к разбору.','muted').id='review-status';const results=document.createElement('div');results.id='review-results';panel.append(results);renderReview();
  }
  if(view==='puzzles'){
    const puzzle=allPuzzles()[puzzleIndex],solved=storage.get('puzzleProgress',{});
    addText('h2',puzzle.name);addText('p',`${puzzle.theme} · ${puzzleIndex+1} из ${allPuzzles().length} · решено ${Object.keys(solved).length}`,'muted');
    addButton('Подсказка',()=>{drawArrows([{pv:puzzle.solution}]);notice('Следуйте стрелке. Подсказки не ограничены.');});
    addButton('Следующая →',()=>{startPuzzle(puzzleIndex+1);renderContext();},'button primary').style.marginLeft='8px';
    addText('p','В комплекте 4 учебные позиции. Добавляйте собственные задачи и сохраняйте ошибки из разбора.','muted');
    addButton('Сделать текущую позицию задачей',async()=>{
      try{await ensureEngine();const fen=currentFen();const r=await engine.analyze(fen,{time:1500,depth:20,multipv:1});if(!r.bestmove || ['(none)','0000'].includes(r.bestmove))throw new Error('В этой позиции нет допустимого хода');
      const list=storage.get('customPuzzles',[]);list.push({name:'Моя задача '+(list.length+1),theme:'Найдите ход Stockfish',fen,solution:[r.bestmove]});storage.set('customPuzzles',list);notice('Позиция добавлена в задачи.');}catch(e){notice(e.message,true);}
    });
  }
  if(view==='openings'){
    addText('h2','Восемь отправных точек');addText('p','Учебные линии без облачной базы. Откройте вариант и изучайте ходы стрелками ← →.','muted');
    const filter=document.createElement('input');filter.placeholder='Найти дебют…';filter.setAttribute('aria-label','Поиск дебютов');panel.append(filter);
    const list=document.createElement('div');panel.append(list);
    const render=()=>{list.replaceChildren();for(const opening of OPENINGS.filter(o=>(o.name+' '+o.eco).toLowerCase().includes(filter.value.toLowerCase()))){const b=addButton('',()=>{game=new Chess();for(const move of opening.moves.split(' '))game.move(move);cursor=0;positionChanged();notice(opening.name+' · '+opening.eco);},'list-item',list);addText('span',opening.name,null,b);addText('small',opening.eco,null,b);}};filter.addEventListener('input',render);render();
  }
  if(view==='editor'){
    addText('h2','Палитра фигур');const palette=document.createElement('div');palette.className='piece-palette';panel.append(palette);
    for(const piece of 'KQRBNPkqrbnp'.split('').concat('erase')){const b=addButton(piece==='erase'?'×':symbols[piece],()=>{editorPiece=piece;palette.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));},piece===editorPiece?'selected':'',palette);b.title=piece==='erase'?'Удалить фигуру':piece;}
    const options=document.createElement('div');options.className='editor-options';panel.append(options);
    const label=addText('label','Очередь хода',null,options),select=document.createElement('select');select.id='editor-turn';select.innerHTML='<option value="w">Белые</option><option value="b">Чёрные</option>';label.append(select);select.addEventListener('change',renderBoard);
    for(const right of 'KQkq'){const l=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.castle=right;input.addEventListener('change',renderBoard);l.append(input,document.createTextNode({K:'O-O белых',Q:'O-O-O белых',k:'O-O чёрных',q:'O-O-O чёрных'}[right]));options.append(l);}
    addButton('Очистить',()=>{editing={};renderBoard();});addButton('Применить позицию →',()=>{try{const fen=editorFen();game=new Chess(fen);cursor=0;setView('analysis');positionChanged();}catch(e){notice('Некорректная позиция: '+e.message,true);}},'button primary').style.marginLeft='8px';
  }
  if(view==='library'){
    const library=storage.get('library',[]);addText('h2',`Сохранённые партии · ${library.length}`);addText('p','Хранятся только в этом браузере. Экспортируйте резервную копию перед очисткой данных.','muted');
    addButton('Экспорт JSON',()=>download('open-knight-library.json',JSON.stringify({version:1,games:library,puzzles:storage.get('customPuzzles',[])},null,2),'application/json'));
    const input=document.createElement('input');input.type='file';input.accept='.json';input.setAttribute('aria-label','Импорт библиотеки JSON');panel.append(input);
    input.addEventListener('change',async()=>{try{const data=JSON.parse(await input.files[0].text());if(data.version!==1||!Array.isArray(data.games))throw new Error('Неподдерживаемый формат');for(const item of data.games){if(typeof item.pgn!=='string'||typeof item.fen!=='string'||typeof item.id!=='string')throw new Error('Повреждённая запись');const c=new Chess();if(item.pgn)c.loadPgn(item.pgn);else c.load(item.fen);}for(const p of data.puzzles||[]){new Chess(p.fen);if(!Array.isArray(p.solution)||!p.solution.length)throw new Error('Повреждённая задача');}const unique=new Map([...library,...data.games].map(g=>[g.id,g]));storage.set('library',[...unique.values()]);const uniquePuzzles=new Map([...storage.get('customPuzzles',[]),...(data.puzzles||[])].map(p=>[p.fen,p]));storage.set('customPuzzles',[...uniquePuzzles.values()]);renderContext();notice('Библиотека импортирована.');}catch(e){notice('Не удалось импортировать: '+e.message,true);}});
    for(const item of library){const row=document.createElement('div');row.className='list-item';panel.append(row);const b=addButton('',()=>{try{loadInput(item.pgn||item.fen);reviewRows=item.review||[];}catch(e){notice(e.message,true);}},'text-button',row);addText('span',item.name,null,b);addText('small',new Date(item.date).toLocaleDateString('ru-RU'),null,b);addButton('Удалить',()=>{storage.set('library',storage.get('library',[]).filter(g=>g.id!==item.id));renderContext();},'text-button',row);}
  }
}
async function runReview(){
  const positions=gamePositions(game),moves=game.history();if(!moves.length)return notice('Сначала импортируйте PGN или сыграйте несколько ходов.');
  clearTimeout(analysisTimer);generation++;const token=++reviewToken;reviewRows=[];renderReview();
  try{
    await ensureEngine();if(token!==reviewToken)return;const scores=[];
    for(let i=0;i<positions.length;i++){
      if(token!==reviewToken)return;
      const r=await engine.analyze(positions[i],{time:Math.min(Number($('time').value),1500),depth:Number($('depth').value),multipv:1});
      if(token!==reviewToken)return;
      let score=r.lines.find(x=>x.multipv===1);
      if(!score){const c=new Chess(positions[i]);score=c.isCheckmate()?{type:'mate',score:c.turn()==='w'?-1:1,pv:[]}:{type:'cp',score:0,pv:[]};}
      scores.push(score);
      if(i){const loss=moveLoss(scores[i-1],score,positions[i-1].split(' ')[1]);reviewRows.push({ply:i,san:moves[i-1],loss,classification:classifyLoss(loss),score,fen:positions[i-1],bestmove:scores[i-1].pv[0]});renderReview();}
      if($('review-progress')){$('review-progress').value=(i+1)/positions.length;$('review-status').textContent=`Позиция ${i+1} из ${positions.length}`;}
    }
    notice(`Разбор завершён: ${moves.length} полуходов. Сохраните партию вместе с разбором.`);
  }catch(e){if(token===reviewToken)notice(e.message,true);}
}
function renderReview(){
  const result=$('review-results');if(!result)return;result.replaceChildren();if(!reviewRows.length)return;
  const ns='http://www.w3.org/2000/svg',chart=document.createElementNS(ns,'svg');chart.classList.add('chart');chart.setAttribute('viewBox','0 0 600 110');chart.setAttribute('role','img');chart.setAttribute('aria-label','График оценки с точки зрения белых');
  const baseline=document.createElementNS(ns,'path');baseline.setAttribute('d','M 0 55 L 600 55');baseline.setAttribute('stroke','#59654d');chart.append(baseline);
  const path=document.createElementNS(ns,'path');path.setAttribute('d',reviewRows.map((r,i)=>`${i?'L':'M'} ${reviewRows.length===1?300:i*600/(reviewRows.length-1)} ${55-48*Math.tanh(numericScore(r.score)/500)}`).join(' '));path.setAttribute('stroke','#c7f26b');path.setAttribute('stroke-width','2');path.setAttribute('fill','none');chart.append(path);result.append(chart);
  for(const row of reviewRows){const el=document.createElement('div');el.className='review-row';const b=addButton(`${Math.ceil(row.ply/2)}${row.ply%2?'.':'…'} ${row.san}`,()=>navigate(row.ply),'',el);const tag=addText('span',row.classification.label,null,el);tag.style.color=row.classification.color;addText('small',`−${(row.loss/100).toFixed(2)}`,null,el);if(row.loss>=50&&row.bestmove)addButton('+ задача',()=>{const list=storage.get('customPuzzles',[]);if(!list.some(p=>p.fen===row.fen)){list.push({name:`Повторить ход ${Math.ceil(row.ply/2)}`,theme:'Найдите улучшение из своей партии',fen:row.fen,solution:[row.bestmove]});storage.set('customPuzzles',list);}notice('Ошибка добавлена в задачи.');},'text-button',el);result.append(el);}
}
async function connectTab(){
  try{const tabs=await browser.tabs.query({active:true,currentWindow:true});let tab=tabs[0];if(!/^https:\/\/(www\.)?(chess\.com|lichess\.org)\//.test(tab?.url||'')){const candidates=await browser.tabs.query({url:['*://*.chess.com/*','*://lichess.org/*']});if(candidates.length!==1)throw new Error('Откройте Chess.com или Lichess и запустите боковую панель из этой вкладки.');tab=candidates[0];}sourceTab=tab.id;await captureTab();}catch(e){notice(e.message,true);}
}
async function captureTab(){
  if(!sourceTab||captureBusy)return;captureBusy=true;
  try{const data=await browser.tabs.sendMessage(sourceTab,{type:'OK_CAPTURE',turn:$('site-turn').value});if(data.error)throw new Error(data.error);const c=new Chess(data.fen);if(c.fen()!==currentFen()){game=c;cursor=0;positionChanged();}else if(lines.size)renderLines();$('capture-meta').textContent=data.exact?'Полная FEN из записи ходов.':'Расположение фигур. '+(data.turnInferred?'Очередь определена из ходов. ':'Очередь задана вручную. ')+'Рокировка и взятие на проходе не восстановлены.';if(!data.exact&&!data.turnInferred&&$('site-turn').value==='auto')notice('Не удалось определить очередь хода. Выберите её в настройке «Ход на сайте».');}catch(e){$('follow-tab').checked=false;clearInterval(followTimer);notice('Доска сайта: '+e.message,true);}finally{captureBusy=false;}
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-engine]').forEach(b=>b.addEventListener('click',()=>{cancelReview();generation++;clearTimeout(analysisTimer);engine.destroy();engineMode=b.dataset.engine;storage.set('engine',engineMode);document.querySelectorAll('[data-engine]').forEach(x=>x.classList.toggle('selected',x===b));$('engine-caption').textContent=engineMode==='lite'?'Быстрый старт. Компактная нейросеть.':'Полная нейросеть. Более сильный анализ.';analyzePosition();}));
for(const id of ['depth','multipv','time','hash']){$(id).value=storage.get(id,$(id).value);$(id).addEventListener('change',()=>{storage.set(id,$(id).value);if($('auto-analysis').checked)analyzePosition();});}
$('analyze').addEventListener('click',analyzePosition);$('stop').addEventListener('click',()=>{generation++;cancelReview();clearTimeout(analysisTimer);engine.stop().catch(()=>{});$('engine-state').textContent='Остановлен';$('engine-dot').style.background='var(--lime)';});
$('start').addEventListener('click',()=>navigate(0));$('prev').addEventListener('click',()=>navigate(cursor-1));$('next').addEventListener('click',()=>navigate(cursor+1));$('end').addEventListener('click',()=>navigate(game.history().length));$('flip').addEventListener('click',()=>{flipped=!flipped;renderBoard();});
$('new-game').addEventListener('click',()=>{game=new Chess();cursor=0;reviewRows=[];setView('analysis');positionChanged();});
$('copy-fen').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('fen-display').value);notice('FEN скопирована.');}catch{ $('fen-display').select();notice('Выделена FEN. Нажмите Ctrl+C.');}});
$('save').addEventListener('click',saveGame);$('export-pgn').addEventListener('click',()=>download('open-knight.pgn',game.pgn()));
$('import-button').addEventListener('click',()=>{$('import-error').textContent='';$('import-dialog').showModal();});$('close-import').addEventListener('click',()=>$('import-dialog').close());
$('import-form').addEventListener('submit',event=>{event.preventDefault();try{loadInput($('import-text').value);$('import-dialog').close();}catch(e){$('import-error').textContent='Не удалось прочитать позицию: '+e.message;}});
$('pgn-file').addEventListener('change',async()=>{if($('pgn-file').files[0])$('import-text').value=await $('pgn-file').files[0].text();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
document.querySelectorAll('[data-promotion]').forEach(b=>b.addEventListener('click',()=>{applyMove({...pendingPromotion,promotion:b.dataset.promotion});pendingPromotion=null;$('promotion-dialog').close();}));
$('show-arrows').addEventListener('change',()=>drawArrows(visibleInfos()));
$('auto-analysis').addEventListener('change',()=>{if($('auto-analysis').checked)analyzePosition();else{generation++;clearTimeout(analysisTimer);engine.stop().catch(()=>{});}});
document.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||document.querySelector('dialog[open]'))return;if(event.key==='ArrowLeft'){event.preventDefault();navigate(cursor-1);}if(event.key==='ArrowRight'){event.preventDefault();navigate(cursor+1);}if(event.key.toLowerCase()==='f'){flipped=!flipped;renderBoard();}});
if(extension){$('extension-controls').hidden=false;$('connect-tab').addEventListener('click',connectTab);$('site-turn').addEventListener('change',captureTab);$('follow-tab').addEventListener('change',async()=>{clearInterval(followTimer);if($('follow-tab').checked){if(!sourceTab)await connectTab();if(sourceTab&&$('follow-tab').checked)followTimer=setInterval(captureTab,650);}});$('overlay').addEventListener('change',()=>{if(!$('overlay').checked&&sourceTab)browser.tabs.sendMessage(sourceTab,{type:'OK_CLEAR_ARROWS'}).catch(()=>{});else renderLines();});}
window.addEventListener('pagehide',()=>{engine.destroy();clearInterval(followTimer);if(extension&&sourceTab)browser.tabs.sendMessage(sourceTab,{type:'OK_CLEAR_ARROWS'}).catch(()=>{});});
renderContext();renderBoard();
(async()=>{
  const requestedMode=new URLSearchParams(location.search).get('engine')||storage.get('engine','lite');
  engineMode=requestedMode==='full'?'full':'lite';
  try{const sizes=await(await fetch('./engines/sizes.json')).json();for(const mode of ['lite','full'])$(mode+'-size').textContent=sizes[mode]?(sizes[mode]/1000000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' МБ':'нет в Lite ZIP';if(!sizes.full){const button=document.querySelector('[data-engine="full"]');button.disabled=true;button.title='Установите Full ZIP, чтобы использовать полную нейросеть';}}catch{}
  if(document.querySelector('[data-engine="full"]').disabled)engineMode='lite';
  document.querySelectorAll('[data-engine]').forEach(button=>button.classList.toggle('selected',button.dataset.engine===engineMode));
  $('engine-caption').textContent=engineMode==='full'?'Полная нейросеть. Более сильный анализ.':'Быстрый старт. Компактная нейросеть.';
  if(extension){const {pendingCapture}=await browser.storage.local.get('pendingCapture');if(pendingCapture){await browser.storage.local.remove('pendingCapture');try{game=new Chess(pendingCapture.fen);sourceTab=pendingCapture.tabId;cursor=0;positionChanged();if(!pendingCapture.exact)notice('Позиция прочитана с сайта. Проверьте очередь хода и права рокировки через FEN.');}catch(e){notice(e.message,true);}}}
  analysisTimer=setTimeout(analyzePosition,300);
})();
