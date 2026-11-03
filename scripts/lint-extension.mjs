import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/web-ext/bin/web-ext.js','lint','--source-dir','dist/firefox','--output','json'],{encoding:'utf8'});
if(!result.stdout){console.error(result.stderr);process.exit(1);}
const report=JSON.parse(result.stdout);
// Mozilla's parser rejects Emscripten's (void 0)(...) stub in the unmodified upstream loader.
// Do not suppress own-code diagnostics or other vendor warnings.
const known=warning=>warning.code==='UNSAFE_VAR_ASSIGNMENT'&&/^app\/engines\/stockfish-19-(lite-)?single\.js$/.test(warning.file)&&warning.message.includes('Unexpected Callee');
const unexpected=report.warnings.filter(warning=>!known(warning));
console.log(JSON.stringify({errors:report.errors,warnings:unexpected,upstreamParserWarnings:report.warnings.filter(known).map(w=>({file:w.file,line:w.line,code:w.code}))},null,2));
if(report.errors.length||unexpected.length)process.exit(1);
