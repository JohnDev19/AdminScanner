document.addEventListener('DOMContentLoaded', function() {
    const terminal = document.getElementById('output');
    const input = document.getElementById('command-input');
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    let currentScan = null;
    let commandHistory = [];
    let historyIndex = -1;
    let scanResults = [];

    const config = {
        scanDelay: 100,
        maxRetries: 3,
        timeout: 5000,
        userAgent: 'AdminScanner/2.0',
        verbose: false,
        maxDepth: 3,
        threads: 5,
        saveResults: true
    };

    const ASCII_ART = `
░█████╗░░██████╗
██╔══██╗██╔════╝
███████║╚█████╗░
██╔══██║░╚═══██╗
██║░░██║██████╔╝
╚═╝░░╚═╝╚═════╝░
`;

    const INTRO_TEXT = [
        "AdminScan v2.0.0",
        "Author: JohnDev19",
        "GitHub: https://github.com/JohnDev19",
        "Description: A powerful admin panel finder with real-time scanning capabilities",
        "Type 'help' to see available commands",
        "============================================================"
    ];

    const commands = {
        'help': () => {
            return `<div class="help-command">Available commands:</div>
<div class="command-list">
    <div class="command-item"><span class="command">scan &lt;url&gt;</span> - Start scanning for admin panels</div>
    <div class="command-item"><span class="command">stop</span> - Stop the current scan</div>
    <div class="command-item"><span class="command">clear</span> - Clear the terminal</div>
    <div class="command-item"><span class="command">history</span> - Show command history</div>
    <div class="command-item"><span class="command">about</span> - Show tool information</div>
    <div class="command-item"><span class="command">config</span> - Show current configuration</div>
    <div class="command-item"><span class="command">set &lt;option&gt; &lt;value&gt;</span> - Set configuration option</div>
    <div class="command-item"><span class="command">export</span> - Export scan results to file</div>
    <div class="command-item"><span class="command">verbose</span> - Toggle verbose mode</div>
    <div class="command-item"><span class="command">reset</span> - Reset configuration to defaults</div>
    <div class="command-item"><span class="command">help</span> - Show this help message</div>
</div>`;
        },
        'clear': () => {
            terminal.innerHTML = '';
            return '';
        },
        'history': () => {
            if (commandHistory.length === 0) return 'No command history available.';
            return commandHistory.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n');
        },
        'stop': () => {
            if (currentScan) {
                currentScan.abort();
                return 'Scan stopped.';
            }
            return 'No active scan to stop.';
        },
        'about': () => {
            return `AdminScanner is a web-based administrative panel finder. It helps security researchers and penetration testers locate administrative interfaces on web applications through an interactive terminal-like interface.`;
        },
        'config': () => {
            return `<div class="config-display">Current Configuration:
${Object.entries(config).map(([key, value]) => 
    `<div class="config-item"><span class="config-key">${key}</span>: <span class="config-value">${value}</span></div>`
).join('')}</div>`;
        },
        'set': (args) => {
            if (args.length !== 2) return 'Usage: set <option> <value>';
            const [option, value] = args;
            if (!(option in config)) return 'Invalid configuration option';

            if (typeof config[option] === 'boolean') {
                config[option] = value.toLowerCase() === 'true';
            } else if (typeof config[option] === 'number') {
                config[option] = Number(value);
            } else {
                config[option] = value;
            }

            return `Set ${option} to ${config[option]}`;
        },
        'export': () => {
            if (scanResults.length === 0) return 'No results to export';
            const data = JSON.stringify(scanResults, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scan-results-${new Date().toISOString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return 'Results exported successfully';
        },
        'verbose': () => {
            config.verbose = !config.verbose;
            return `Verbose mode ${config.verbose ? 'enabled' : 'disabled'}`;
        },
        'reset': () => {
            Object.assign(config, {
                scanDelay: 100,
                maxRetries: 3,
                timeout: 5000,
                userAgent: 'AdminScanner/2.0',
                verbose: false,
                maxDepth: 3,
                threads: 5,
                saveResults: true
            });
            return 'Configuration reset to defaults';
        }
    };

    async function typeWriter(text, delay = 50) {
        const output = document.createElement('div');
        output.className = 'intro-text';
        terminal.appendChild(output);

        for (let i = 0; i < text.length; i++) {
            output.textContent += text[i];
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return output;
    }

    async function showIntro() {
        const asciiArt = document.createElement('pre');
        asciiArt.className = 'ascii-art';
        asciiArt.textContent = ASCII_ART;
        terminal.appendChild(asciiArt);

        for (const line of INTRO_TEXT) {
            await typeWriter(line);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    function addOutput(text, className = '') {
        const output = document.createElement('div');
        output.className = className;
        output.innerHTML = text;
        terminal.appendChild(output);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function updateProgressBar(progress) {
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;
        progressBar.style.backgroundColor = `hsl(${progress}, 70%, 50%)`;
    }

    async function scanUrl(url) {
        scanResults = [];
        addOutput(`Starting scan for ${url}...`, 'info-message');
        if (config.verbose) {
            addOutput(`Configuration: ${JSON.stringify(config, null, 2)}`, 'debug-message');
        }
        terminal.appendChild(progressBar);
        updateProgressBar(0);

        const controller = new AbortController();
        currentScan = controller;

        try {
            const response = await fetch('/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': config.userAgent
                },
                body: JSON.stringify({ 
                    url: url,
                    config: config
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = decoder.decode(value).split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        const data = JSON.parse(line);
                        if (data.type === 'log') {
                            const className = data.result === 'OK' ? 'success-message' : 'error-message';
                            addOutput(data.message.trim(), className);
                            if (data.progress) {
                                updateProgressBar(data.progress);
                            }
                        } else if (data.type === 'complete') {
                            addOutput(`Scan completed. Found ${data.found_panels.length} admin panels.`, 'success-message');
                            data.found_panels.forEach(panel => {
                                addOutput(`Found: ${panel.url}`, 'success-message');
                                scanResults.push(panel);
                            });
                        } else {
                            addOutput(data.message.trim());
                        }
                    }
                }
            }

        } catch (error) {
            handleError(error);
        } finally {
            currentScan = null;
            progressBar.remove();
        }
    }

    function handleError(error) {
        if (error.name === 'AbortError') {
            addOutput('Scan was stopped.', 'warning-message');
        } else {
            addOutput(`Error occurred during scan: ${error.message}`, 'error-message');
            if (config.verbose) {
                addOutput(`Stack trace: ${error.stack}`, 'debug-message');
            }
        }
    }

    input.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                input.value = commandHistory[commandHistory.length - 1 - historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.value = commandHistory[commandHistory.length - 1 - historyIndex];
            } else if (historyIndex === 0) {
                historyIndex = -1;
                input.value = '';
            }
        }
    });

    input.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter') {
            const commandLine = input.value.trim();
            input.value = '';
            historyIndex = -1;

            if (!commandLine) return;

            addOutput(`$ ${commandLine}`, 'command-input');
            commandHistory.push(commandLine);

            const [cmd, ...args] = commandLine.split(' ');

            try {
                if (cmd === 'scan') {
                    const url = args.join(' ').trim();
                    if (url) {
                        await scanUrl(url);
                    } else {
                        addOutput('Please provide a URL to scan.', 'error-message');
                    }
                } else if (commands[cmd]) {
                    addOutput(commands[cmd](args));
                } else {
                    addOutput('Unknown command. Type "help" for available commands.', 'error-message');
                }
            } catch (error) {
                handleError(error);
            }
        }
    });

    showIntro();
});
