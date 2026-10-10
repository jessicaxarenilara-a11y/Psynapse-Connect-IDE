import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openVault} from '../connection-vault.mjs';
test('AES-GCM autentica usuario, proveedor y contenido; falla sin clave maestra',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'vault-test-'));process.env.CONNECTION_KEY_FILE=path.join(dir,'master.key');
 try{const config={root:path.join(dir,'repo'),dataDir:path.join(dir,'db')};const vault=openVault(config);const record=vault.encrypt('secret-abc','alice','groq');assert.equal(vault.decrypt(record,'alice','groq'),'secret-abc');assert.throws(()=>vault.decrypt(record,'bob','groq'));assert.throws(()=>vault.decrypt(record,'alice','openrouter'));assert.throws(()=>vault.decrypt({...record,tag:Buffer.alloc(16).toString('base64')},'alice','groq'));assert.equal(openVault({...config,hasConnections:true}).decrypt(record,'alice','groq'),'secret-abc');unlinkSync(process.env.CONNECTION_KEY_FILE);assert.throws(()=>openVault({...config,hasConnections:true}),/Falta la clave/);process.env.CONNECTION_KEY_FILE=path.join(config.root,'master.key');assert.throws(()=>openVault(config),/fuera/)}finally{rmSync(dir,{recursive:true,force:true})}
});
