const openApp=()=>browser.tabs.create({url:browser.runtime.getURL('app/index.html')});
document.getElementById('open').addEventListener('click',()=>{openApp();window.close();});
document.getElementById('sidebar').addEventListener('click',()=>{browser.sidebarAction.open();window.close();});
document.getElementById('capture').addEventListener('click',async()=>{try{const [tab]=await browser.tabs.query({active:true,currentWindow:true});const data=await browser.tabs.sendMessage(tab.id,{type:'OK_CAPTURE',turn:'auto'});if(data.error)throw new Error(data.error);await browser.storage.local.set({pendingCapture:{...data,tabId:tab.id}});await openApp();window.close();}catch(e){document.getElementById('status').textContent='Откройте доску Chess.com или Lichess. '+e.message;}});
