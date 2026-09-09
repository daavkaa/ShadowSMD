(() => {
  const config=window.SHADOWOPS_CONFIG||{};
  let valid=false;
  try {
    const url=new URL(config.url);
    const key=String(config.publishableKey||'');
    let publicKey=key.startsWith('sb_publishable_');
    if(key.startsWith('eyJ')){
      const encoded=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      publicKey=JSON.parse(atob(encoded)).role==='anon';
    }
    valid=url.protocol==='https:'&&!!url.hostname&&publicKey;
  } catch (_) {}
  const form=document.getElementById('authForm');
  function showMessage(title,message){
    form.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=title;
    const details=document.createElement('p');details.textContent=message;
    form.append(heading,details);
  }
  if(!valid){
    showMessage('Connect your new Supabase project','Open config.js and enter your Project URL and publishable key. Then refresh this page.');
    return;
  }
  if(!window.supabase){
    showMessage('Connection library could not load','Check your internet connection and refresh this page.');
    return;
  }
  const script=document.createElement('script');script.src='app.js?v=20260909-fresh';
  script.onerror=()=>showMessage('ShadowOPS could not load','Check that app.js is in the same folder as index.html and refresh.');
  document.body.appendChild(script);
})();
