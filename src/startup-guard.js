// Independent of the bundled UI/PDF modules, so initialization failures are visible.
(()=>{
 function show(event){
  const status=document.getElementById('status');if(!status)return;
  const name=event.error?.name||event.reason?.name||'ScriptError';
  status.classList.add('error');status.textContent=`[UI_SCRIPT_FAILED] 扩展界面脚本未能完成操作（${name}）。请确认加载的是安装包中的 jev-apply 文件夹、覆盖更新后已重新加载扩展，并使用最新版 Chrome / Edge。仍失败时，请提供扩展版本和此错误码。`;
 }
 window.addEventListener('error',event=>{if(event.error||event.target?.tagName==='SCRIPT')show(event);},true);
 window.addEventListener('unhandledrejection',show);
})();
