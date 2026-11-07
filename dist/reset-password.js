import { CLOUD_URL, PUBLISHABLE_KEY } from './cloud-api.js';
const message=document.getElementById('message'), form=document.getElementById('reset-form');
const incoming=new URLSearchParams(location.hash.slice(1));
if (incoming.get('type') !== 'recovery' || !incoming.get('access_token')) {
  message.textContent='連結無效或已失效，請回登入頁重新申請。';
} else {
  const client=window.supabase.createClient(CLOUD_URL,PUBLISHABLE_KEY,{auth:{storageKey:'uniloop-password-recovery-v1',detectSessionInUrl:true,autoRefreshToken:false,flowType:'implicit'}});
  let ready=false;
  client.auth.onAuthStateChange((event,session)=>{
    if (event==='PASSWORD_RECOVERY' && session?.user) { ready=true;message.textContent='驗證成功，請設定新密碼。';form.hidden=false; }
  });
  client.auth.getSession().then(({error})=>{if(error)message.textContent='連結無效或已失效，請回登入頁重新申請。';}).catch(()=>{message.textContent='無法驗證連結，請檢查網路。';});
  form.onsubmit=async event=>{
    event.preventDefault();if(!ready)return;
    const first=document.getElementById('password'),second=document.getElementById('password-again'),button=form.querySelector('button');
    if(first.value!==second.value){message.textContent='兩次輸入的密碼不一致。';return;}
    button.disabled=true;
    try { const {error}=await client.auth.updateUser({password:first.value});if(error)throw error; first.value='';second.value='';ready=false;form.hidden=true;message.textContent='密碼已更新，請回登入頁使用新密碼登入。';await client.auth.signOut({scope:'local'}); }
    catch(error){message.textContent=error.message || '密碼更新失敗，請重新申請連結。';button.disabled=false;}
  };
}
