const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HLS_DIR = path.join(__dirname, 'hls_streams');
const DEBUG = process.env.DEBUG === 'true';

// Helper function for debug logging
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

const QUALITY_PRESETS = {
    '1080p': { v: '1920x1080', b: '5000k' },
    '720p': { v: '1280x720', b: '2500k' },
    '480p': { v: '854x480', b: '1000k' },
};

// Track active processes
const activeProcesses = new Map();

// Periodic metadata updater
let metadataUpdateInterval = null;

function startMetadataUpdater() {
    if (metadataUpdateInterval) {
        clearInterval(metadataUpdateInterval);
    }
    
    metadataUpdateInterval = setInterval(() => {
        const streams_dir = path.join(__dirname, 'hls_streams');
        if (fs.existsSync(streams_dir)) {
            const streamDirs = fs.readdirSync(streams_dir);
            streamDirs.forEach(dir => {
                const metadata_path = path.join(streams_dir, dir, 'metadata.json');
                if (fs.existsSync(metadata_path)) {
                    try {
                        getStreamMetadata(dir); // This will update the metadata
                    } catch (e) {
                        debugLog(`[Metadata Update] Error updating ${dir}:`, e.message);
                    }
                }
            });
        }
    }, 3000); // Update every 3 seconds
}

function stopMetadataUpdater() {
    if (metadataUpdateInterval) {
        clearInterval(metadataUpdateInterval);
        metadataUpdateInterval = null;
    }
}

