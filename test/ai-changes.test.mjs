import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateResponse} from '../ai-changes.mjs';
const project={name:'Prueba',html:'<p>Hola</p>',css:'a{} a{}',js:'const x=1;'};
const parse=obj=>validateResponse(JSON.stringify(obj),project);
test('rechaza JSON, rutas, duplicados, truncamiento y sustituciones ambiguas',()=>{
 assert.throws(()=>validateResponse('```html\n<h1>Hola</h1>```',project));
 for(const files of [[{path:'style.css',edits:[{find:'a{}',replace:'b{}'}]}],[{path:'index.html',content:'<p>Otro</p>'}],[{path:'index.html',edits:[{find:'Hola',replace:'Otro'}]},{path:'index.html',edits:[{find:'Otro',replace:'Otra'}]}],[{path:'../../server.mjs',content:'x'}]])assert.throws(()=>parse({action:'edit',summary:'Cambio',files}));
 assert.throws(()=>parse({action:'create',summary:'Página',files:[{path:'index.html',content:'<p>Hola</p>'}]}));
 assert.throws(()=>parse({action:'explain',summary:'Pregunta',files:[{path:'style.css',content:''}]}));
 assert.throws(()=>parse({action:'edit',summary:'Cambio',projectId:'otro',files:[]}));
});
test('sustitución exacta conserva todo el resto y no ejecuta JS durante validación',()=>{
 const result=parse({action:'edit',summary:'Saludo',files:[{path:'index.html',edits:[{find:'Hola',replace:'Buenas'}]}]});assert.equal(result.next.html,'<p>Buenas</p>');assert.equal(result.next.css,project.css);assert.equal(result.next.js,project.js);
 const script=parse({action:'edit',summary:'JS',files:[{path:'script.js',edits:[{find:'const x=1;',replace:'throw new Error("no ejecutar");'}]}]});assert.ok(script.next.js.includes('throw'));
});
