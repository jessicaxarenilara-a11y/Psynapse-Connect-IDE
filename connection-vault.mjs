import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

export function openVault({root,dataDir,hasConnections=false}){
 const keyFile=path.resolve(process.env.CONNECTION_KEY_FILE||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.config'),'Psynapse Connect','master.key'));
 const inside=base=>{const relative=path.relative(path.resolve(base),keyFile);return !relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)};
 if(inside(root)||inside(dataDir))throw Error('La clave de cifrado debe estar fuera del proyecto y de la base de datos.');
 if(!existsSync(keyFile)){
  if(hasConnections)throw Error('Falta la clave de cifrado de las conexiones existentes. Restaura master.key antes de iniciar.');
  mkdirSync(path.dirname(keyFile),{recursive:true});writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});
 }
 if(process.platform==='win32')execFileSync('icacls',[keyFile,'/inheritance:r','/grant:r',`${os.userInfo().username}:(F)`],{stdio:'ignore',windowsHide:true});else chmodSync(keyFile,0o600);
 const key=readFileSync(keyFile);if(key.length!==32)throw Error('Clave de cifrado inválida.');
 const aad=(userId,provider)=>Buffer.from(JSON.stringify([userId,provider,'v1']));
 return {
  encrypt(secret,userId,provider){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(userId,provider));const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};},
  decrypt(record,userId,provider){if(record.v!==1)throw Error('Conexión cifrada inválida.');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));decipher.setAAD(aad(userId,provider));decipher.setAuthTag(Buffer.from(record.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8');}
 };
}
