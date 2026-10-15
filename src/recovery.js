import recovered from './content-recovery.json';
const MARKER='content_recovery_20261014';
/** Restore public website content once; preserve any records already edited in staging. */
export async function ensureContentRecovery(env) {
  const done=await env.DB.prepare('SELECT setting_value FROM cms_settings WHERE setting_key=?').bind(MARKER).first();
  if(done)return;
  const statements=recovered.batch.map(({sql,params=[]})=>env.DB.prepare(sql).bind(...params));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO cms_settings(setting_key,setting_value) VALUES(?,?)').bind(MARKER,'restored'));
  await env.DB.batch(statements);
}
