import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { Webhook } from 'standardwebhooks';
import { createClient } from '@supabase/supabase-js';
import { fixture } from './mux.fixture.mjs';
export default { async test() {
 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.load(Uint8Array.from(atob(fixture), c=>c.charCodeAt(0)).buffer);
 if (workbook.worksheets[0].getCell('A1').value !== 'fixture') throw Error('xlsx parse mismatch');
 if (Papa.parse('a,b\n1,2').data[1][1] !== '2') throw Error('papaparse failed');
 if (strFromU8(unzipSync(zipSync({'a.txt': strToU8('fixture')}))['a.txt']) !== 'fixture') throw Error('fflate failed');
 const hook=new Webhook(new Uint8Array(32).fill(7), {format:'raw'}); const now=new Date(); const payload='{"ok":true}';
 const signature=hook.sign('id',now,payload); if (!hook.verify(payload, {'webhook-id':'id','webhook-timestamp':String(Math.floor(now.getTime()/1000)),'webhook-signature':signature}).ok) throw Error('webhooks failed');
 const client=createClient('https://supabase.invalid','fixture'); if (!client.auth || !client.storage) throw Error('supabase client failed');
 console.log('exceljs XLSX, papaparse, fflate, standardwebhooks and supabase-js: pass');
} };
