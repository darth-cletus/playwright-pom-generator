import {build,context} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const f of ['manifest.json','sidepanel.html','style.css']) await copyFile(f,'dist/'+f);
const options={entryPoints:{background:'src/background/index.ts',content:'src/content/index.ts',sidepanel:'src/sidepanel/index.tsx'},bundle:true,outdir:'dist',format:'iife',target:'chrome114',sourcemap:true};
if(process.argv.includes('--watch')) await (await context(options)).watch(); else await build(options);