function getStreamId(rtsp_url, quality, delete_segments) {
    const uniqueString = `${rtsp_url}_${quality}_${delete_segments}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function killProcess(stream_id) {
    const process = activeProcesses.get(stream_id);
    if (process && !process.killed) {
        try {
            process.kill('SIGTERM');
        } catch (e) {
            debugLog(`[Stream ${stream_id}] Process already killed`);
        }
        activeProcesses.delete(stream_id);
    }
}

async function startStream(rtsp_url, quality, delete_segments) {
    if (!QUALITY_PRESETS[quality]) {
        throw new Error('Unsupported quality');
    }

    const stream_id = getStreamId(rtsp_url, quality, delete_segments);
    const stream_dir = path.join(HLS_DIR, stream_id);
    const playlist = path.join(stream_dir, 'index.m3u8');
    const metadata_path = path.join(stream_dir, 'metadata.json');

    debugLog(`[Stream ${stream_id}] Starting stream...`);

    // Kill existing process if any
    killProcess(stream_id);

    // Create directory
    ensureDir(stream_dir);

    // Clean existing files
    if (fs.existsSync(stream_dir)) {
        const files = fs.readdirSync(stream_dir);
        files.forEach(file => {
            if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                fs.unlinkSync(path.join(stream_dir, file));
            }
        });
    }

    const { v, b } = QUALITY_PRESETS[quality];

    // Build FFmpeg arguments - simplified and tested
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', rtsp_url,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', b,
        '-maxrate', b,
        '-bufsize', b,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-ar', '44100',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', delete_segments ? '6' : '0',
        '-hls_flags', delete_segments ? 'delete_segments' : 'independent_segments',
        '-hls_segment_filename', path.join(stream_dir, 'segment_%03d.ts'),
        playlist
    ];

    debugLog(`[Stream ${stream_id}] FFmpeg args:`, ffmpegArgs.join(' '));

    return new Promise((resolve, reject) => {
        // Spawn FFmpeg process
        const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });

        // Store process
        activeProcesses.set(stream_id, ffmpeg);

        let hasError = false;
        let errorOutput = '';

        // Handle stdout
        ffmpeg.stdout.on('data', (data) => {
            debugLog(`[FFmpeg ${stream_id} stdout]: ${data.toString()}`);
        });

        // Handle stderr
        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            debugLog(`[FFmpeg ${stream_id} stderr]: ${output}`);
            
            // Check for specific connection errors
            if (output.includes('Connection refused') || 
                output.includes('No route to host') ||
                output.includes('Connection timed out') ||
                output.includes('Operation timed out')) {
                hasError = true;
                errorOutput = 'RTSP connection failed - check if the server is reachable and the URL is correct';
            } else if (output.includes('401 Unauthorized')) {
                hasError = true;
                errorOutput = 'Authentication failed - check username and password';
            } else if (output.includes('404 Not Found')) {
                hasError = true;
                errorOutput = 'Stream not found - check the stream path in the RTSP URL';
            } else if (output.includes('Invalid data found')) {
                hasError = true;
                errorOutput = 'Invalid RTSP stream format';
            }
        });

        // Handle process errors
        ffmpeg.on('error', (err) => {
            console.error(`[FFmpeg ${stream_id} Error]: ${err.message}`);
            hasError = true;
            errorOutput = err.message;
            killProcess(stream_id);
            reject(new Error(`FFmpeg error: ${err.message}`));
        });

        // Handle process exit
        ffmpeg.on('exit', (code, signal) => {
            debugLog(`[FFmpeg ${stream_id} Exit]: Code ${code}, Signal ${signal}`);
            
            if (code !== 0 && code !== null) {
                hasError = true;
                errorOutput = `FFmpeg exited with code ${code}`;
                killProcess(stream_id);
                reject(new Error(`FFmpeg exited with code ${code}`));
            } else {
                killProcess(stream_id);
            }
        });

        // Write metadata
        const metadata = {
            stream_id,
            rtsp_url,
            quality,
            delete_segments,
            type: delete_segments ? 'Rolling' : 'Archive',
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            status: 'starting',
            ffmpeg_pid: ffmpeg.pid,
            hls_settings: {
                segment_time: 2,
                list_size: delete_segments ? 6 : 0,
                flags: delete_segments ? 'delete_segments' : 'independent_segments'
            },
            quality_preset: {
                resolution: v,
                bitrate: b,
                audio_bitrate: '128k',
                audio_channels: 2,
                audio_sample_rate: '44100'
            },
            file_paths: {
                stream_dir,
                playlist: playlist,
                segment_pattern: path.join(stream_dir, 'segment_%03d.ts')
            }
        };
        fs.writeFileSync(metadata_path, JSON.stringify(metadata, null, 2));

        // Update metadata when playlist is created
        const updateMetadata = () => {
            if (fs.existsSync(playlist)) {
                const stats = fs.statSync(playlist);
                const segments = fs.readdirSync(stream_dir).filter(f => f.endsWith('.ts'));
                const updatedMetadata = {
                    ...metadata,
                    status: 'active',
                    playlist_created_at: new Date().toISOString(),
                    playlist_size: stats.size,
                    segment_count: segments.length,
                    last_updated: new Date().toISOString()
                };
                fs.writeFileSync(metadata_path, JSON.stringify(updatedMetadata, null, 2));
            }
        };

        // Wait for playlist to be created
        const checkPlaylist = () => {
            if (fs.existsSync(playlist)) {
                updateMetadata();
                debugLog(`[Stream ${stream_id}] Playlist created successfully`);
                resolve(stream_id);
            } else if (hasError) {
                // Update metadata with error status
                const errorMetadata = {
                    ...metadata,
                    status: 'error',
                    error_message: errorOutput,
                    error_at: new Date().toISOString()
                };
                fs.writeFileSync(metadata_path, JSON.stringify(errorMetadata, null, 2));
                reject(new Error(errorOutput));
            } else {
                setTimeout(checkPlaylist, 500);
            }
        };

        // Start checking for playlist after 1 second
        setTimeout(checkPlaylist, 1000);
    });
}

function getStreamMetadata(stream_id) {
    const metadata_path = path.join(HLS_DIR, stream_id, 'metadata.json');
    if (fs.existsSync(metadata_path)) {
        const metadata = JSON.parse(fs.readFileSync(metadata_path, 'utf-8'));
        
        // Check if stream is actually active
        const playlist = path.join(HLS_DIR, stream_id, 'index.m3u8');
        const stream_dir = path.join(HLS_DIR, stream_id);
        const isProcessActive = activeProcesses.has(stream_id);
        const hasPlaylist = fs.existsSync(playlist);
        
        // Count current segments
        let currentSegmentCount = 0;
        if (fs.existsSync(stream_dir)) {
            const files = fs.readdirSync(stream_dir);
            currentSegmentCount = files.filter(f => f.endsWith('.ts')).length;
        }
        
        // Update status based on current state
        let currentStatus = metadata.status;
        if (metadata.status === 'starting' && hasPlaylist && currentSegmentCount > 0) {
            currentStatus = 'active';
        } else if (metadata.status === 'starting' && !isProcessActive && !hasPlaylist) {
            currentStatus = 'error';
        } else if (metadata.status === 'active' && !isProcessActive) {
            currentStatus = 'stopped';
        } else if (metadata.status === 'active' && hasPlaylist && currentSegmentCount === 0) {
            currentStatus = 'starting';
        }
        
        // Update metadata if status changed or segment count changed
        if (currentStatus !== metadata.status || currentSegmentCount !== (metadata.segment_count || 0)) {
            const updatedMetadata = {
                ...metadata,
                status: currentStatus,
                segment_count: currentSegmentCount,
                last_updated: new Date().toISOString()
            };
            
            // Add playlist size if playlist exists
            if (hasPlaylist) {
                try {
                    const stats = fs.statSync(playlist);
                    updatedMetadata.playlist_size = stats.size;
                    if (!updatedMetadata.playlist_created_at) {
                        updatedMetadata.playlist_created_at = new Date().toISOString();
                    }
                } catch (e) {
                    // Ignore stat errors
                }
            }
            
            fs.writeFileSync(metadata_path, JSON.stringify(updatedMetadata, null, 2));
            return updatedMetadata;
        }
        
        return metadata;
    }
    return null;
}

function updateStreamStatus(stream_id, status, additionalData = {}) {
    const metadata_path = path.join(HLS_DIR, stream_id, 'metadata.json');
    if (fs.existsSync(metadata_path)) {
        const metadata = JSON.parse(fs.readFileSync(metadata_path, 'utf-8'));
        const updatedMetadata = {
            ...metadata,
            status,
            last_updated: new Date().toISOString(),
            ...additionalData
        };
        fs.writeFileSync(metadata_path, JSON.stringify(updatedMetadata, null, 2));
        return updatedMetadata;
    }
    return null;
}

function deleteStream(stream_id) {
    killProcess(stream_id);
    
    const stream_dir = path.join(HLS_DIR, stream_id);
    if (fs.existsSync(stream_dir)) {
        try {
            fs.rmSync(stream_dir, { recursive: true, force: true });
            return true;
        } catch (e) {
            console.error(`[Stream ${stream_id}] Error deleting directory:`, e.message);
            return false;
        }
    }
    return false;
}

function getActiveStreams() {
    return Array.from(activeProcesses.keys());
}

module.exports = { 
    startStream, 
    getStreamMetadata, 
    deleteStream, 
    getActiveStreams,
    updateStreamStatus,
    startMetadataUpdater,
    stopMetadataUpdater
};

// Start the metadata updater
startMetadataUpdater(); 