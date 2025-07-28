const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const { startStream, getStreamMetadata, deleteStream, getActiveStreams, updateStreamStatus } = require('./stream_manager');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const DEBUG = process.env.DEBUG === 'true';

// Helper function for debug logging
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './public')));

// Serve HLS files
app.use('/hls', express.static(path.join(__dirname, './hls_streams')));

// Start stream endpoint
app.post('/start-stream', async (req, res) => {
    const { rtsp_url, quality, delete_segments } = req.body;
    if (!rtsp_url || !quality || typeof delete_segments === 'undefined') {
        return res.status(400).json({ error: 'rtsp_url, quality, and delete_segments are required' });
    }
    
    try {
        debugLog(`[API] Starting stream: ${rtsp_url}, quality: ${quality}, delete_segments: ${delete_segments}`);
        const streamPath = await startStream(rtsp_url, quality, delete_segments);
        debugLog(`[API] Stream started successfully: ${streamPath}`);
        return res.json({ hls_url: `/hls/${streamPath}/index.m3u8` });
    } catch (err) {
        console.error(`[API] Stream start failed:`, err.message);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/streams', (req, res) => {
    const streams_dir = path.join(__dirname, 'hls_streams');
    let streams = [];
    if (fs.existsSync(streams_dir)) {
        streams = fs.readdirSync(streams_dir)
            .filter(dir => {
                const playlist = path.join(streams_dir, dir, 'index.m3u8');
                return fs.existsSync(playlist);
            })
            .map(id => {
                const meta = getStreamMetadata(id) || {};
                return {
                    id,
                    hls_url: `/hls/${id}/index.m3u8`,
                    quality: meta.quality || 'unknown',
                    type: meta.type || (meta.delete_segments ? 'Rolling' : 'Archive'),
                    metadata: meta
                };
            });
    }
    debugLog(`[API] Found ${streams.length} streams`);
    res.json({ streams });
});

app.get('/streams/:id/info', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Stream id required' });
    
    const metadata = getStreamMetadata(id);
    if (!metadata) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    
    res.json({ metadata });
});

app.post('/streams/:id/status', (req, res) => {
    const { id } = req.params;
    const { status, ...additionalData } = req.body;
    
    if (!id || !status) {
        return res.status(400).json({ error: 'Stream id and status are required' });
    }
    
    const updatedMetadata = updateStreamStatus(id, status, additionalData);
    if (!updatedMetadata) {
        return res.status(404).json({ error: 'Stream not found' });
    }
    
    res.json({ metadata: updatedMetadata });
});

app.get('/active-streams', (req, res) => {
    const activeStreams = getActiveStreams();
    debugLog(`[API] Active streams: ${activeStreams.length}`);
    res.json({ active_streams: activeStreams });
});

app.delete('/streams/:id', (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Stream id required' });
    
    debugLog(`[API] Deleting stream: ${id}`);
    const ok = deleteStream(id);
    if (ok) {
        debugLog(`[API] Stream deleted successfully: ${id}`);
        return res.json({ success: true });
    }
    return res.status(404).json({ error: 'Stream not found' });
});

app.get('/debug/streams', (req, res) => {
    const streams_dir = path.join(__dirname, 'hls_streams');
    const debugInfo = [];
    
    if (fs.existsSync(streams_dir)) {
        const streamDirs = fs.readdirSync(streams_dir);
        streamDirs.forEach(dir => {
            const stream_dir = path.join(streams_dir, dir);
            const playlist = path.join(stream_dir, 'index.m3u8');
            const metadata_path = path.join(stream_dir, 'metadata.json');
            
            const info = {
                stream_id: dir,
                has_playlist: fs.existsSync(playlist),
                has_metadata: fs.existsSync(metadata_path),
                is_process_active: getActiveStreams().includes(dir),
                segment_count: 0,
                metadata: null
            };
            
            // Count segments
            if (fs.existsSync(stream_dir)) {
                const files = fs.readdirSync(stream_dir);
                info.segment_count = files.filter(f => f.endsWith('.ts')).length;
            }
            
            // Get metadata
            if (info.has_metadata) {
                try {
                    info.metadata = JSON.parse(fs.readFileSync(metadata_path, 'utf-8'));
                } catch (e) {
                    info.metadata_error = e.message;
                }
            }
            
            debugInfo.push(info);
        });
    }
    
    res.json({ 
        debug_info: debugInfo,
        active_processes: getActiveStreams(),
        total_streams: debugInfo.length
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (DEBUG) {
        console.log('Debug mode enabled - verbose logging active');
    }
}); 