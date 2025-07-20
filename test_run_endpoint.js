#!/usr/bin/env node

// Test script for the new /run endpoint
// This demonstrates how to send Linux commands to the new container

const testCommands = [
    {
        name: "System Information",
        command: "uname -a"
    },
    {
        name: "List Files",
        command: "ls -la /tmp"
    },
    {
        name: "Current Date",
        command: "date"
    },
    {
        name: "Disk Usage",
        command: "df -h"
    },
    {
        name: "Memory Info",
        command: "free -h"
    },
    {
        name: "Network Interfaces",
        command: "ip addr show"
    },
    {
        name: "Process List",
        command: "ps aux"
    },
    {
        name: "Python Version",
        command: "python3 --version"
    },
    {
        name: "Node.js Version",
        command: "node --version"
    },
    {
        name: "Create and List Test File",
        command: "echo 'Hello from Linux container!' > /tmp/test.txt && cat /tmp/test.txt"
    }
];

async function testRunEndpoint(baseUrl = 'http://localhost:8787') {
    console.log('🧪 Testing /run endpoint...\n');
    
    for (const test of testCommands) {
        console.log(`📋 ${test.name}`);
        console.log(`💻 Command: ${test.command}`);
        
        try {
            const response = await fetch(`${baseUrl}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command: test.command
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Success');
                if (result.output) {
                    console.log(`📤 Output:\n${result.output}`);
                }
                if (result.error) {
                    console.log(`⚠️  Stderr:\n${result.error}`);
                }
                console.log(`🔢 Exit Code: ${result.exit_code}`);
            } else {
                console.log('❌ Failed');
                console.log(`💥 Error: ${result.error}`);
            }
            
        } catch (error) {
            console.log('❌ Request Failed');
            console.log(`💥 Error: ${error.message}`);
        }
        
        console.log('─'.repeat(50));
    }
}

// Health check function
async function healthCheck(baseUrl = 'http://localhost:8787') {
    console.log('🏥 Health Check...\n');
    
    try {
        const response = await fetch(`${baseUrl}/run`, {
            method: 'GET'
        });
        
        const result = await response.json();
        console.log('✅ Linux Command Container is healthy');
        console.log(`📊 Status: ${result.status}`);
        console.log(`🕐 Timestamp: ${new Date(result.timestamp * 1000).toISOString()}`);
        console.log('─'.repeat(50));
        return true;
    } catch (error) {
        console.log('❌ Health check failed');
        console.log(`💥 Error: ${error.message}`);
        console.log('─'.repeat(50));
        return false;
    }
}

// Main execution
async function main() {
    const baseUrl = process.argv[2] || 'http://localhost:8787';
    
    console.log(`🚀 Testing Linux Command Container at: ${baseUrl}\n`);
    
    // First do a health check
    const isHealthy = await healthCheck(baseUrl);
    
    if (isHealthy) {
        // Run the command tests
        await testRunEndpoint(baseUrl);
    } else {
        console.log('⚠️  Skipping command tests due to failed health check');
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testRunEndpoint, healthCheck };
