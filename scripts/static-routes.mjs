import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/sales',{recursive:true});
const index=await readFile('dist/index.html','utf8');
await writeFile('dist/sales/index.html',index.replaceAll('./assets/','../assets/').replaceAll('./favicon.svg','../favicon.svg'));
await writeFile('dist/.nojekyll','');
