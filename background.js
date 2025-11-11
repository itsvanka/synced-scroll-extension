// remove / add a tas to local storage to activate synced scroll
async function updateTabIds(tabId){
  let reload = false;
  let res = await chrome.storage.local.get(["tabs"])
  if(res && res["tabs"] && Array.isArray(res["tabs"])){
    let oldTabs = res["tabs"];
    let newTabs = [];
    if (oldTabs.includes(tabId)){
      newTabs = oldTabs.filter(item => item !== tabId);
      reload = true;
    } else{
      newTabs = oldTabs.slice();
      newTabs.push(tabId);
    }
    await chrome.storage.local.set({"tabs": newTabs});
  }else{
    await chrome.storage.local.set({"tabs": [tabId]});
  }
  if(reload){
    window.location.reload();
  }else{
    await chrome.runtime.sendMessage({text: "activate_listeners"});
  }
}

// function activate event listeners for scrolling
async function activateListeners(tabId){
  // update badge
  chrome.runtime.sendMessage({text: "update_badge"});

  // global vars
  var scrollThrottle = false;
  var keyPressed = false;
  var scrollBefore = window.scrollY;
  var scrollFromEvent = false;
  var scrollFromEventTimeout;
  var macDetected = navigator.userAgent && navigator.userAgent.toLowerCase().search(/(macintosh|[\s\.,]mac[\s\.,])/)>=0 

  // synced scroll is active message
  let infoDiv = document.createElement("div");
  infoDiv.style.width="100%";
  infoDiv.style.backgroundColor="rgb(134, 131, 110)";
  infoDiv.style.color="rgb(231, 231, 231)";
  infoDiv.style.position="fixed";
  infoDiv.style.bottom="0";
  infoDiv.style.fontSize="12px";
  infoDiv.style.padding="4px 0 4px 0";
  infoDiv.style.fontWeight="600";
  infoDiv.style.zIndex="9000";
  infoDiv.style.textAlign="center";
  infoDiv.style.lineHeight="24px";
  infoDiv.style.fontFamily="'Arial', sans-serif";
  infoDiv.innerText = `Synced Scroll is active. To turn it off click the Extension Icon. Hold ${(macDetected?"CTRL":"CTRL+ALT")} while scrolling to scroll only current tab.`;
  document.getElementsByTagName("body")[0].appendChild(infoDiv);

  // if control prssed
  window.addEventListener("keydown", (e) => {
    if(macDetected){
      if (e.ctrlKey){
          keyPressed = true;
      }else{
          keyPressed = false;
      }
    } else{
      if (e.ctrlKey && e.altKey){
          keyPressed = true;
      }else{
          keyPressed = false;
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    if(macDetected){
      if (e.ctrlKey){
          keyPressed = true;
      }else{
          keyPressed = false;
      }
    } else{
      if (e.ctrlKey && e.altKey){
          keyPressed = true;
      }else{
          keyPressed = false;
      }
    }
  });

  // on sroll update local storage
  window.addEventListener("scroll", function(e){
    if(!scrollFromEvent){
      if(!scrollThrottle){
        scrollThrottle = true;
        setTimeout(function(){
          if (!keyPressed){
            chrome.storage.local.set({"scroll":{"tabId":tabId, "scrollY":window.scrollY - scrollBefore, "date":Date.now()}})
          }
          scrollBefore = window.scrollY;
          scrollThrottle = false;
        }, 25)
      }
    }
  });

  // sroll page when other tab is scrolled
  chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
      if (key == "scroll"){
          if (newValue["tabId"] != tabId){
            clearTimeout(scrollFromEventTimeout);
            scrollFromEvent = true;
            window.scrollBy(0, newValue["scrollY"]);
            scrollFromEventTimeout = setTimeout(()=>{
              scrollBefore = window.scrollY;
              scrollFromEvent = false;
            },25)
          }
      }
    }
  });
}

// extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  //cleaning closed tabs
    const res = await chrome.storage.local.get(["tabs"]);
    const tabs = await chrome.tabs.query({});
    const tabIds = tabs.map(tab => tab.id);
    if(res && res["tabs"] && Array.isArray(res["tabs"])){
      const tmpAr=res["tabs"].filter(item => tabIds.includes(item));
      await chrome.storage.local.set({"tabs": tmpAr});
    }
  //add/remove current tab to the list
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        args: [tab.id],
        func: updateTabIds,
      });
    } catch (err) {
      console.error(`failed to execute script: ${err}`);
    }
    
  });

// update badge to ON listener
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.text == "update_badge") {
    chrome.action.setBadgeTextColor({color:"#109e19", tabId:sender.tab.id});
    chrome.action.setBadgeText({text:"ON", tabId:sender.tab.id});
  }
});

// extension listener to activate listeners from a content script
chrome.runtime.onMessage.addListener(async function(msg, sender, sendResponse) {
  if (msg.text == "activate_listeners") {
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: sender.tab.id
        },
        args: [sender.tab.id],
        func: activateListeners,
      });
    } catch (err) {
      console.error(`failed to execute script: ${err}`);
    }
  }
});

// if page in the list, activate listeners on page load
chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading') {
        let res = await chrome.storage.local.get(["tabs"]);
        if(res && res["tabs"] && Array.isArray(res["tabs"]) && res["tabs"].includes(tabId)){
          try {
            await chrome.scripting.executeScript({
              target: {
                tabId: tab.id
              },
              args: [tab.id],
              func: activateListeners,
            });
          } catch (err) {
            console.error(`failed to execute script: ${err}`);
          }
        }else{
          chrome.action.setBadgeText({text:"", tabId:tabId});
        }
    }
});