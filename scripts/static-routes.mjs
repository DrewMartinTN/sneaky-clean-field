import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/sales',{recursive:true});
const index=await readFile('dist/index.html','utf8');
await writeFile('dist/sales/index.html',index.replaceAll('./assets/','../assets/').replaceAll('./favicon.svg','../favicon.svg'));
// Discard expired Sites callback parameters before loading Google sign-in.
await mkdir('dist/callback',{recursive:true});
await writeFile('dist/callback/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>Open Field</title></head><body><p>Opening Field… <a href="../">Continue to Field</a></p><script>location.replace(new URL("../",location.href).pathname);</script></body></html>');
await writeFile('dist/.nojekyll','');
