const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(cors());
app.use(express.json());

// Security check for dangerous commands
function isDangerousCommand(command) {
    const dangerousPatterns = [
        'rm -rf /',
        'mkfs',
        'dd if=',
        'format',
        'fdisk',
        'shutdown',
        'reboot',
        'halt',
        'init 0',
        'init 6',
        'kill -9 1',
        'killall -9',
        ':(){ :|:& };:', // fork bomb
        'chmod 777 /',
        'chown root /',
    ];
    
    const commandLower = command.toLowerCase();
    return dangerousPatterns.some(pattern => commandLower.includes(pattern));
}

// Execute Linux command with timeout
function executeCommand(command) {
    return new Promise((resolve) => {
        const timeout = 30000; // 30 seconds timeout
        
        exec(command, { 
            timeout,
            cwd: '/tmp' // Execute in /tmp for safety
        }, (error, stdout, stderr) => {
            if (error) {
                if (error.killed && error.signal === 'SIGTERM') {
                    resolve({
                        output: '',
                        error: 'Command timed out after 30 seconds',
                        exit_code: -1
                    });
                } else {
                    resolve({
                        output: stdout || '',
                        error: stderr || error.message,
                        exit_code: error.code || -1
                    });
                }
            } else {
                resolve({
                    output: stdout || '',
                    error: stderr || '',
                    exit_code: 0
                });
            }
        });
    });
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Linux Command Executor',
        timestamp: Date.now() / 1000
    });
});

// Main command execution endpoint
app.post('/run', async (req, res) => {
    try {
        const { command } = req.body;
        
        // Validate command
        if (!command || typeof command !== 'string' || command.trim() === '') {
            return res.json({
                success: false,
                error: 'No command provided',
                timestamp: Date.now() / 1000
            });
        }
        
        const trimmedCommand = command.trim();
        
        // Security check
        if (isDangerousCommand(trimmedCommand)) {
            return res.json({
                success: false,
                error: 'Command not allowed for security reasons',
                timestamp: Date.now() / 1000
            });
        }
        
        // Execute command
        const result = await executeCommand(trimmedCommand);
        
        // Send response
        res.json({
            success: true,
            command: trimmedCommand,
            output: result.output,
            error: result.error,
            exit_code: result.exit_code,
            timestamp: Date.now() / 1000
        });
        
    } catch (error) {
        console.error('Server error:', error);
        res.json({
            success: false,
            error: `Server error: ${error.message}`,
            timestamp: Date.now() / 1000
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: Date.now() / 1000
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Linux Command Server starting on port ${PORT}`);
    console.log('Ready to execute Linux commands via POST /run');
    console.log(`Health check available at GET /`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});
