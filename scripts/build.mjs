import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=process.cwd(),dist=path.join(root,'dist');
await fs.mkdir(dist,{recursive:true});
for(const target of ['site','firefox']){
  const dir=path.join(dist,target);await fs.mkdir(path.join(dir,'app','engines'),{recursive:true});
  for(const file of ['app.css','fonts.css','quality.css','icon.svg'])await fs.copyFile('src/'+file,path.join(dir,'app',file));
  await fs.copyFile('src/app.html',path.join(dir,'app','index.html'));
  await build({entryPoints:['src/app.js'],bundle:true,format:'iife',target:'firefox128',outfile:path.join(dir,'app','app.js'),legalComments:'eof',minify:false});
  const sizes={},checksums={};
  for(const mode of ['lite','full']){
    let size=0;for(const extension of ['js','wasm']){
      const file=`stockfish-19-${mode==='lite'?'lite-single':'single'}.${extension}`,source=path.join('node_modules','stockfish','bin',file),data=await fs.readFile(source);
      await fs.writeFile(path.join(dir,'app','engines',file),data);size+=data.length;checksums[file]=createHash('sha256').update(data).digest('hex');
    }sizes[mode]=size;
  }
  await fs.writeFile(path.join(dir,'app','engines','sizes.json'),JSON.stringify(sizes,null,2));
  await fs.writeFile(path.join(dir,'app','engines','SHA256SUMS'),Object.entries(checksums).map(([file,hash])=>`${hash}  ${file}`).join('\n')+'\n');
  await fs.copyFile('node_modules/stockfish/Copying.txt',path.join(dir,'LICENSE'));
  await fs.copyFile('node_modules/chess.js/LICENSE',path.join(dir,'CHESS-JS-LICENSE'));
  for(const file of ['NOTICE.md','PRIVACY.md'])await fs.copyFile(file,path.join(dir,file));
  // Corresponding Stockfish.js source, including its build scripts and network metadata.
  await fs.copyFile('vendor-source/stockfish.js-19.0.1.tar.gz',path.join(dir,'app','engines','stockfish.js-19.0.1-source.tar.gz'));
  if(target==='site'){
    for(const file of ['index.html','site.css','site.js'])await fs.copyFile('web/'+file,path.join(dir,file));
    await fs.copyFile('src/icon.svg',path.join(dir,'icon.svg'));await fs.writeFile(path.join(dir,'.nojekyll'),'');
  }else{
    const manifest={manifest_version:3,name:'Open Knight — Stockfish без подписки',version:'1.0.0',description:'Локальный анализ Stockfish 19 Lite и Full, качество ходов, PGN, разбор партий и стрелки на Chess.com / Lichess.',
      browser_specific_settings:{gecko:{id:'open-knight@derskii.github.io',strict_min_version:'140.0',data_collection_permissions:{required:['none']}},gecko_android:{strict_min_version:'142.0'}},
      permissions:['storage','activeTab'],host_permissions:['https://www.chess.com/*','https://chess.com/*','https://lichess.org/*'],
      action:{default_popup:'popup.html',default_title:'Open Knight',default_icon:{'48':'icon.svg','96':'icon.svg'}},
      sidebar_action:{default_title:'Open Knight',default_panel:'app/index.html',default_icon:'icon.svg'},icons:{'48':'icon.svg','96':'icon.svg'},
      content_scripts:[{matches:['https://www.chess.com/*','https://chess.com/*','https://lichess.org/*'],js:['content.js'],run_at:'document_idle'}],
      content_security_policy:{extension_pages:"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"}};
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
    for(const file of ['popup.html','popup.css','icon.svg'])await fs.copyFile('src/'+file,path.join(dir,file));
    await build({entryPoints:['src/popup.js'],bundle:true,target:'firefox128',outfile:path.join(dir,'popup.js')});
    await build({entryPoints:['src/content.js'],bundle:true,format:'iife',target:'firefox128',outfile:path.join(dir,'content.js')});
  }
}
console.log('Built: dist/firefox and dist/site');
