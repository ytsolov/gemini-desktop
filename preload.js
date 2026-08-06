const { ipcRenderer } = require('electron');

// Default fallback hosts if IPC fetch fails (must match main process allowedHosts)
const DEFAULT_ALLOWED_NAVIGATION = {
    hosts: ['gemini.google.com', 'accounts.google.com'],
    enterpriseSuffixes: [
        '.okta.com', '.okta-emea.com', '.oktapreview.com',
        '.microsoftonline.com', '.b2clogin.com',
        '.pingone.com', '.onelogin.com', '.auth0.com', '.jumpcloud.com',
    ],
    mfaSuffixes: ['.duosecurity.com', '.securid.com'],
    ssoHosts: ['www.google.com'],
    downloadSuffixes: ['.usercontent.google.com'],
    viewerSuffixes: ['.googleusercontent.com'],
};

function makeIsAllowedHost(allow) {
    const hostSet = new Set([
        ...((allow && allow.hosts) || []),
        ...((allow && allow.ssoHosts) || []),
    ]);
    const suffixList = [
        ...((allow && allow.enterpriseSuffixes) || []),
        ...((allow && allow.mfaSuffixes) || []),
        ...((allow && allow.downloadSuffixes) || []),
        ...((allow && allow.viewerSuffixes) || []),
    ];
    return (hostname) => {
        if (!hostname) return false;
        if (hostSet.has(hostname)) return true;
        return suffixList.some((suffix) => hostname.endsWith(suffix));
    };
}

// Network status detection
function updateNetworkStatus() {
    ipcRenderer.send('network-status', navigator.onLine);
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// Listen for DOMContentLoaded event
window.addEventListener('DOMContentLoaded', async () => {
    // Wire up retry button on offline page
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            ipcRenderer.send('retry-connection');
        });
    } else {
        // Only send initial network status if NOT on offline page
        // to avoid triggering reload loops
        updateNetworkStatus();
    }

    // Fetch allow-list from main process (centralized source of truth)
    let isAllowedHost;
    try {
        const allow = await ipcRenderer.invoke('get-allowed-hosts');
        isAllowedHost = makeIsAllowedHost(allow);
    } catch (e) {
        console.error('Failed to fetch allowed hosts from main process:', e);
        // Fallback to defaults if IPC fails
        isAllowedHost = makeIsAllowedHost(DEFAULT_ALLOWED_NAVIGATION);
    }

    // Listen for click events and open non-allowed links externally
    document.addEventListener('click', (event) => {
        // Guard against non-Element targets (e.g., text nodes)
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const link = target.closest('a');
        if (link && link.href && link.href.startsWith('http')) {
            try {
                // Use hostname (not host) to exclude port from comparison
                const hostname = new URL(link.href).hostname;
                if (isAllowedHost(hostname)) {
                    return; // Allow app + auth links to navigate in-app
                }
            } catch (e) {
                // If URL parsing fails, open externally as a safety measure
            }
            event.preventDefault();
            ipcRenderer.send('open-external-link', link.href);
        }
    });
});

// Handle keyboard shortcuts for zoom
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey) {
        if (event.key === '+') {
            ipcRenderer.send('zoom-in');
        } else if (event.key === '-') {
            ipcRenderer.send('zoom-out');
        } else if (event.key === '0') {
            ipcRenderer.send('zoom-reset');
        }
    }
});

// Handle mouse wheel zoom
document.addEventListener('wheel', (event) => {
    if (event.ctrlKey) {
        event.preventDefault(); // Prevent default scrolling
        if (event.deltaY < 0) {
            ipcRenderer.send('zoom-in');
        } else {
            ipcRenderer.send('zoom-out');
        }
    }
});
