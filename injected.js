(function() {
  'use strict';
  
  if (window.__loggerInjected) return;
  window.__loggerInjected = true;
  
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };
  
  function safeStringify(obj) {
    try {
      const cache = new Set();
      return JSON.stringify(obj, function(key, value) {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular]';
          }
          cache.add(value);
        }
        return value;
      });
    } catch (e) {
      return String(obj);
    }
  }
  
  function captureLog(type, args) {
    const argArray = [];
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'object' && args[i] !== null) {
        try {
          argArray.push(safeStringify(args[i]));
        } catch (e) {
          argArray.push('[Object]');
        }
      } else {
        argArray.push(String(args[i]));
      }
    }
    
    window.postMessage({
      source: 'logger-extension',
      type: type,
      payload: argArray.join(' '),
      timestamp: new Date().toISOString(),
      url: window.location.href
    }, '*');
  }
  
  // Console override
  console.log = function() {
    originalConsole.log.apply(console, arguments);
    captureLog('LOG', arguments);
  };
  
  console.warn = function() {
    originalConsole.warn.apply(console, arguments);
    captureLog('WARN', arguments);
  };
  
  console.error = function() {
    originalConsole.error.apply(console, arguments);
    captureLog('ERROR', arguments);
  };
  
  console.info = function() {
    originalConsole.info.apply(console, arguments);
    captureLog('INFO', arguments);
  };
  
  // Header'ları object'e çevir
  function parseHeaders(headerString) {
    const headers = {};
    if (!headerString) return headers;
    
    const lines = headerString.split('\r\n');
    lines.forEach(line => {
      const parts = line.split(': ');
      if (parts.length === 2) {
        headers[parts[0]] = parts[1];
      }
    });
    return headers;
  }
  
  // ========== XMLHttpRequest INTERCEPT ==========
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  const originalSetRequestHeader = XHR.setRequestHeader;
  
  XHR.open = function(method, url) {
    this._loggerData = {
      method: method,
      url: url,
      startTime: Date.now(),
      requestHeaders: {}
    };
    return originalOpen.apply(this, arguments);
  };
  
  XHR.setRequestHeader = function(header, value) {
    if (this._loggerData) {
      this._loggerData.requestHeaders[header] = value;
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
  
  XHR.send = function(body) {
    const self = this;
    
    if (this._loggerData) {
      this._loggerData.requestBody = body;
      
      this.addEventListener('readystatechange', function() {
        if (self.readyState === 4) {
          const endTime = Date.now();
          const loggerData = self._loggerData;
          
          const responseHeadersString = self.getAllResponseHeaders();
          const responseHeaders = parseHeaders(responseHeadersString);
          
          let baseUrl = loggerData.url;
          let queryString = {};
          if (loggerData.url.includes('?')) {
            const parts = loggerData.url.split('?');
            baseUrl = parts[0];
            const params = new URLSearchParams(parts[1]);
            params.forEach((value, key) => {
              queryString[key] = value;
            });
          }
          
          window.postMessage({
            source: 'logger-extension-network',
            method: loggerData.method.toUpperCase(),
            url: baseUrl,
            queryString: queryString,
            requestHeaders: loggerData.requestHeaders,
            requestBody: loggerData.requestBody,
            responseHeaders: responseHeaders,
            responseBody: self.responseText,
            status: self.status,
            statusText: self.statusText,
            duration: endTime - loggerData.startTime,
            timestamp: new Date(loggerData.startTime).toISOString()
          }, '*');
        }
      });
      
      this.addEventListener('error', function() {
        const endTime = Date.now();
        const loggerData = self._loggerData;
        
        window.postMessage({
          source: 'logger-extension-network',
          method: loggerData.method.toUpperCase(),
          url: loggerData.url,
          requestHeaders: loggerData.requestHeaders,
          requestBody: loggerData.requestBody,
          responseBody: null,
          error: 'Network Error',
          status: 0,
          statusText: 'Error',
          duration: endTime - loggerData.startTime,
          timestamp: new Date(loggerData.startTime).toISOString()
        }, '*');
      });
    }
    
    return originalSend.apply(this, arguments);
  };
  
  originalConsole.log('[Logger Injected] Console override and Network intercept activated!');
  
})();