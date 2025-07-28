# 🎥 RTSP Stream Browser

A modern, real-time RTSP to HLS streaming application that allows you to stream RTSP cameras and IP cameras directly in your web browser. Built with Node.js, Express, and FFmpeg for high-performance video transcoding.

![RTSP Stream Browser](https://img.shields.io/badge/RTSP-Stream%20Browser-blue?style=for-the-badge&logo=video)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![FFmpeg](https://img.shields.io/badge/FFmpeg-4.4+-orange?style=for-the-badge&logo=ffmpeg)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

## ✨ Features

- **🎯 Real-time RTSP Streaming**: Stream any RTSP camera to web browser
- **📱 HLS Compatibility**: Works on all modern browsers and mobile devices
- **🎨 Modern UI**: Beautiful, responsive design with real-time status updates
- **⚙️ Quality Control**: Multiple quality presets (1080p, 720p, 480p)
- **🔄 Stream Management**: Rolling window or archive mode for storage control
- **📊 Live Monitoring**: Real-time stream status, segment counts, and metadata
- **🔧 Debug Tools**: Built-in debugging and monitoring capabilities
- **📱 Responsive Design**: Works on desktop, tablet, and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- FFmpeg (automatically installed via ffmpeg-static)
- RTSP camera or IP camera

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sthnaqvi/rtsp-stream-browser.git
   cd rtsp-stream-browser
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   ```
   http://localhost:8000
   ```

### Development Mode

For debugging and development:
```bash
npm run debug
```

## 📖 Usage

### Starting a Stream

1. **Enter RTSP URL**: Use the format `rtsp://username:password@ip:port/stream`
2. **Select Quality**: Choose from 1080p, 720p, or 480p
3. **Choose Mode**: 
   - **Rolling Window**: Keeps only latest 6 segments (saves space)
   - **Archive**: Keeps all segments (full recording)
4. **Click "Start Stream"**: The stream will begin transcoding

### Example RTSP URLs

```bash
# Public demo stream
rtsp://demo:demo@ipv4.camera.stream:554/stream1

# IP Camera (generic)
rtsp://admin:password@192.168.1.100:554/stream1

# Hikvision Camera
rtsp://admin:password@192.168.1.100:554/h264/ch1/main/av_stream

# Dahua Camera
rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0
```

### Stream Management

- **Play**: Click the play button to view the stream
- **Info**: Click info to see detailed stream metadata
- **Delete**: Remove streams to free up storage
- **Refresh**: Use the refresh button to update stream list

## 🔧 API Documentation

### Endpoints

#### Start Stream
```http
POST /start-stream
Content-Type: application/json

{
  "rtsp_url": "rtsp://demo:demo@ipv4.camera.stream:554/stream1",
  "quality": "720p",
  "delete_segments": true
}
```

#### List Streams
```http
GET /streams
```

#### Get Stream Info
```http
GET /streams/:id/info
```

#### Delete Stream
```http
DELETE /streams/:id
```

#### Active Streams
```http
GET /active-streams
```

#### Debug Information
```http
GET /debug/streams
```

### Response Examples

#### Stream List
```json
{
  "streams": [
    {
      "id": "abc123def456",
      "hls_url": "/hls/abc123def456/index.m3u8",
      "quality": "720p",
      "type": "Rolling",
      "metadata": {
        "status": "active",
        "segment_count": 15,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    }
  ]
}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RTSP Camera   │───▶│   FFmpeg        │───▶│   HLS Stream    │
│                 │    │   Transcoding   │    │   (Browser)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Node.js       │
                       │   Express API   │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Frontend      │
                       │   (React/Vanilla)│
                       └─────────────────┘
```

## 📁 Project Structure

```
rtsp-stream-browser/
├── index.js                 # Main server file
├── stream_manager.js        # FFmpeg stream management
├── package.json            # Dependencies and scripts
├── README.md              # This file
├── public/                # Frontend files
│   ├── index.html         # Main HTML page
│   ├── app.js            # Frontend JavaScript
│   └── style.css         # Styling
└── hls_streams/          # Generated HLS files
    └── [stream-id]/
        ├── index.m3u8    # HLS playlist
        ├── segment_001.ts # Video segments
        └── metadata.json # Stream metadata
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server port (default: 8000)
PORT=8000

# Debug mode (default: false)
DEBUG=true

# HLS segment time in seconds (default: 2)
HLS_SEGMENT_TIME=2

# Rolling window size (default: 6)
HLS_LIST_SIZE=6
```

### Quality Presets

| Quality | Resolution | Bitrate | Use Case |
|---------|------------|---------|----------|
| 1080p   | 1920x1080  | 5000k   | High quality, good bandwidth |
| 720p    | 1280x720   | 2500k   | Balanced quality/size |
| 480p    | 854x480    | 1000k   | Low bandwidth, mobile |

## 🔍 Troubleshooting

### Common Issues

#### Stream Won't Start
- Check RTSP URL format and credentials
- Verify camera is accessible from server
- Check firewall settings
- Use debug mode: `npm run debug`

#### Poor Video Quality
- Try higher quality preset
- Check network bandwidth
- Verify camera supports requested resolution

#### Browser Compatibility
- Ensure browser supports HLS (Chrome, Firefox, Safari, Edge)
- Check if HLS.js is loading properly
- Try different browser

### Debug Mode

Enable debug mode to see detailed logs:
```bash
DEBUG=true npm start
```

Visit `/debug/streams` for detailed stream information.

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Setup

```bash
# Install dependencies
npm install

# Start in debug mode
npm run debug

# Run tests (if available)
npm test
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FFmpeg](https://ffmpeg.org/) - Video transcoding
- [HLS.js](https://github.com/video-dev/hls.js/) - HLS playback
- [Express.js](https://expressjs.com/) - Web framework
- [Font Awesome](https://fontawesome.com/) - Icons

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sthnaqvi/rtsp-stream-browser/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sthnaqvi/rtsp-stream-browser/discussions)
- **Email**: tauseef.naqvi786@gmail.com

## 🔗 Related Projects

- [node-rtsp-stream](https://github.com/kyriesent/node-rtsp-stream) - Alternative RTSP streaming
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - FFmpeg wrapper
- [hls.js](https://github.com/video-dev/hls.js/) - HLS JavaScript library

---

⭐ **Star this repository if you find it helpful!** 