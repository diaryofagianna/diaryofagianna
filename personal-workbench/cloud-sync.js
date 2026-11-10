(function(){
'use strict';
const A=window.WorkbenchApp, C=window.WORKBENCH_SUPABASE_CONFIG, KEY='diaryofagianna.personal-workbench.v1';
if(!A||!C||!window.supabase){console.error('Workbench cloud dependencies unavailable');return}
const client=window.supabase.createClient(C.url,C.publishableKey);
let user=null, channel=null, remote=null, busy=false, timer=null, lastRemoteAt=0, clientId=localStorage.getItem('wb.client-id')||crypto.randomUUID();
localStorage.setItem('wb.client-id',clientId);
const $=s=>document.querySelector(s);
const say=s=>{const el=$('#wbCloudStatus');if(el)el.textContent=s};
const clone=v=>JSON.parse(JSON.stringify(v));
function localBackup(label='pre-sync'){
 try{const d=clone(A.data);const k='diaryofagianna.personal-workbench.cloud-backups';let h=JSON.parse(localStorage.getItem(k)||'[]');h.unshift({at:new Date().toISOString(),label,data:d});localStorage.setItem(k,JSON.stringify(h.slice(0,20)))}catch(e){console.warn('Could not make local safety copy',e)}
}
function mergeData(local,cloud){
 const out={...cloud,...local};
 const keys=['tasks','plans','habits','notes','events','mindNodes'];
 for(const key of keys){
  const a=Array.isArray(cloud[key])?cloud[key]:[], b=Array.isArray(local[key])?local[key]:[];
  const map=new Map(a.map(x=>[x.id||JSON.stringify(x),x]));
  for(const item of b){const id=item.id||JSON.stringify(item),old=map.get(id);if(!old){map.set(id,item);continue}
   const t=x=>Date.parse(x.updatedAt||x.updated||x.completedAt||x.createdAt||x.created||0)||0;
   map.set(id,t(item)>=t(old)?{...old,...item}:{...item,...old});
  }
  out[key]=[...map.values()];
 }
 out.settings={...(cloud.settings||{}),...(local.settings||{})};
 return out;
}
async function backupRemote(payload,label){
 const {error}=await client.from('workbench_backups').insert({user_id:user.id,payload,source:'sync',label});
 if(error)throw error;
}
async function writeRemote(payload,label='auto-sync'){
 if(!user||busy)return;
 busy=true;
 try{
  const {data:row,error:readError}=await client.from('workbench_state').select('revision').eq('user_id',user.id).maybeSingle();
  if(readError)throw readError;
  const {error}=await client.from('workbench_state').upsert({user_id:user.id,payload,revision:(row?.revision||0)+1,client_id:clientId,mutation_id:crypto.randomUUID(),updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw error;
  say('Đã đồng bộ · '+new Date().toLocaleTimeString());
 }catch(e){console.error(e);say('Chưa đồng bộ: '+(e.message||'lỗi kết nối'))}
 finally{busy=false}
}
function queueSync(){if(!user||busy)return;clearTimeout(timer);timer=setTimeout(()=>writeRemote(clone(A.data)),1100)}
async function loadRemote(){
 const {data,error}=await client.from('workbench_state').select('*').eq('user_id',user.id).maybeSingle();
 if(error)throw error;remote=data||null;return remote;
}
function cloudPanel(){
 const host=$('#view');if(!host)return;
 const old=$('#wbCloudPanel');if(old)old.remove();
 const box=document.createElement('section');box.className='card';box.id='wbCloudPanel';box.style.marginTop='16px';
 box.innerHTML='<h3 style="font:600 17px Playfair Display;margin-top:0">Cloud sync · Supabase</h3><p class="muted" style="font-size:12px">Đăng nhập để đồng bộ Workbench trên nhiều thiết bị. Mỗi tài khoản chỉ truy cập dữ liệu của chính mình.</p><div id="wbAuthArea"></div><p id="wbCloudStatus" class="muted" style="font-size:11px;margin:10px 0 0">Chưa kết nối</p><div id="wbSyncChoices" style="margin-top:12px"></div>';
 host.appendChild(box);renderAuth();
}
function renderAuth(){
 const el=$('#wbAuthArea');if(!el)return;
 if(user){el.innerHTML='<div class="row" style="flex-wrap:wrap;justify-content:space-between"><span><b>'+esc(user.email||'Signed in')+'</b></span><button class="btn soft small" id="wbLogout">Sign out</button></div>';$('#wbLogout').onclick=async()=>{await client.auth.signOut();location.reload()};}
 else{el.innerHTML='<div class="grid two"><div><label class="muted">Email</label><input class="field" id="wbEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div><label class="muted">Password</label><input class="field" id="wbPassword" type="password" autocomplete="current-password" placeholder="At least 8 characters"></div></div><div class="row" style="flex-wrap:wrap;margin-top:10px"><button class="btn" id="wbSignIn">Sign in</button><button class="btn soft" id="wbSignUp">Create account</button></div><p class="muted" style="font-size:10px">Email confirmation may be required depending on Supabase Auth settings.</p>';$('#wbSignIn').onclick=()=>auth('signin');$('#wbSignUp').onclick=()=>auth('signup')}
}
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function auth(mode){
 const email=$('#wbEmail').value.trim(),password=$('#wbPassword').value;
 if(!email||password.length<8){say('Nhập email và mật khẩu (ít nhất 8 ký tự).');return}
 say('Đang xác thực…');
 const {data,error}=mode==='signup'?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});
 if(error){say(error.message);return}
 if(mode==='signup'&&!data.session){say('Đã gửi email xác nhận. Xác nhận email rồi đăng nhập.');return}
 user=data.user;await afterLogin();
}
async function afterLogin(){
 renderAuth();say('Đang kiểm tra dữ liệu cloud…');
 try{
  const row=await loadRemote();
  if(row){say('Đã tìm thấy dữ liệu cloud · revision '+row.revision);showChoices(row)}
  else{say('Tài khoản mới: chưa có dữ liệu cloud.');showChoices(null)}
  subscribe();
 }catch(e){say('Không đọc được dữ liệu cloud: '+e.message)}
}
function showChoices(row){
 const el=$('#wbSyncChoices');if(!el)return;
 if(!row){el.innerHTML='<p class="muted" style="font-size:12px">Chọn cách khởi tạo dữ liệu cloud từ bản local hiện tại.</p><button class="btn" id="wbUploadLocal">Sao lưu local lên cloud</button>';$('#wbUploadLocal').onclick=async()=>{localBackup('before-first-cloud-upload');await writeRemote(clone(A.data),'first-upload')};return}
 el.innerHTML='<p class="muted" style="font-size:12px">Dữ liệu local và cloud được giữ riêng cho đến khi bạn chọn. Trước khi áp dụng, hệ thống sẽ tạo bản sao local và bản backup cloud.</p><div class="row" style="flex-wrap:wrap"><button class="btn" id="wbMerge">Merge local + cloud</button><button class="btn soft" id="wbUseCloud">Dùng bản cloud</button><button class="btn rose" id="wbUseLocal">Thay cloud bằng local</button></div><div style="margin-top:12px"><button class="btn soft small" id="wbListBackups">Xem bản phục hồi cloud</button><div id="wbBackupList"></div></div>';
 $('#wbMerge').onclick=async()=>{try{localBackup('before-merge');await backupRemote(row.payload,'before-merge');A.data=mergeData(clone(A.data),row.payload);A.save();A.render();await writeRemote(clone(A.data),'merge');say('Đã merge local + cloud và tạo backup.')}catch(e){say('Merge lỗi: '+e.message)}};
 $('#wbUseCloud').onclick=async()=>{if(!confirm('Thay dữ liệu đang có trên thiết bị này bằng dữ liệu cloud? Bản local sẽ được sao lưu trước.'))return;try{localBackup('before-cloud-restore');A.data=clone(row.payload);A.save();A.render();say('Đã nạp dữ liệu cloud vào thiết bị này.')}catch(e){say('Khôi phục lỗi: '+e.message)}};
 $('#wbUseLocal').onclick=async()=>{if(!confirm('Thay dữ liệu cloud bằng bản local trên thiết bị này? Bản cloud hiện tại sẽ được sao lưu trước.'))return;try{localBackup('before-overwrite-cloud');await backupRemote(row.payload,'before-overwrite-cloud');await writeRemote(clone(A.data),'local-replaces-cloud');say('Đã cập nhật cloud từ local.')}catch(e){say('Cập nhật lỗi: '+e.message)}};
 $('#wbListBackups').onclick=async()=>{const {data,error}=await client.from('workbench_backups').select('id,label,source,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);if(error){say(error.message);return}const list=$('#wbBackupList');list.innerHTML=(data||[]).map(v=>'<div class="list-item"><div class="grow"><b>'+esc(v.label||v.source)+'</b><p>'+new Date(v.created_at).toLocaleString()+'</p></div><button class="btn soft small" data-wb-restore="'+v.id+'">Restore</button></div>').join('')||'<p class="muted">Chưa có bản backup.</p>';list.querySelectorAll('[data-wb-restore]').forEach(b=>b.onclick=()=>restoreBackup(b.dataset.wbRestore))};
}
async function restoreBackup(id){
 if(!confirm('Khôi phục backup này vào Workbench? Dữ liệu hiện tại sẽ được sao lưu trước.'))return;
 try{const {data,error}=await client.from('workbench_backups').select('payload').eq('id',id).single();if(error)throw error;localBackup('before-cloud-backup-restore');await backupRemote(clone(A.data),'before-cloud-backup-restore');A.data=clone(data.payload);A.save();A.render();await writeRemote(clone(A.data),'restore-backup');say('Đã khôi phục backup.')}catch(e){say('Không khôi phục được: '+e.message)}
}
function subscribe(){
 if(channel)client.removeChannel(channel);
 channel=client.channel('workbench-'+user.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'workbench_state',filter:'user_id=eq.'+user.id},payload=>{
  const row=payload.new;if(!row||row.client_id===clientId||row.revision<=(remote?.revision||0))return;
  remote=row;lastRemoteAt=Date.now();say('Có bản cập nhật từ thiết bị khác. Chọn “Dùng bản cloud” hoặc “Merge local + cloud” để áp dụng.');
  showChoices(row);
 }).subscribe();
}
async function init(){
 const {data}=await client.auth.getSession();user=data.session?.user||null;
 if(user)await afterLogin();
 client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)afterLogin();else{if(channel)client.removeChannel(channel);channel=null;renderAuth();say('Đã đăng xuất')}});
 const oldSave=A.save;A.save=function(){const result=oldSave.apply(this,arguments);queueSync();return result};
 const oldSettings=A.settingsPage;A.settingsPage=function(){oldSettings();cloudPanel()};
 if(A.page==='settings')A.render();
}
init();
})();