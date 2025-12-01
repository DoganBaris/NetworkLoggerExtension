let networkLogs = [];
let apiTargetUrl = '';
let consoleTargetUrl = '';
let isLoggingActive = false;

chrome.storage.local.get(['apiTargetUrl', 'consoleTargetUrl', 'isLoggingActive'], function(result) {
  apiTargetUrl = result.apiTargetUrl || '';
  consoleTargetUrl = result.consoleTargetUrl || '';
  isLoggingActive = result.isLoggingActive || false;
});

function matchesTargetUrl(url) {
  if (!apiTargetUrl || apiTargetUrl.trim() === '') {
    return false;
  }
  return url.includes(apiTargetUrl);
}

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!isLoggingActive) return;
    
    if ((details.method === 'POST' || details.method === 'GET') && matchesTargetUrl(details.url)) {
      const startTime = Date.now();
      
      let requestBody = null;
      if (details.requestBody) {
        if (details.requestBody.raw) {
          const decoder = new TextDecoder('utf-8');
          requestBody = decoder.decode(details.requestBody.raw[0].bytes);
        } else if (details.requestBody.formData) {
          requestBody = JSON.stringify(details.requestBody.formData);
        }
      }
      
      networkLogs.push({
        id: details.requestId,
        method: details.method,
        url: details.url,
        requestBody: requestBody,
        startTime: startTime,
        timestamp: new Date().toISOString()
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (!isLoggingActive) return;
    
    const endTime = Date.now();
    const logIndex = networkLogs.findIndex(log => log.id === details.requestId);
    
    if (logIndex !== -1) {
      networkLogs[logIndex].status = details.statusCode;
      networkLogs[logIndex].duration = endTime - networkLogs[logIndex].startTime;
      networkLogs[logIndex].responseHeaders = details.responseHeaders;
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    if (!isLoggingActive) return;
    
    const logIndex = networkLogs.findIndex(log => log.id === details.requestId);
    
    if (logIndex !== -1) {
      networkLogs[logIndex].error = details.error;
      networkLogs[logIndex].status = 0;
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getNetworkLogs") {
    sendResponse({ logs: networkLogs });
  } 
  else if (request.action === "clearNetworkLogs") {
    networkLogs = [];
    sendResponse({ success: true });
  }
  else if (request.action === "setApiTargetUrl") {
    apiTargetUrl = request.url;
    chrome.storage.local.set({ apiTargetUrl: apiTargetUrl }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === "setConsoleTargetUrl") {
    consoleTargetUrl = request.url;
    chrome.storage.local.set({ consoleTargetUrl: consoleTargetUrl }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === "getApiTargetUrl") {
    sendResponse({ url: apiTargetUrl });
  }
  else if (request.action === "getConsoleTargetUrl") {
    sendResponse({ url: consoleTargetUrl });
  }
  else if (request.action === "setLoggingActive") {
    isLoggingActive = request.active;
    chrome.storage.local.set({ isLoggingActive: isLoggingActive }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === "getLoggingActive") {
    sendResponse({ active: isLoggingActive });
  }
  else if (request.action === "getConsoleLogs") {
    chrome.storage.local.get(['consoleLogs'], function(result) {
      sendResponse({ logs: result.consoleLogs || [] });
    });
    return true;
  }
  else if (request.action === "clearConsoleLogs") {
    chrome.storage.local.set({ consoleLogs: [] }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
  return true;
});

chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (changes.apiTargetUrl) {
    apiTargetUrl = changes.apiTargetUrl.newValue;
  }
  if (changes.consoleTargetUrl) {
    consoleTargetUrl = changes.consoleTargetUrl.newValue;
  }
  if (changes.isLoggingActive) {
    isLoggingActive = changes.isLoggingActive.newValue;
  }
});
