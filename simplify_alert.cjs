const fs = require('fs');

const path = 'frontend/src/features/alerts/AlertContext.tsx';
let code = fs.readFileSync(path, 'utf8');

const handleMessageStr = `
    const handleMessage = (event: MessageEvent) => {
      if (!mounted) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sync') {
          setAlerts(data.alerts);
        } else if (data.type === 'alert') {
          setAlerts((prev) => {
            const exists = prev.find((a) => a.id === data.alert.id);
            if (exists) return prev;
            return [data.alert, ...prev];
          });
        }
      } catch { /* ignore heartbeat pings */ }
    };
`;

const searchStr = `    const connect = () => {
      if (!mounted) return;
      // A production build must use the public API origin. Falling back to the
      // Hosting origin would make Firebase's SPA rewrite return HTML to EventSource.
      if (!API_BASE && !import.meta.env.DEV) {
        logger.error('Live alerts are unavailable because the public API URL is not configured.');
        return;
      }
      es = new EventSource(\`\${API_BASE}/api/alerts/stream\`);

      es.onmessage = (event) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'sync') {
            setAlerts(data.alerts);
          } else if (data.type === 'alert') {
            setAlerts((prev) => {
              // Ensure uniqueness if we get duplicates via reconnects
              const exists = prev.find((a) => a.id === data.alert.id);
              if (exists) return prev;
              return [data.alert, ...prev];
            });
          }
        } catch { /* ignore heartbeat pings */ }
      };`;

const replaceStr = `    const connect = () => {
      if (!mounted) return;
      // A production build must use the public API origin. Falling back to the
      // Hosting origin would make Firebase's SPA rewrite return HTML to EventSource.
      if (!API_BASE && !import.meta.env.DEV) {
        logger.error('Live alerts are unavailable because the public API URL is not configured.');
        return;
      }
      es = new EventSource(\`\${API_BASE}/api/alerts/stream\`);

      es.onmessage = handleMessage;`;

code = code.replace(searchStr, replaceStr);
code = code.replace('const connect = () => {', handleMessageStr + '\n    const connect = () => {');

fs.writeFileSync(path, code);
