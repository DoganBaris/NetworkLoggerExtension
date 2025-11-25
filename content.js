(function() {
  'use strict';
  
  if (window.__loggerContentInstalled) return;
  window.__loggerContentInstalled = true;
  
  console.log('[Logger Content] Script yükleniyor...');
  
  let consoleTargetUrl = '';
  let apiTargetUrl = '';
  let isLoggingActive = false;
  
  // Ayarları yükle
  function loadSettings() {
    chrome.storage.local.get(['consoleTargetUrl', 'apiTargetUrl', 'isLoggingActive'], function(result) {
      consoleTargetUrl = result.consoleTargetUrl || '';
      apiTargetUrl = result.apiTargetUrl || '';
      isLoggingActive = result.isLoggingActive || false;
      
      console.log('[Logger Content] Ayarlar:', {
        consoleUrl: consoleTargetUrl,
        apiUrl: apiTargetUrl,
        active: isLoggingActive,
        page: window.location.href
      });
      
      // Eğer ayarlar uygunsa, injected script'i yükle
      if (isLoggingActive && shouldInject()) {
        injectScript();
      }
    });
  }
  
  // Storage değişikliklerini dinle
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.consoleTargetUrl) {
      consoleTargetUrl = changes.consoleTargetUrl.newValue || '';
    }
    if (changes.apiTargetUrl) {
      apiTargetUrl = changes.apiTargetUrl.newValue || '';
    }
    if (changes.isLoggingActive) {
      const wasActive = isLoggingActive;
      isLoggingActive = changes.isLoggingActive.newValue || false;
      
      // Logging açıldıysa ve henüz inject edilmediyse, inject et
      if (!wasActive && isLoggingActive && shouldInject()) {
        injectScript();
      }
    }
  });
  
  // URL kontrolü
  function shouldInject() {
    if (!consoleTargetUrl || consoleTargetUrl.trim() === '') return false;
    
    const currentUrl = window.location.href;
    const targetUrl = consoleTargetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    return currentUrl.includes(targetUrl);
  }
  
  // API URL kontrolü
  function isApiUrl(url) {
    if (!apiTargetUrl || apiTargetUrl.trim() === '') return false;
    const targetUrl = apiTargetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return url.includes(targetUrl);
  }
  
  // Sayfa kontekstine script inject et
  function injectScript() {
    if (window.__loggerScriptInjected) {
      console.log('[Logger Content] Script zaten inject edilmiş');
      return;
    }
    window.__loggerScriptInjected = true;
    
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() {
        console.log('[Logger Content] Injected script yüklendi!');
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('[Logger Content] Injection hatası:', e);
    }
  }
  
  // PostMessage dinle
  window.addEventListener('message', function(event) {
    // Sadece aynı window'dan gelen mesajları kabul et
    if (event.source !== window) return;
    if (!event.data) return;
    
    // Console log mesajları
    if (event.data.source === 'logger-extension') {
      // Sadece logging aktifse ve URL uygunsa kaydet
      if (!isLoggingActive || !shouldInject()) return;
      
      const logEntry = {
        timestamp: event.data.timestamp,
        type: event.data.type,
        message: event.data.payload,
        url: event.data.url
      };
      
      // Storage'a kaydet
      chrome.storage.local.get(['consoleLogs'], function(result) {
        const logs = result.consoleLogs || [];
        logs.push(logEntry);
        chrome.storage.local.set({ consoleLogs: logs });
        console.log('[Logger Content] Console log kaydedildi! Toplam:', logs.length);
      });
    }
    
    // Network log mesajları
    else if (event.data.source === 'logger-extension-network') {
      if (!isLoggingActive) return;
      if (!isApiUrl(event.data.url)) return; // Sadece API URL'lerini kaydet
      
      const networkEntry = {
        timestamp: event.data.timestamp,
        method: event.data.method,
        url: event.data.url,
        requestBody: event.data.requestBody,
        responseBody: event.data.responseBody,
        status: event.data.status,
        statusText: event.data.statusText,
        duration: event.data.duration,
        error: event.data.error
      };
      
      chrome.storage.local.get(['networkLogs'], function(result) {
        const logs = result.networkLogs || [];
        logs.push(networkEntry);
        chrome.storage.local.set({ networkLogs: logs });
        console.log('[Logger Content] Network log kaydedildi! Toplam:', logs.length);
      });
    }
  });
  
  // Ayarları yükle ve başlat
  loadSettings();
  
  console.log('[Logger Content] Hazır!');
  
})();