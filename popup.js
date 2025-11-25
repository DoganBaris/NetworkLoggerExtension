function safeStringify(obj, indent) {
  const cache = new Set();
  return JSON.stringify(obj, function(key, value) {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    return value;
  }, indent);
}

function updateCounts() {
  chrome.runtime.sendMessage({ action: "getNetworkLogs" }, function(response) {
    if (response && response.logs) {
      document.getElementById('networkCount').textContent = response.logs.length;
    }
  });
  
  chrome.runtime.sendMessage({ action: "getConsoleLogs" }, function(response) {
    if (response && response.logs) {
      document.getElementById('consoleCount').textContent = response.logs.length;
    }
  });
}

function loadSettings() {
  chrome.runtime.sendMessage({ action: "getApiTargetUrl" }, function(response) {
    if (response) {
      document.getElementById('apiTargetUrl').value = response.url || '';
    }
  });
  
  chrome.runtime.sendMessage({ action: "getConsoleTargetUrl" }, function(response) {
    if (response) {
      document.getElementById('consoleTargetUrl').value = response.url || '';
    }
  });
  
  chrome.runtime.sendMessage({ action: "getLoggingActive" }, function(response) {
    if (response) {
      const toggle = document.getElementById('loggingToggle');
      const label = document.getElementById('toggleLabel');
      toggle.checked = response.active || false;
      label.textContent = toggle.checked ? 'Logging: Open' : 'Logging: Close';
      label.style.color = toggle.checked ? '#4CAF50' : '#666';
    }
  });
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  });
}

function showStatus(message, isError) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (isError ? 'error' : 'success');
  
  setTimeout(() => {
    statusDiv.textContent = '';
    statusDiv.className = 'status';
  }, 3000);
}

document.getElementById('loggingToggle').addEventListener('change', function() {
  const label = document.getElementById('toggleLabel');
  label.textContent = this.checked ? 'Logging: Open' : 'Logging: Close';
  label.style.color = this.checked ? '#4CAF50' : '#666';
});

document.getElementById('saveBtn').addEventListener('click', function() {
  const apiUrl = document.getElementById('apiTargetUrl').value.trim();
  const consoleUrl = document.getElementById('consoleTargetUrl').value.trim();
  const isActive = document.getElementById('loggingToggle').checked;
  
  if (!apiUrl && !consoleUrl) {
    showStatus('Enter at least one URL!', true);
    return;
  }
  
  chrome.runtime.sendMessage({ 
    action: "setApiTargetUrl", 
    url: apiUrl 
  }, function() {
    chrome.runtime.sendMessage({ 
      action: "setConsoleTargetUrl", 
      url: consoleUrl 
    }, function() {
      chrome.runtime.sendMessage({ 
        action: "setLoggingActive", 
        active: isActive 
      }, function() {
        showStatus('Settings saved! Refresh the page (F5)', false);
        
        if (!isActive) {
          chrome.runtime.sendMessage({ action: "clearNetworkLogs" });
          chrome.runtime.sendMessage({ action: "clearConsoleLogs" });
          chrome.storage.local.set({ networkLogs: [] });
          updateCounts();
        }
      });
    });
  });
});

document.getElementById('downloadBtn').addEventListener('click', function() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  Promise.all([
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getNetworkLogs" }, function(response) {
        resolve(response && response.logs ? response.logs : []);
      });
    }),
    new Promise((resolve) => {
      chrome.storage.local.get(['networkLogs'], function(result) {
        resolve(result.networkLogs || []);
      });
    })
  ]).then(([backgroundLogs, injectedLogs]) => {
    
    let allNetworkLogs = injectedLogs.length > 0 ? injectedLogs : backgroundLogs;
    
    if (allNetworkLogs.length > 0) {
      let networkText = '';
      
      allNetworkLogs.forEach((entry, index) => {
        networkText += '================================================================================\n';
        networkText += 'REQUEST #' + (index + 1) + '\n';
        networkText += '================================================================================\n';
        networkText += 'TIMESTAMP: ' + entry.timestamp + '\n';
        networkText += 'METHOD: ' + entry.method + '\n';
        networkText += 'URL: ' + entry.url + '\n';
        
        if (entry.queryString && Object.keys(entry.queryString).length > 0) {
          networkText += 'QUERY PARAMETERS:\n';
          for (let key in entry.queryString) {
            networkText += '  ' + key + ': ' + entry.queryString[key] + '\n';
          }
        }
        
        networkText += 'DURATION: ' + (entry.duration || 0) + 'ms\n';
        networkText += 'STATUS: ' + (entry.status || 'pending') + '\n';
        if (entry.statusText) {
          networkText += 'STATUS TEXT: ' + entry.statusText + '\n';
        }
        networkText += '--------------------------------------------------------------------------------\n';
        
        if (entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0) {
          networkText += 'REQUEST HEADERS:\n';
          for (let key in entry.requestHeaders) {
            networkText += '  ' + key + ': ' + entry.requestHeaders[key] + '\n';
          }
          networkText += '--------------------------------------------------------------------------------\n';
        }
        
        if (entry.requestBody) {
          networkText += 'REQUEST BODY:\n';
          try {
            const parsed = JSON.parse(entry.requestBody);
            networkText += safeStringify(parsed, 2) + '\n';
          } catch (e) {
            networkText += entry.requestBody + '\n';
          }
          networkText += '--------------------------------------------------------------------------------\n';
        }
        
        if (entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0) {
          networkText += 'RESPONSE HEADERS:\n';
          for (let key in entry.responseHeaders) {
            networkText += '  ' + key + ': ' + entry.responseHeaders[key] + '\n';
          }
          networkText += '--------------------------------------------------------------------------------\n';
        }
        
        if (entry.responseBody) {
          networkText += 'RESPONSE BODY:\n';
          try {
            const parsed = JSON.parse(entry.responseBody);
            networkText += safeStringify(parsed, 2) + '\n';
          } catch (e) {
            networkText += entry.responseBody + '\n';
          }
        }
        
        if (entry.error) {
          networkText += 'ERROR: ' + entry.error + '\n';
        }
        
        networkText += '================================================================================\n\n';
      });
      
      downloadFile(networkText, 'network-log-' + timestamp + '.txt');
    }
    
    chrome.runtime.sendMessage({ action: "getConsoleLogs" }, function(consoleResponse) {
      if (consoleResponse && consoleResponse.logs && consoleResponse.logs.length > 0) {
        let consoleText = '';
        
        consoleResponse.logs.forEach((entry) => {
          consoleText += '[' + entry.timestamp + '] [' + entry.type + '] ' + entry.message + '\n';
          consoleText += 'URL: ' + entry.url + '\n\n';
        });
        
        setTimeout(() => {
          downloadFile(consoleText, 'console-log-' + timestamp + '.txt');
        }, 100);
      }
      
      if ((allNetworkLogs.length > 0) || 
          (consoleResponse && consoleResponse.logs && consoleResponse.logs.length > 0)) {
        showStatus('Logs downloaded!', false);
      } else {
        showStatus('No logs yet!', true);
      }
    });
  });
});

document.getElementById('clearBtn').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: "clearNetworkLogs" });
  chrome.runtime.sendMessage({ action: "clearConsoleLogs" });
  chrome.storage.local.set({ networkLogs: [] });
  
  showStatus('Logs cleared!', false);
  updateCounts();
});

loadSettings();
updateCounts();
setInterval(updateCounts, 2000);