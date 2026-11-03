import fs from 'node:fs/promises';
const meta=await(await fetch('https://registry.npmjs.org/stockfish/19.0.1')).json();
const commit='0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6';
await fs.mkdir('vendor-source',{recursive:true});
const url=`https://codeload.github.com/nmrugg/stockfish.js/tar.gz/${commit}`;
const response=await fetch(url);if(!response.ok)throw new Error('Source download failed: '+response.status);
await fs.writeFile('vendor-source/stockfish.js-19.0.1.tar.gz',new Uint8Array(await response.arrayBuffer()));
await fs.writeFile('vendor-source/PROVENANCE.json',JSON.stringify({package:'stockfish',version:'19.0.1',commit,url,integrity:meta.dist.integrity},null,2));
console.log('Corresponding source fetched at commit '+commit);
